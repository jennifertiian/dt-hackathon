'use strict';

// A separate, loopback-only setup utility. Directory tokens never leave this process.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DOMAIN = 'berkeley.edu';
const SCOPE = 'https://www.googleapis.com/auth/admin.directory.user.readonly';
const COOKIE = 'homeroom_directory';
const SESSION_MS = 30 * 60 * 1000;
const STATE_MS = 10 * 60 * 1000;
const random = () => crypto.randomBytes(32).toString('base64url');
const escapeHTML = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

class DirectoryError extends Error {
  constructor(code) { super(code); this.code = code; }
}

async function googleJSON(fetchImpl, url, options = {}) {
  const response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(30_000), redirect: 'error' });
  if (!response.ok) {
    if (response.status === 403 || response.status === 429) {
      // Only inspect documented reason identifiers. Never render or log Google's
      // messages/metadata, which can contain project IDs, account details or URLs.
      let problem;
      try { problem = await response.json(); } catch { /* A non-JSON denial remains a generic denial. */ }
      const details = Array.isArray(problem?.error?.details) ? problem.error.details : [];
      const legacy = Array.isArray(problem?.error?.errors) ? problem.error.errors : [];
      const reasons = new Set([
        ...details.filter(detail => detail?.['@type'] === 'type.googleapis.com/google.rpc.ErrorInfo').map(detail => detail.reason),
        ...legacy.map(detail => detail?.reason),
      ].filter(reason => typeof reason === 'string'));
      if (reasons.has('SERVICE_DISABLED')) throw new DirectoryError('api-disabled');
      if (reasons.has('accessNotConfigured')) throw new DirectoryError('api-config');
      if (reasons.has('ACCESS_TOKEN_SCOPE_INSUFFICIENT') || reasons.has('insufficient_scope')) throw new DirectoryError('scope');
      if (response.status === 429 || ['RATE_LIMIT_EXCEEDED', 'QUOTA_EXCEEDED', 'rateLimitExceeded', 'userRateLimitExceeded', 'dailyLimitExceeded', 'quotaExceeded'].some(reason => reasons.has(reason))) throw new DirectoryError('quota');
      // insufficientPermissions is ambiguous: it does not prove missing scopes.
      throw new DirectoryError('permission');
    }
    throw new DirectoryError('google');
  }
  return response.json();
}

async function listDirectoryPeople(accessToken, fetchImpl = fetch) {
  const people = new Map();
  const tokens = new Set();
  let pageToken;
  do {
    const url = new URL('https://admin.googleapis.com/admin/directory/v1/users');
    url.search = new URLSearchParams({ domain: DOMAIN, maxResults: '500', orderBy: 'email', viewType: 'admin_view', fields: 'users(id,primaryEmail,name/fullName,suspended),nextPageToken' });
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const data = await googleJSON(fetchImpl, url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
    if (data.users !== undefined && !Array.isArray(data.users)) throw new DirectoryError('google');
    for (const user of data.users || []) {
      if (typeof user.id !== 'string' || !user.id || typeof user.primaryEmail !== 'string' || !user.primaryEmail.toLowerCase().endsWith(`@${DOMAIN}`)) continue;
      people.set(user.id, {
        ID: user.id,
        PrimaryEmail: user.primaryEmail.toLowerCase(),
        DisplayName: typeof user.name?.fullName === 'string' ? user.name.fullName : user.primaryEmail,
        PersonID: null,
        Suspended: user.suspended === true,
      });
    }
    pageToken = data.nextPageToken;
    if (pageToken) {
      if (typeof pageToken !== 'string' || tokens.has(pageToken) || tokens.size >= 10_000) throw new DirectoryError('google');
      tokens.add(pageToken);
    }
  } while (pageToken);
  return [...people.values()];
}

async function exchangeAndList({ code, verifier, redirectURI, clientID, clientSecret, fetchImpl = fetch }) {
  const tokens = await googleJSON(fetchImpl, 'https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, code_verifier: verifier, client_id: clientID, client_secret: clientSecret, redirect_uri: redirectURI, grant_type: 'authorization_code' }).toString(),
  });
  if (typeof tokens.access_token !== 'string' || !tokens.access_token) throw new DirectoryError('google');
  // hd in an authorization URL is only a hint. Verify Google's authenticated userinfo.
  const identity = await googleJSON(fetchImpl, 'https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  if (identity.email_verified !== true || identity.hd !== DOMAIN || typeof identity.email !== 'string' || !identity.email.toLowerCase().endsWith(`@${DOMAIN}`)) throw new DirectoryError('domain');
  if (tokens.scope && !tokens.scope.split(' ').includes(SCOPE)) throw new DirectoryError('scope');
  return listDirectoryPeople(tokens.access_token, fetchImpl);
}

function mockDirectoryPeople() {
  return ['Alex', 'Jordan', 'Sam', 'Casey', 'Riley', 'Avery', 'Morgan', 'Taylor', 'Quinn'].map((name, index) => ({
    ID: `mock-directory-${index + 1}`, PrimaryEmail: `mock.${name.toLowerCase()}@${DOMAIN}`, DisplayName: `${name} (demo person)`, PersonID: null, Suspended: false,
  }));
}

function readRosterFile(filePath = path.resolve(__dirname, '../data/directory-roster.json')) {
  if (!fs.existsSync(filePath)) return null;
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!['mock', 'google-directory'].includes(data.Source) || data.Domain !== DOMAIN || !Array.isArray(data.DirectoryPeople)) throw new Error('Invalid directory roster format');
  for (const person of data.DirectoryPeople) {
    if (typeof person.ID !== 'string' || !person.ID || typeof person.PrimaryEmail !== 'string' || !person.PrimaryEmail.toLowerCase().endsWith(`@${DOMAIN}`) || typeof person.DisplayName !== 'string' || person.PersonID !== null || typeof person.Suspended !== 'boolean') throw new Error('Invalid directory person');
  }
  return data;
}

