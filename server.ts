import { join } from 'node:path';

const GLASSER_BASE = 'https://api.glasser.ai';
const PROVIDER = 'scrapecreators';
const ENDPOINT = '/v1/spotify/search';

type JsonObject = Record<string, unknown>;
type Song = { id: string; title: string; artist: string; artwork: string; url: string };
type SearchResult = { tracks: Song[]; runUrl: string; charge: string | null };
type GlasserRun = {
  id: string;
  status: string;
  run_url: string;
  output: unknown;
  charge_usd: string | null;
  provider_response: { http_status: number } | null;
};

class SearchError extends Error {
  constructor(message: string, readonly status = 502) { super(message); }
}

function object(value: unknown): JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}

export function normalizeTracks(output: unknown): Song[] {
  const data = object(output);
  if (data.success === false) throw new SearchError("Spotify search couldn't finish. Please try again.");
  const tracks = Array.isArray(data.tracksV2) ? data.tracksV2 : object(data.tracks).items;
  if (!Array.isArray(tracks)) throw new SearchError('Spotify returned an unexpected response. Please try again shortly.');
  const songs: Song[] = [];
  const seen = new Set<string>();
  for (const value of tracks) {
    const track = object(value);
    const id = typeof track.id === 'string' ? track.id : String(track.uri || '').split(':').pop() || '';
    if (!/^[A-Za-z0-9]{22}$/.test(id) || seen.has(id) || typeof track.name !== 'string') continue;
    const artists = Array.isArray(track.artists) ? track.artists : [];
    const artist = artists.map(value => {
      const person = object(value);
      return object(person.profile).name || person.name;
    }).filter((name): name is string => typeof name === 'string').join(', ');
    const album = object(track.albumOfTrack || track.album);
    const images = object(album.coverArt).sources || album.images;
    const artwork = Array.isArray(images) ? images.map(value => object(value).url).find(url => typeof url === 'string' && /^https:\/\/(?:i\.scdn\.co|image-cdn[^/]*\.spotifycdn\.com)\//.test(url)) : '';
    songs.push({ id, title: track.name, artist: artist || 'Unknown artist', artwork: typeof artwork === 'string' ? artwork : '', url: `https://open.spotify.com/track/${id}` });
    seen.add(id);
    if (songs.length === 8) break;
  }
  return songs;
}

export function createSpotifySearch(key: string) {
  const cache = new Map<string, { expires: number; result: SearchResult }>();
  const pending = new Map<string, Promise<SearchResult>>();
  let inspection: Promise<{ endpoint_version: number }> | null = null;

  async function glasser(path: string, body?: unknown, idempotencyKey?: string): Promise<unknown> {
    // Retry an uncertain Run once with the same idempotency key.
    for (let attempt = 0; attempt < 2; attempt++) {
      let response: Response;
      try {
        response = await fetch(`${GLASSER_BASE}${path}`, {
          method: body === undefined ? 'GET' : 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(55000),
        });
      } catch {
        if (idempotencyKey && attempt === 0) continue;
        throw new SearchError("The music shelf is taking too long to respond. Please try again.", 504);
      }
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) throw new SearchError('Music search needs a working Glasser key on the server.', 503);
        if (response.status === 402) throw new SearchError('Music search is out of credits. Please check the Glasser balance.', 503);
        if (response.status === 429) throw new SearchError('Music search is busy. Please wait a moment and try again.', 429);
        throw new SearchError("Couldn't reach the music shelf. Please try again.");
      }
      try { return await response.json(); }
      catch { throw new SearchError("The music shelf returned an unreadable response. Please try again."); }
    }
    throw new SearchError("Couldn't finish the search.");
  }

  async function execute(query: string): Promise<SearchResult> {
    if (!inspection) {
      inspection = glasser('/v1/endpoints/inspect', { provider: PROVIDER, endpoint: ENDPOINT }).then(value => {
        const contract = object(value);
        if (!Number.isInteger(contract.endpoint_version)) throw new SearchError('Music search is temporarily unavailable.');
        return { endpoint_version: contract.endpoint_version as number };
      }).catch(error => { inspection = null; throw error; });
    }
    const contract = await inspection;
    let run = await glasser('/v1/runs', { provider: PROVIDER, endpoint: ENDPOINT, endpoint_version: contract.endpoint_version, input: { query } }, crypto.randomUUID()) as GlasserRun;
    for (let poll = 0; ['QUEUED', 'RUNNING'].includes(run.status) && poll < 20; poll++) {
      if (!/^[A-Za-z0-9-]+$/.test(run.id)) throw new SearchError('Music search returned an invalid request.');
      await Bun.sleep(1000);
      run = await glasser(`/v1/runs/${run.id}`) as GlasserRun;
    }
    console.info(JSON.stringify({ event: 'spotify-search', status: run.status, charge: run.charge_usd, runUrl: run.run_url }));
    if (run.status !== 'COMPLETED' || !run.provider_response || run.provider_response.http_status < 200 || run.provider_response.http_status >= 300) {
      throw new SearchError("Spotify couldn't finish that search. Please try again.");
    }
    return { tracks: normalizeTracks(run.output), runUrl: run.run_url, charge: run.charge_usd };
  }

  return async (query: string): Promise<SearchResult> => {
    const cacheKey = query.toLocaleLowerCase();
    const cached = cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) return cached.result;
    const existing = pending.get(cacheKey);
    if (existing) return existing;
    const task = execute(query).then(result => {
      if (cache.size >= 50) cache.delete(cache.keys().next().value!);
      cache.set(cacheKey, { expires: Date.now() + 10 * 60 * 1000, result });
      return result;
    }).finally(() => pending.delete(cacheKey));
    pending.set(cacheKey, task);
    return task;
  };
}

