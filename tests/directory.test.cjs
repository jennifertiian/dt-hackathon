'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createDirectoryServer, listDirectoryPeople, exchangeAndList, readRosterFile, SCOPE } = require('../server/directory-server.cjs');

const json = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });

async function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'homeroom-directory-'));
  const server = createDirectoryServer({ root, env: {}, ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const response = await fetch(base);
  const cookie = response.headers.get('set-cookie').split(';')[0];
  const html = await response.text();
  const csrf = html.match(/name="csrf" value="([^"]+)"/)[1];
  const post = (endpoint, values = {}, headers = {}) => fetch(base + endpoint, {
    method: 'POST', redirect: 'manual', headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/x-www-form-urlencoded', ...headers }, body: new URLSearchParams({ csrf, ...values }),
  });
  return { root, server, base, cookie, csrf, html, post };
}

test('directory listing follows pagination, minimizes fields and filters other domains', async () => {
  const requests = [];
  const rows = await listDirectoryPeople('test-token', async (url, options) => {
    requests.push({ url: new URL(url), options });
    return requests.length === 1
      ? json({ users: [{ id: 'one', primaryEmail: 'One@berkeley.edu', name: { fullName: 'First' }, suspended: false, password: 'must-not-be-saved' }], nextPageToken: 'page-two' })
      : json({ users: [{ id: 'two', primaryEmail: 'two@berkeley.edu', name: { fullName: 'Second' }, suspended: true }, { id: 'external', primaryEmail: 'external@example.com' }] });
  });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url.searchParams.get('domain'), 'berkeley.edu');
  assert.equal(requests[0].url.searchParams.get('viewType'), 'admin_view');
  assert.equal(requests[1].url.searchParams.get('pageToken'), 'page-two');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer test-token');
  assert.deepEqual(rows, [
    { ID: 'one', PrimaryEmail: 'one@berkeley.edu', DisplayName: 'First', PersonID: null, Suspended: false },
    { ID: 'two', PrimaryEmail: 'two@berkeley.edu', DisplayName: 'Second', PersonID: null, Suspended: true },
  ]);
});

test('directory errors do not expose upstream secret-bearing responses', async () => {
  await assert.rejects(listDirectoryPeople('test-token', async () => json({ detail: 'sensitive-upstream' }, 403)), { code: 'permission', message: 'permission' });
  await assert.rejects(listDirectoryPeople('test-token', async () => json({ detail: 'sensitive-upstream' }, 500)), { code: 'google', message: 'google' });
});

test('documented Google reason codes distinguish configuration, scopes and quota without exposing details', async () => {
  const cases = [
    [{ error: { details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'SERVICE_DISABLED', metadata: { project: 'private-project' } }] } }, 403, 'api-disabled'],
    [{ error: { errors: [{ reason: 'accessNotConfigured' }] } }, 403, 'api-config'],
    [{ error: { details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' }] } }, 403, 'scope'],
    [{ error: { errors: [{ reason: 'insufficientPermissions' }] } }, 403, 'permission'],
    [{ error: { errors: [{ reason: 'userRateLimitExceeded' }] } }, 403, 'quota'],
    [{ error: { message: 'private-project-and-token' } }, 429, 'quota'],
    [{ error: { details: 'untrusted-shape', errors: null, message: 'private-project-and-token' } }, 403, 'permission'],
  ];
  for (const [problem, status, code] of cases) {
    await assert.rejects(listDirectoryPeople('fixture-token', async () => json(problem, status)), { code, message: code });
  }
});

test('repeated pagination tokens fail without publishing a partial roster', async () => {
  let calls = 0;
  await assert.rejects(listDirectoryPeople('test-token', async () => { calls++; return json({ nextPageToken: 'repeated' }); }), { code: 'google' });
  assert.equal(calls, 2);
});

test('OAuth exchange uses PKCE and rejects an unverified or non-Berkeley identity before fetching directory', async () => {
  for (const identity of [
    { email: 'a@berkeley.edu', email_verified: false, hd: 'berkeley.edu' },
    { email: 'a@example.com', email_verified: true, hd: 'example.com' },
    { email: 'a@berkeley.edu', email_verified: true },
  ]) {
    const calls = [];
    await assert.rejects(exchangeAndList({ code: 'code', verifier: 'verifier', redirectURI: 'http://127.0.0.1:8878/oauth/callback', clientID: 'id', clientSecret: 'secret', fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (calls.length === 1) return json({ access_token: 'access', scope: SCOPE });
      return json(identity);
    } }), { code: 'domain' });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, 'https://oauth2.googleapis.com/token');
    assert.equal(new URLSearchParams(calls[0].options.body).get('code_verifier'), 'verifier');
  }
});

