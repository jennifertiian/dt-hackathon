'use strict';
const { setTimeout: delay } = require('node:timers/promises');
const { randomUUID } = require('node:crypto');
const GLASSER_BASE = 'https://api.glasser.ai';
const PROVIDER = 'scrapecreators';
const ENDPOINT = '/v1/spotify/search';
class SearchError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
function normalizeTracks(output) {
  const data = object(output);
  if (data.success === false) throw new SearchError("Spotify search couldn't finish. Please try again.");
  const tracks = Array.isArray(data.tracksV2) ? data.tracksV2 : object(data.tracks).items;
  if (!Array.isArray(tracks)) throw new SearchError('Spotify returned an unexpected response. Please try again shortly.');
  const songs = [], seen = new Set();
  for (const value of tracks) {
    const track = object(value);
    const id = typeof track.id === 'string' ? track.id : String(track.uri || '').split(':').pop() || '';
    if (!/^[A-Za-z0-9]{22}$/.test(id) || seen.has(id) || typeof track.name !== 'string' || !track.name.trim()) continue;
    const artists = Array.isArray(track.artists) ? track.artists : [];
    const artist = artists.map(value => {
      const person = object(value); return object(person.profile).name || person.name;
    }).filter(name => typeof name === 'string').join(', ');
    const album = object(track.albumOfTrack || track.album);
    const images = object(album.coverArt).sources || album.images;
    const artwork = Array.isArray(images) ? images.map(value => object(value).url).find(url => typeof url === 'string' && /^https:\/\/(?:i\.scdn\.co|image-cdn[^/]*\.spotifycdn\.com)\//.test(url)) : '';
    songs.push({ id, title: track.name.trim().slice(0, 500), artist: artist.trim().slice(0, 500) || 'Unknown artist', artwork: artwork || '', url: `https://open.spotify.com/track/${id}` });
    seen.add(id);
    if (songs.length === 8) break;
  }
  return songs;
}
function createSpotifySearch(key, { fetchImpl = fetch, sleep = delay, timeoutMs = 15000, overallTimeoutMs = 60000 } = {}) {
  const cache = new Map(), pending = new Map();
  let inspection = null;
  async function glasser(path, body, idempotencyKey, signal) {
    // Retry an uncertain paid Run with the same idempotency key.
    for (let attempt = 0; attempt < 2; attempt++) {
      let response;
      try {
        response = await fetchImpl(`${GLASSER_BASE}${path}`, {
          method: body === undefined ? 'GET' : 'POST', redirect: 'error',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
        });
      } catch {
        if (idempotencyKey && attempt === 0 && !signal.aborted) continue;
        throw new SearchError('The music shelf is taking too long to respond. Please try again.', 504);
      }
      if (!response.ok) {
        if ([401, 403].includes(response.status)) throw new SearchError('Music search needs a working Glasser key on the server.', 503);
        if (response.status === 402) throw new SearchError('Music search is out of credits. Please check the Glasser balance.', 503);
        if (response.status === 429) throw new SearchError('Music search is busy. Please wait a moment and try again.', 429);
        throw new SearchError("Couldn't reach the music shelf. Please try again.");
      }
      try { return await response.json(); }
      catch { throw new SearchError('The music shelf returned an unreadable response. Please try again.'); }
    }
  }
  async function execute(query) {
    const signal = AbortSignal.timeout(overallTimeoutMs);
    if (!inspection) inspection = glasser('/v1/endpoints/inspect', { provider: PROVIDER, endpoint: ENDPOINT }, null, signal).then(value => {
      const contract = object(value);
      if (!Number.isInteger(contract.endpoint_version)) throw new SearchError('Music search is temporarily unavailable.');
      return contract.endpoint_version;
    }).catch(error => { inspection = null; throw error; });
    const endpoint_version = await inspection;
    let run = object(await glasser('/v1/runs', { provider: PROVIDER, endpoint: ENDPOINT, endpoint_version, input: { query } }, randomUUID(), signal));
    for (let poll = 0; ['QUEUED', 'RUNNING'].includes(run.status) && poll < 20; poll++) {
      if (!/^[A-Za-z0-9-]+$/.test(run.id)) throw new SearchError('Music search returned an invalid request.');
      try { await sleep(1000, undefined, { signal }); }
      catch { throw new SearchError('Music search took too long. Please try again.', 504); }
      run = object(await glasser(`/v1/runs/${run.id}`, undefined, null, signal));
    }
    if (run.status !== 'COMPLETED' || !run.provider_response || run.provider_response.http_status < 200 || run.provider_response.http_status >= 300) throw new SearchError("Spotify couldn't finish that search. Please try again.");
    return { tracks: normalizeTracks(run.output) };
  }
  return async query => {
    if (!key) throw new SearchError('Music search is not configured yet.', 503);
    const cacheKey = query.toLocaleLowerCase();
    const cached = cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) return cached.result;
    if (pending.has(cacheKey)) return pending.get(cacheKey);
    const task = execute(query).then(result => {
      if (cache.size >= 50) cache.delete(cache.keys().next().value);
      cache.set(cacheKey, { expires: Date.now() + 10 * 60 * 1000, result }); return result;
    }).finally(() => pending.delete(cacheKey));
    pending.set(cacheKey, task); return task;
  };
}
module.exports = { createSpotifySearch, normalizeTracks, SearchError };