if (import.meta.main) {
  const portArg = Bun.argv.find(arg => arg.startsWith('--port='));
  const port = Number(portArg?.slice(7) || 4173);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Choose a port between 1024 and 65535.');
  const keyFile = process.env.GLASSER_API_KEY_FILE;
  const raw = process.env.GLASSER_API_KEY || (keyFile ? await Bun.file(keyFile).text() : '');
  const key = raw.match(/gl_[A-Za-z0-9_-]+/)?.[0];
  if (!key) throw new Error('Set GLASSER_API_KEY_FILE to your existing Glasser API file, or inject GLASSER_API_KEY.');
  const search = createSpotifySearch(key);
  const page = join(import.meta.dir, 'index.html');
  const origins = new Set([`http://localhost:${port}`, `http://127.0.0.1:${port}`]);
  Bun.serve({
    port,
    hostname: '127.0.0.1',
    idleTimeout: 120,
    maxRequestBodySize: 2048,
    async fetch(request) {
      const url = new URL(request.url);
      if (!origins.has(url.origin)) return new Response('Forbidden', { status: 403 });
      const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' };
      if (url.pathname === '/api/spotify/search') {
        if (request.method !== 'POST') return Response.json({ error: 'Use POST to search.' }, { status: 405, headers });
        if (request.headers.get('origin') && !origins.has(request.headers.get('origin')!)) return Response.json({ error: 'This search is only available in the local demo.' }, { status: 403, headers });
        try {
          if (!request.headers.get('content-type')?.startsWith('application/json')) throw new SearchError('Send a JSON search request.', 415);
          const body = object(await request.json());
          const query = typeof body.query === 'string' ? body.query.trim().replace(/\s+/g, ' ') : '';
          if (query.length < 2 || query.length > 120) throw new SearchError('Enter a song or artist between 2 and 120 characters.', 400);
          return Response.json(await search(query), { headers });
        } catch (error) {
          if (error instanceof SearchError) return Response.json({ error: error.message }, { status: error.status, headers });
          if (error instanceof SyntaxError) return Response.json({ error: 'That search request was not valid JSON.' }, { status: 400, headers });
          return Response.json({ error: "Couldn't search right now. Please try again." }, { status: 500, headers });
        }
      }
      if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) return new Response(Bun.file(page), { headers });
      if (url.pathname === '/favicon.ico') return new Response(null, { status: 204 });
      return new Response('Not found', { status: 404 });
    },
  });
  console.info(`Homeroom is running at http://localhost:${port}/`);
}