test('local setup requires local Host, same-origin form and browser CSRF token', async t => {
  const app = await fixture(t);
  assert.match(app.html, /not configured yet/);
  assert.equal((await app.post('/mock', {}, { Origin: 'https://example.com' })).status, 403);
  assert.equal((await app.post('/mock', {}, { Origin: 'http://localhost:1234' })).status, 403);
  assert.equal((await app.post('/mock', { csrf: 'wrong-token' })).status, 403);
  assert.equal(fs.existsSync(path.join(app.root, 'data/directory-roster.json')), false);
  const status = await new Promise((resolve, reject) => {
    const req = http.request(app.base, { headers: { Host: 'attacker.example' } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject); req.end();
  });
  assert.equal(status, 403);
});

test('mock roster is persistent, labeled and uses canonical records', async t => {
  const app = await fixture(t);
  const response = await app.post('/mock');
  assert.equal(response.status, 303);
  const roster = readRosterFile(path.join(app.root, 'data/directory-roster.json'));
  assert.equal(roster.Source, 'mock');
  assert.equal(roster.DirectoryPeople.length, 9);
  assert.equal(new Set(roster.DirectoryPeople.map(person => person.ID)).size, 9);
  assert.ok(roster.DirectoryPeople.every(person => person.PersonID === null && person.Suspended === false));
  const page = await fetch(app.base, { headers: { Cookie: app.cookie } });
  assert.match(await page.text(), /MOCK DATA/);
});

test('credential setup preserves unrelated keys and never echoes secrets', async t => {
  const app = await fixture(t);
  fs.writeFileSync(path.join(app.root, '.env'), 'CHATGPT_API_KEY=fixture-ai-secret\nGLASSER_API_KEY=fixture-other-secret\nGOOGLE_CLIENT_ID=old\nGOOGLE_CLIENT_SECRET=old\n');
  assert.equal((await app.post('/setup', { clientID: '123-test.apps.googleusercontent.com', clientSecret: 'fixture-google-secret' })).status, 303);
  const saved = require('node:util').parseEnv(fs.readFileSync(path.join(app.root, '.env'), 'utf8'));
  assert.equal(saved.CHATGPT_API_KEY, 'fixture-ai-secret');
  assert.equal(saved.GLASSER_API_KEY, 'fixture-other-secret');
  assert.equal(saved.GOOGLE_CLIENT_SECRET, 'fixture-google-secret');
  const page = await fetch(app.base, { headers: { Cookie: app.cookie } });
  const text = await page.text();
  assert.match(text, /<strong>configured<\/strong>/);
  assert.doesNotMatch(text, /fixture-ai-secret|fixture-other-secret|fixture-google-secret/);
  assert.equal((await app.post('/setup', { clientID: '123-test.apps.googleusercontent.com', clientSecret: 'secret\nINJECTED=key' })).status, 400);
});

test('missing credentials keep sign-in actionable and display a clear anchored explanation', async t => {
  const app = await fixture(t);
  const button = app.html.match(/<form action="\/connect"[\s\S]*?<\/form>/)[0];
  assert.doesNotMatch(button, /\bdisabled\b/);
  assert.match(app.html, /id="import-status"[^>]*>Missing saved variables/);
  assert.match(app.html, /GOOGLE_CLIENT_ID/);
  assert.match(app.html, /GOOGLE_CLIENT_SECRET/);
  assert.ok(app.html.includes(path.join(app.root, '.env')));
  const response = await app.post('/connect');
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/#notice');
  const page = await fetch(app.base, { headers: { Cookie: app.cookie } });
  const html = await page.text();
  assert.match(html, /id="notice"[^>]*role="alert"/);
  assert.match(html, /Google sign-in cannot start yet/);
  assert.match(html, /Missing saved variables: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET/);
});

test('saved env edits are reread without restart and sign-in uses the newly configured OAuth client', async t => {
  const app = await fixture(t);
  fs.writeFileSync(path.join(app.root, '.env'), 'GOOGLE_CLIENT_ID=123-live.apps.googleusercontent.com\n');
  let response = await app.post('/connect');
  assert.equal(response.headers.get('location'), '/#notice');
  let html = await (await fetch(app.base + '/?recheck=1', { headers: { Cookie: app.cookie } })).text();
  assert.match(html, /Missing: GOOGLE_CLIENT_SECRET\./);
  assert.doesNotMatch(html, /Missing: GOOGLE_CLIENT_ID/);
  fs.appendFileSync(path.join(app.root, '.env'), 'GOOGLE_CLIENT_SECRET=saved-google-secret\n');
  html = await (await fetch(app.base + '/?recheck=1', { headers: { Cookie: app.cookie } })).text();
  assert.match(html, /Both Google credential variables are present/);
  assert.doesNotMatch(html, /saved-google-secret/);
  response = await app.post('/connect');
  assert.equal(response.status, 303);
  const auth = new URL(response.headers.get('location'));
  assert.equal(auth.origin, 'https://accounts.google.com');
  assert.equal(auth.searchParams.get('client_id'), '123-live.apps.googleusercontent.com');
  assert.equal(auth.searchParams.get('redirect_uri'), app.base + '/oauth/callback');
  assert.ok(auth.searchParams.get('state'));
  assert.doesNotMatch(auth.toString(), /saved-google-secret/);
});

test('OAuth state is browser-bound and one-use, and denial preserves existing roster', async t => {
  let calls = 0;
  const app = await fixture(t, { env: { GOOGLE_CLIENT_ID: 'fixture.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'fixture-secret' }, fetchImpl: async () => { calls++; throw new Error('Must not fetch on state failure or denial'); } });
  await app.post('/mock');
  const before = fs.readFileSync(path.join(app.root, 'data/directory-roster.json'), 'utf8');
  const connect = await app.post('/connect');
  const auth = new URL(connect.headers.get('location'));
  assert.equal(auth.origin, 'https://accounts.google.com');
  assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(auth.searchParams.get('scope').includes(SCOPE));
  assert.ok(auth.searchParams.get('state'));
  const callback = `/oauth/callback?state=${auth.searchParams.get('state')}&error=access_denied`;
  const otherBrowser = await fetch(app.base + callback, { redirect: 'manual' });
  assert.equal(otherBrowser.status, 400);
  const denied = await fetch(app.base + callback, { redirect: 'manual', headers: { Cookie: app.cookie } });
  assert.equal(denied.status, 303);
  assert.equal((await fetch(app.base + callback, { redirect: 'manual', headers: { Cookie: app.cookie } })).status, 400);
  assert.equal(calls, 0);
  assert.equal(fs.readFileSync(path.join(app.root, 'data/directory-roster.json'), 'utf8'), before);
});

test('full OAuth callback imports canonical roster without persisting tokens', async t => {
  const requests = [];
  const app = await fixture(t, {
    env: { GOOGLE_CLIENT_ID: 'fixture.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'fixture-secret' },
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (url === 'https://oauth2.googleapis.com/token') return json({ access_token: 'sensitive-access-token', refresh_token: 'sensitive-refresh-token', scope: SCOPE });
      if (url === 'https://openidconnect.googleapis.com/v1/userinfo') return json({ email: 'staff@berkeley.edu', email_verified: true, hd: 'berkeley.edu' });
      return json({ users: [{ id: 'google-1', primaryEmail: 'one@berkeley.edu', name: { fullName: '<First>' }, suspended: false }] });
    },
  });
  const connect = await app.post('/connect');
  const auth = new URL(connect.headers.get('location'));
  const callback = await fetch(app.base + `/oauth/callback?state=${auth.searchParams.get('state')}&code=fixture-code`, { redirect: 'manual', headers: { Cookie: app.cookie } });
  assert.equal(callback.status, 303);
  const saved = fs.readFileSync(path.join(app.root, 'data/directory-roster.json'), 'utf8');
  assert.equal(JSON.parse(saved).Source, 'google-directory');
  assert.doesNotMatch(saved, /sensitive-access-token|sensitive-refresh-token|fixture-secret|fixture-code/);
  assert.equal(requests.length, 3);
  const body = new URLSearchParams(requests[0].options.body);
  assert.equal(body.get('redirect_uri'), app.base + '/oauth/callback');
  assert.equal(require('node:crypto').createHash('sha256').update(body.get('code_verifier')).digest('base64url'), auth.searchParams.get('code_challenge'));
  const page = await fetch(app.base, { headers: { Cookie: app.cookie } });
  const html = await page.text();
  assert.match(html, /&lt;First&gt;/);
  assert.doesNotMatch(html, /sensitive-access-token|sensitive-refresh-token/);
});

test('directory 403 becomes an accurate permissions explanation and preserves saved roster', async t => {
  const app = await fixture(t, {
    env: { GOOGLE_CLIENT_ID: 'fixture.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'fixture-secret' },
    fetchImpl: async url => {
      if (url === 'https://oauth2.googleapis.com/token') return json({ access_token: 'token', scope: SCOPE });
      if (url === 'https://openidconnect.googleapis.com/v1/userinfo') return json({ email: 'student@berkeley.edu', email_verified: true, hd: 'berkeley.edu' });
      return json({ error: 'upstream-private-detail' }, 403);
    },
  });
  await app.post('/mock');
  const before = fs.readFileSync(path.join(app.root, 'data/directory-roster.json'), 'utf8');
  const auth = new URL((await app.post('/connect')).headers.get('location'));
  await fetch(app.base + `/oauth/callback?state=${auth.searchParams.get('state')}&code=fixture-code`, { redirect: 'manual', headers: { Cookie: app.cookie } });
  const html = await (await fetch(app.base, { headers: { Cookie: app.cookie } })).text();
  assert.match(html, /Google denied directory access/);
  assert.match(html, /student email alone is not sufficient/);
  assert.doesNotMatch(html, /upstream-private-detail/);
  assert.equal(fs.readFileSync(path.join(app.root, 'data/directory-roster.json'), 'utf8'), before);
});

test('known API-disabled and scope denials show specific safe guidance and preserve roster', async t => {
  for (const [reason, expected] of [
    ['SERVICE_DISABLED', /Admin SDK API is disabled for the OAuth project/],
    ['ACCESS_TOKEN_SCOPE_INSUFFICIENT', /did not grant the required directory read-only scope/],
  ]) {
    const app = await fixture(t, {
      env: { GOOGLE_CLIENT_ID: 'fixture.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'fixture-secret' },
      fetchImpl: async url => {
        if (url === 'https://oauth2.googleapis.com/token') return json({ access_token: 'private-access-token', scope: SCOPE });
        if (url === 'https://openidconnect.googleapis.com/v1/userinfo') return json({ email: 'student@berkeley.edu', email_verified: true, hd: 'berkeley.edu' });
        return json({ error: { message: 'private-upstream-message', details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason, metadata: { consumer: 'private-project-id' } }] } }, 403);
      },
    });
    await app.post('/mock');
    const before = fs.readFileSync(path.join(app.root, 'data/directory-roster.json'), 'utf8');
    const auth = new URL((await app.post('/connect')).headers.get('location'));
    await fetch(app.base + `/oauth/callback?state=${auth.searchParams.get('state')}&code=fixture-code`, { redirect: 'manual', headers: { Cookie: app.cookie } });
    const html = await (await fetch(app.base, { headers: { Cookie: app.cookie } })).text();
    assert.match(html, expected);
    assert.doesNotMatch(html, /private-upstream-message|private-project-id|private-access-token/);
    assert.equal(fs.readFileSync(path.join(app.root, 'data/directory-roster.json'), 'utf8'), before);
  }
});

test('embedded browser forms without Origin still require the session-bound CSRF token', async t => {
  const app = await fixture(t, { env: { GOOGLE_CLIENT_ID: 'fixture.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'fixture-secret' } });
  for (const origin of [undefined, 'null']) {
    const headers = { Cookie: app.cookie, 'Content-Type': 'application/x-www-form-urlencoded' };
    if (origin) headers.Origin = origin;
    const denied = await fetch(app.base + '/connect', { method: 'POST', redirect: 'manual', headers, body: new URLSearchParams({ csrf: 'wrong' }) });
    assert.equal(denied.status, 403);
    const accepted = await fetch(app.base + '/connect', { method: 'POST', redirect: 'manual', headers, body: new URLSearchParams({ csrf: app.csrf }) });
    assert.equal(accepted.status, 303); assert.equal(new URL(accepted.headers.get('location')).origin, 'https://accounts.google.com');
  }
  assert.equal((await app.post('/connect', {}, { Origin: 'null', 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await app.post('/connect', {}, { Origin: 'https://evil.example' })).status, 403);
});