function saveRoster(filePath, people, source) {
  const record = { Source: source, Domain: DOMAIN, SyncedAt: new Date().toISOString(), DirectoryPeople: people };
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.${random()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, filePath);
  return record;
}

function readEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return require('node:util').parseEnv(fs.readFileSync(filePath, 'utf8'));
}

function saveGoogleCredentials(filePath, clientID, clientSecret) {
  let content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  // Preserve every unrelated key, including the AI keys. Reject newlines before calling.
  content = content.split('\n').filter(line => !/^\s*(?:export\s+)?GOOGLE_CLIENT_(?:ID|SECRET)\s*=/.test(line)).join('\n').replace(/\n*$/, '\n');
  content += `GOOGLE_CLIENT_ID=${JSON.stringify(clientID)}\nGOOGLE_CLIENT_SECRET=${JSON.stringify(clientSecret)}\n`;
  fs.writeFileSync(filePath, content, { mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
}

async function readForm(req) {
  if (!/^application\/x-www-form-urlencoded(?:;|$)/i.test(req.headers['content-type'] || '')) throw new DirectoryError('form');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16_384) throw new DirectoryError('form');
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

function createDirectoryServer(options = {}) {
  const root = options.root || path.resolve(__dirname, '..');
  const envPath = options.envPath || path.join(root, '.env');
  const rosterPath = options.rosterPath || path.join(root, 'data/directory-roster.json');
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const sessions = new Map();
  let busy = false;
  const credentials = () => {
    const local = readEnv(envPath);
    return { clientID: local.GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID, clientSecret: local.GOOGLE_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET };
  };
  const missingCredentials = ({ clientID, clientSecret }) => [!clientID && 'GOOGLE_CLIENT_ID', !clientSecret && 'GOOGLE_CLIENT_SECRET'].filter(Boolean);

  function localHost(req) {
    const port = server.address()?.port;
    return [`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host);
  }
  function sameOrigin(req) {
    // Some embedded browsers omit Origin on native form navigations. Every
    // mutation still requires a cookie-bound unpredictable CSRF token below.
    if (req.headers['sec-fetch-site'] === 'cross-site') return false;
    if (!req.headers.origin || req.headers.origin === 'null') return true;
    try {
      const origin = new URL(req.headers.origin);
      return origin.protocol === 'http:' && localHost({ headers: { host: origin.host } });
    } catch { return false; }
  }
  function respond(res, status, body) { res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(body); }
  function redirect(res, location = '/') { res.writeHead(303, { Location: location }); res.end(); }
  function session(req, res) {
    const now = Date.now();
    for (const [key, value] of sessions) if (value.expires < now) sessions.delete(key);
    const id = (req.headers.cookie || '').split(';').map(item => item.trim()).find(item => item.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
    if (id && sessions.has(id)) return sessions.get(id);
    const nextID = random();
    const value = { csrf: random(), expires: now + SESSION_MS, notice: '' };
    sessions.set(nextID, value);
    res.setHeader('Set-Cookie', `${COOKIE}=${nextID}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MS / 1000}`);
    return value;
  }
  function page(res, browserSession) {
    const { clientID, clientSecret } = credentials();
    const missing = missingCredentials({ clientID, clientSecret });
    let roster;
    try { roster = readRosterFile(rosterPath); } catch { /* Do not expose raw file contents. */ }
    const hidden = `<input type="hidden" name="csrf" value="${browserSession.csrf}">`;
    const notice = browserSession.notice;
    browserSession.notice = '';
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>homeroom · directory setup</title>
<style>body{background:#f4f0e6;color:#45392e;font:16px/1.55 system-ui,sans-serif;margin:0}main{max-width:780px;margin:48px auto;padding:0 24px}h1{font-size:32px;margin:0}h2{font-size:21px}section,.notice{background:#fffdf7;border:1px solid #d5cebc;border-radius:14px;padding:22px;margin:20px 0}a{color:#315945}button{background:#45634b;color:white;border:0;border-radius:8px;padding:12px 18px;font:inherit;cursor:pointer}button.secondary{background:#ebe7db;color:#45392e}label{display:block;font-weight:600;margin:14px 0}input{box-sizing:border-box;display:block;width:100%;font:inherit;border:1px solid #aaa18d;border-radius:6px;padding:10px}code{overflow-wrap:anywhere;background:#eee9dc;padding:2px 5px}small{color:#655d4f}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:8px;border-bottom:1px solid #e5decd;overflow-wrap:anywhere}.badge{display:inline-block;background:#e9e4d7;border-radius:5px;padding:2px 8px}p{margin:12px 0}</style>
<main><p>homeroom ✿ · local setup</p><h1>Bring in your Berkeley directory</h1><p>Connect an authorized Berkeley Google Workspace account, or use clearly labeled demo people. This utility runs only on your computer.</p>
${notice ? `<div id="notice" class="notice" role="alert" tabindex="-1">${escapeHTML(notice)}</div>` : ''}
<section id="google-setup"><h2>1. Set up Google sign-in</h2><p>Google OAuth credentials are <strong>${clientID && clientSecret ? 'configured' : 'not configured yet'}</strong>. Your existing AI keys remain private in <code>.env</code>.</p><p>Reading saved configuration from <code>${escapeHTML(envPath)}</code>. Save changes in your editor before continuing. This page rechecks the file each time; restarting is unnecessary.</p><ol><li>Open <a target="_blank" rel="noreferrer" href="https://console.cloud.google.com/apis/library/admin.googleapis.com">Google Cloud → Admin SDK API</a> and enable it in your project.</li><li>Configure the <a target="_blank" rel="noreferrer" href="https://console.cloud.google.com/auth/overview">OAuth consent screen</a>. If the app is in testing, add your Berkeley email as a test user. Request <code>${SCOPE}</code>, plus OpenID email/profile.</li><li>Create a <a target="_blank" rel="noreferrer" href="https://console.cloud.google.com/auth/clients">Web application OAuth client</a> with this exact authorized redirect URI: <code>http://127.0.0.1:${server.address().port}/oauth/callback</code>.</li><li>Save its client ID and secret below. They stay in the ignored local <code>.env</code> file; they are never shown again.</li></ol>
<p>If you enter credentials in this form, click <strong>Save Google credentials</strong> before signing in; typing alone does not save them. If you edit <code>.env</code> in an editor instead, save that file to disk and use <strong>Recheck saved .env</strong>.</p><form action="/setup" method="post">${hidden}<label>Google client ID<input name="clientID" autocomplete="off" placeholder="…apps.googleusercontent.com" required maxlength="512"></label><label>Google client secret<input name="clientSecret" type="password" autocomplete="off" required maxlength="512"></label><button>Save Google credentials</button></form></section>
<section><h2>2. Sign in and import</h2><p><strong>A Berkeley email alone does not grant access to the whole directory.</strong> The account needs the university's permission to list users, typically a Workspace administrator with user-read access. If Berkeley blocks this permission, use the demo roster below.</p><p>Google will ask for read-only directory access. Import fetches all result pages and saves only ID, primary email, display name and suspension status. OAuth tokens stay in memory and are discarded after import.</p>
<p id="import-status" role="status">${missing.length ? `Missing saved variables: <code>${missing.join('</code>, <code>')}</code>. Add them to the configuration file above, save it, then try again.` : 'Both Google credential variables are present. Sign in below to request permission.'}</p><p><a href="/?recheck=1#notice">Recheck saved .env</a></p><form action="/connect" method="post">${hidden}<button aria-describedby="import-status">Sign in with Google and import roster</button></form></section>
<section><h2>Demo fallback</h2><p>Generate nine fictional people in the same record format. They are explicitly marked as mocks and are not actual Berkeley accounts. This replaces the currently saved roster.</p><form action="/mock" method="post">${hidden}<button class="secondary">Use mock directory</button></form></section>
<section><h2>Saved roster</h2>${roster ? `<p><span class="badge">${roster.Source === 'mock' ? 'MOCK DATA' : 'GOOGLE DIRECTORY'}</span> ${roster.DirectoryPeople.length} records · ${escapeHTML(roster.SyncedAt)}</p><p>Saved to <code>data/directory-roster.json</code>. This file is excluded from Git and is ready for the application backend to import.</p><table><thead><tr><th>Name</th><th>Email</th><th>Status</th></tr></thead><tbody>${roster.DirectoryPeople.slice(0, 50).map(person => `<tr><td>${escapeHTML(person.DisplayName)}</td><td>${escapeHTML(person.PrimaryEmail)}</td><td>${person.Suspended ? 'Suspended' : 'Active'}</td></tr>`).join('')}</tbody></table>${roster.DirectoryPeople.length > 50 ? '<p>Showing the first 50 records.</p>' : ''}` : '<p>No roster saved yet.</p>'}</section><p><small>Directory membership does not create an account or make someone eligible for matching. No directory data is sent to AI providers.</small></p></main></html>`);
  }

  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://accounts.google.com; frame-ancestors 'none'; base-uri 'none'");
    if (!localHost(req)) return respond(res, 403, 'This setup utility only accepts local connections.');
    const url = new URL(req.url, `http://${req.headers.host}`);
    const browserSession = session(req, res);
    try {
      if (req.method === 'GET' && url.pathname === '/') {
        if (url.searchParams.get('recheck') === '1') {
          const missing = missingCredentials(credentials());
          browserSession.notice = missing.length ? `Rechecked the saved configuration. Missing: ${missing.join(', ')}. Save these variables in ${envPath}, then try again.` : 'Rechecked the saved configuration. Both Google credential variables are present. You can now sign in with Google.';
        }
        return page(res, browserSession);
      }
      if (req.method === 'GET' && url.pathname === '/oauth/callback') {
        const pending = browserSession.oauth;
        delete browserSession.oauth; // one-use, including denial and failed attempts
        if (!pending || pending.expires < Date.now() || !url.searchParams.get('state') || url.searchParams.get('state') !== pending.state) return respond(res, 400, 'Sign-in state is invalid or expired. Return to the setup page and try again.');
        if (url.searchParams.has('error')) { browserSession.notice = 'Google permission was not granted. You can try again or use the mock directory.'; return redirect(res); }
        const code = url.searchParams.get('code');
        if (!code) return respond(res, 400, 'No authorization code was returned.');
        if (busy) return respond(res, 409, 'Another roster import is running. Try again shortly.');
        busy = true;
        try {
          const { clientID, clientSecret } = credentials();
          const people = await exchangeAndList({ code, verifier: pending.verifier, redirectURI: pending.redirectURI, clientID, clientSecret, fetchImpl });
          saveRoster(rosterPath, people, 'google-directory');
          browserSession.notice = `Imported ${people.length} directory records. The roster is saved locally and is not committed to Git.`;
        } finally { busy = false; }
        return redirect(res);
      }
      if (req.method === 'POST' && ['/setup', '/connect', '/mock'].includes(url.pathname)) {
        if (!sameOrigin(req)) return respond(res, 403, 'A same-origin local form is required.');
        const form = await readForm(req);
        if (form.get('csrf') !== browserSession.csrf) return respond(res, 403, 'The form expired. Reload the setup page and try again.');
        if (url.pathname === '/setup') {
          const clientID = form.get('clientID')?.trim();
          const clientSecret = form.get('clientSecret')?.trim();
          if (!clientID || !/^[a-zA-Z0-9_.-]+\.apps\.googleusercontent\.com$/.test(clientID) || clientID.length > 512 || !clientSecret || !/^[a-zA-Z0-9_-]{8,512}$/.test(clientSecret)) return respond(res, 400, 'Enter a Google web client ID and client secret without spaces or line breaks.');
          saveGoogleCredentials(envPath, clientID, clientSecret);
          browserSession.notice = 'Google credentials saved locally. You can now sign in and import the directory.';
          return redirect(res);
        }
        if (url.pathname === '/mock') {
          if (busy) return respond(res, 409, 'Wait for the running roster import to finish.');
          saveRoster(rosterPath, mockDirectoryPeople(), 'mock');
          browserSession.notice = 'Saved 9 fictional directory records, explicitly labeled as MOCK DATA.';
          return redirect(res);
        }
        const { clientID, clientSecret } = credentials();
        const missing = missingCredentials({ clientID, clientSecret });
        if (missing.length) {
          browserSession.notice = `Google sign-in cannot start yet. Missing saved variables: ${missing.join(', ')}. If you filled the form above, click Save Google credentials first. If you edited ${envPath}, save that file to disk, then select Recheck saved .env or try sign-in again. Credential values are never shown here.`;
          return redirect(res, '/#notice');
        }
        const state = random();
        const verifier = random();
        // Always use one canonical callback host so the registered redirect URI is stable.
        const redirectURI = `http://127.0.0.1:${server.address().port}/oauth/callback`;
        if (req.headers.host !== `127.0.0.1:${server.address().port}`) {
          browserSession.notice = 'Use 127.0.0.1 instead of localhost for Google sign-in so the registered callback and session match.';
          return redirect(res, `http://127.0.0.1:${server.address().port}/`);
        }
        browserSession.oauth = { state, verifier, redirectURI, expires: Date.now() + STATE_MS };
        const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        auth.search = new URLSearchParams({ client_id: clientID, redirect_uri: redirectURI, response_type: 'code', scope: `openid email profile ${SCOPE}`, state, hd: DOMAIN, prompt: 'consent select_account', access_type: 'online', code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' });
        return redirect(res, auth.toString());
      }
      return respond(res, 404, 'Not found.');
    } catch (error) {
      const notices = {
        permission: 'Google denied directory access without a specific configuration or scope reason. Check the Admin SDK API and OAuth permission setup. Listing the Berkeley roster also requires authorized Workspace user-read permissions; a Berkeley student email alone is not sufficient. University policy may restrict access. Use the mock roster if this access is unavailable. The existing roster was preserved.',
        'api-disabled': 'Google reports that the Admin SDK API is disabled for the OAuth project. Enable Admin SDK API in the Google Cloud project that owns this OAuth client, wait for the change to take effect, then sign in again. This is an API configuration error, not a diagnosis of your university account permissions. The existing roster was preserved.',
        'api-config': 'Google reports that this OAuth project is not configured to access the directory API. Confirm Admin SDK API is enabled in the project that owns this OAuth client and that the project is active and allowed to use the API, then retry. The existing roster was preserved.',
        scope: 'Google did not grant the required directory read-only scope. Configure the OAuth consent screen for https://www.googleapis.com/auth/admin.directory.user.readonly, then sign in again and grant that permission. Workspace policy may require approval. The existing roster was preserved.',
        quota: 'Google reports a directory request rate or quota limit. Wait before retrying and check the OAuth project’s Admin SDK API quota if the problem continues. The existing roster was preserved.',
        domain: 'Sign in with a verified Berkeley Google Workspace account. No directory was imported.',
        google: 'Google could not complete the directory import. Check the OAuth client, enabled Admin SDK API, consent scope and account permissions, then try again. The existing roster was preserved.',
        form: 'The setup form was invalid or too large. Reload and try again.',
      };
      browserSession.notice = notices[error.code] || 'The directory utility could not complete this operation. Check the local file permissions and Google setup, then try again.';
      return redirect(res);
    }
  });
  server.requestTimeout = 60_000;
  return server;
}

if (require.main === module) {
  const server = createDirectoryServer();
  server.listen(8878, '127.0.0.1', () => console.log('Directory setup is ready: http://127.0.0.1:8878/'));
  server.on('error', () => { console.error('Could not start directory setup. Port 8878 may already be in use.'); process.exitCode = 1; });
}

module.exports = { DOMAIN, SCOPE, DirectoryError, createDirectoryServer, exchangeAndList, listDirectoryPeople, mockDirectoryPeople, readRosterFile, saveRoster };
