const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Store } = require('./store.cjs');
const { createSpotifySearch } = require('./spotify.cjs');
const { generateQuestionResult } = require('./questions.cjs');
const { generateVariants, generateMatchReason, fallback: fallbackVariants, REPLIES } = require('./demo-neighbors.cjs');
const ROOT = path.resolve(__dirname, '..');
function loadEnv() { try { process.loadEnvFile(path.join(ROOT, '.env')); } catch (e) { if (e.code !== 'ENOENT') throw Error('Unable to load local configuration.'); } }
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const token = () => crypto.randomBytes(32).toString('base64url');
function error(status, message) { return Object.assign(Error(message), { status }); }
function parseDay(value, base) {
  const { shiftDay } = require('../src/demo-model.js');
  if (typeof value === 'number' || /^-?\d+$/.test(String(value))) return shiftDay(base, Number(value));
  if (/^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(value)) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value) return value;
  const names = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const target = names.indexOf(String(value).toLowerCase());
  if (target >= 0) return shiftDay(base, (target - new Date(base + 'T12:00:00Z').getUTCDay() + 7) % 7 || 7);
  throw error(400, 'Use a calendar date, day name, or day offset.');
}
function createApp(options = {}) {
  const config = options.config || process.env;
  const port = Number(options.port ?? config.PORT ?? 3000);
  const origin = config.APP_ORIGIN || `http://localhost:${port}`;
  const storageDir = options.dataDir || path.resolve(ROOT, config.DATA_DIR || 'data');
  if (!options.temporary) fs.mkdirSync(storageDir, { recursive: true, mode: 0o700 });
  const demoMode = options.demoMode ?? (options.store ? options.store.demoMode : config.DEMO_MODE !== '0');
  const store = options.store || new Store({ filename: path.join(storageDir, 'homeroom.sqlite'), demoMode });
  store.demoMode = demoMode;
  const db = store.db;
  if (!options.store) {
    const directory = require('./directory-server.cjs');
    const roster = directory.readRosterFile(path.join(storageDir, 'directory-roster.json'));
    store.importDirectory(roster?.DirectoryPeople || directory.mockDirectoryPeople());
  }
  db.exec(`CREATE TABLE IF NOT EXISTS web_sessions(token_hash TEXT PRIMARY KEY,person_id TEXT,role TEXT NOT NULL,expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS app_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS admin_accounts(username TEXT PRIMARY KEY,salt TEXT NOT NULL,password_hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS oauth_states(state_hash TEXT PRIMARY KEY,verifier TEXT NOT NULL,expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS generation_status(quiz_day TEXT PRIMARY KEY,source TEXT NOT NULL,error_code TEXT,model TEXT);`);
  const adminCount = db.prepare('SELECT COUNT(*) AS n FROM admin_accounts').get().n;
  if (!adminCount) {
    const username = config.ADMIN_USERNAME || 'admin';
    const password = config.ADMIN_PASSWORD || token();
    const salt = token();
    db.prepare('INSERT INTO admin_accounts VALUES(?,?,?)').run(username, salt, crypto.scryptSync(password, salt, 64).toString('hex'));
    if (!config.ADMIN_PASSWORD) fs.writeFileSync(path.join(storageDir, 'admin-login.json'), JSON.stringify({ username, password }, null, 2) + '\n', { mode: 0o600 });
  }
  const peers = new Set();
  const failures = new Map();
  const setting = key => db.prepare('SELECT value FROM app_settings WHERE key=?').get(key)?.value;
  const activeDay = personID => require('../src/demo-model.js').shiftDay(setting('simulated_day') || store.day(), personID ? Number(setting('day-offset:' + personID) || 0) : 0);
  const setSetting = (key, value) => db.prepare('INSERT INTO app_settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value);
  function emit(people = null) { for (const peer of peers) if (!people || people.includes(peer.personID)) peer.response.write(`event: state\ndata: {}\n\n`); }
  const fetchImpl = options.fetchImpl || fetch;
  const spotifySearch = options.spotifySearch || createSpotifySearch(config.GLASSER_API_KEY, { fetchImpl });
  const musicRequests = new Map();
  const generationTasks = new Map();
  const demoTasks = new Map(), replyTimers = new Set();
  const mockSessions = new Map();
  let closing = false;
  function updateScheduledReason(group) {
    const key = 'match-reason:v1:' + group.ID;
    if (setting(key) || demoTasks.has(key)) return;
    const job = (async () => {
      const reason = await generateMatchReason(group, { apiKey: config.CHATGPT_API_KEY, fetchImpl });
      if (closing) return;
      if (reason) { store.setMatchReason(group.ID, reason); emit(group.Members); }
      setSetting(key, reason ? 'luna' : 'fallback');
    })();
    const tracked = job.catch(() => {}).finally(() => demoTasks.delete(key)); demoTasks.set(key, tracked);
  }
  function updateDemoGroup(personID) {
    if (store.person(personID).OnboardingStatus !== 'live') return;
    const day = activeDay(personID);
    const current = store.state(personID, day).MatchGroups[0];
    if (current && current.Kind !== 'demo_preview' && !demoMode) { updateScheduledReason(current); return; }
    if (!demoMode) return;
    const seed = store.demoSeed(personID, day), fingerprint = hash(JSON.stringify(seed));
    const key = 'demo-seed:v3:' + day + ':' + personID;
    const taskKey = key + ':' + fingerprint;
    if (demoTasks.has(taskKey)) return;
    if (current && setting(key) === fingerprint && setting(key + ':source') !== 'pending') return;
    // Publish local, similar neighbors synchronously. Never wait for the model to
    // fill the hallway; enrich these same people in the background afterward.
    store.ensureDemoGroup(personID, day, fallbackVariants(seed), null, 'pending');
    store.deliverSampleNote(personID, day, options.sampleNoteIntervalMs ?? 30000);
    setSetting(key, fingerprint); setSetting(key + ':source', 'pending');
    const job = (async () => {
      const generated = await generateVariants(seed, { apiKey: config.CHATGPT_API_KEY, fetchImpl });
      // Ignore a result if a newer profile/answer or active day superseded its input.
      if (closing || activeDay(personID) !== day || store.person(personID).OnboardingStatus !== 'live' || hash(JSON.stringify(store.demoSeed(personID, day))) !== fingerprint) return;
      store.ensureDemoGroup(personID, day, generated.variants, generated.reason, generated.source);
      setSetting(key, fingerprint); setSetting(key + ':source', generated.source); emit([personID]);
    })();
    const tracked = job.catch(() => { if (!closing) setSetting(key + ':source', 'fallback'); }).finally(() => demoTasks.delete(taskKey));
    demoTasks.set(taskKey, tracked);
  }
  function scheduleReply(message) {
    if (!demoMode || !store.person(message.Recipient).IsDemo || store.person(message.Sender).IsDemo) return;
    const timer = setTimeout(() => {
      replyTimers.delete(timer);
      if (store.person(message.Sender).OnboardingStatus !== 'live' || store.person(message.Recipient).OnboardingStatus !== 'live') return;
      const reply = REPLIES[store.state(message.Sender, activeDay(message.Sender)).Messages.filter(m => m.ConversationID === message.ConversationID).length % REPLIES.length];
      store.send(message.Recipient, message.Sender, reply, activeDay(message.Sender)); emit([message.Sender]);
    }, options.replyDelayMs ?? 1800);
    timer.unref(); replyTimers.add(timer);
  }
  async function ensureDay(day) {
    if (store.questionForDay(day)) return;
    if (generationTasks.has(day)) return generationTasks.get(day);
    const job = (async () => { const result = await generateQuestionResult(day, { apiKey: config.CHATGPT_API_KEY, fetchImpl });
    store.saveQuestion(result.question, result.source);
    db.prepare('INSERT OR REPLACE INTO generation_status VALUES(?,?,?,?)').run(day, result.source, result.errorCode || null, result.model || null); })();
    generationTasks.set(day, job); try { await job; } finally { generationTasks.delete(day); }
  }
  let ticking = null;
  async function tick() {
    if (ticking) return ticking;
    ticking = (async () => {
      const day = activeDay();
      await ensureDay(day);
      await ensureDay(require('../src/demo-model.js').shiftDay(day, 1));
      if (demoMode) {
        for (const person of store.rows('people').filter(p => !p.IsDemo && p.OnboardingStatus === 'live')) {
          await ensureDay(activeDay(person.PersonID)); updateDemoGroup(person.PersonID);
        }
      } else store.runDay(day);
      emit();
    })().finally(() => { ticking = null; });
    return ticking;
  }
  function session(req) {
    const raw = /(?:^|;\s*)homeroom_session=([^;]+)/.exec(req.headers.cookie || '')?.[1];
    if (!raw) return null;
    const row = db.prepare('SELECT * FROM web_sessions WHERE token_hash=? AND expires_at>?').get(hash(raw), Date.now());
    return row ? { personID: row.person_id, role: row.role, tokenHash: hash(raw) } : null;
  }
  function requireSession(req, admin = false) {
    const s = session(req);
    if (!s || (admin ? s.role !== 'admin' : !s.personID)) throw error(401, admin ? 'Administrator sign-in required.' : 'Sign in to continue.');
    if (!admin && !options.temporary && (config.AUTH_MODE || 'mixed') !== 'demo' && s.role !== 'google') throw error(401, 'Sign in with Google to restore a saved profile.');
    return s;
  }
  function newSession(personID, role = 'user') {
    const raw = token(); db.prepare('INSERT INTO web_sessions VALUES(?,?,?,?)').run(hash(raw), personID, role, Date.now() + 7 * 86400000);
    return raw;
  }
  function setSession(res, personID, role = 'user') {
    const raw = newSession(personID, role);
    res.setHeader('Set-Cookie', `homeroom_session=${raw}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${origin.startsWith('https:') ? '; Secure' : ''}`);
  }
  function json(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }
  async function body(req, max = 7 * 1024 * 1024) {
    if (!(req.headers['content-type'] || '').startsWith('application/json')) throw error(415, 'Use application/json.');
    let bytes = 0, chunks = [];
    for await (const chunk of req) { bytes += chunk.length; if (bytes > max) throw error(413, 'Upload exceeds the size limit.'); chunks.push(chunk); }
    try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { throw error(400, 'Invalid JSON.'); }
  }
  function sameOrigin(req) {
    const host = req.headers.host;
    const allowed = new Set([new URL(origin).host, `localhost:${port}`, `127.0.0.1:${port}`]);
    if (!allowed.has(host)) throw error(403, 'Unexpected host.');
    if (req.headers.origin && ![origin, `http://localhost:${port}`, `http://127.0.0.1:${port}`].includes(req.headers.origin)) throw error(403, 'Unexpected origin.');
    if (req.headers['sec-fetch-site'] === 'cross-site' && !['GET', 'HEAD'].includes(req.method)) throw error(403, 'Cross-site request refused.');
  }
  function throttle(req, key) {
    const id = req.socket.remoteAddress + ':' + key, now = Date.now(), entry = failures.get(id);
    if (entry && entry.until > now && entry.count >= 12) throw error(429, 'Too many sign-in attempts. Try again later.');
    failures.set(id, { count: entry?.until > now ? entry.count + 1 : 1, until: now + 60000 });
  }
  function googleConfigured() { if (!options.config) loadEnv(); return !!(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET); }
  async function route(req, res) {
    sameOrigin(req);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    const url = new URL(req.url, origin), pathname = url.pathname;
    if (pathname === '/directory') throw error(404, 'Page not found.');
    if (options.temporary && pathname.startsWith('/api/admin/')) throw error(403, 'Administrator operations are unavailable in mock mode.');
    if (req.method === 'GET' && pathname === '/api/config') return json(res, 200, { AuthMode: config.AUTH_MODE || 'mixed', GoogleConfigured: !options.temporary && config.AUTH_MODE !== 'demo' && googleConfigured(), DirectoryURL: null, Model: 'gpt-6-luna', Reasoning: 'low' });
    if (req.method === 'GET' && pathname === '/api/health') return json(res, 200, { status: 'ok', day: activeDay() });
    if (req.method === 'POST' && pathname === '/api/auth/mock' && !options.temporary) {
      throttle(req, 'mock'); const input = await body(req, 2048);
      if (typeof input.Email !== 'string' || input.Email.trim().length > 254 || !/^[^@\s]+@berkeley\.edu$/i.test(input.Email.trim())) throw error(400, 'Use a made-up @berkeley.edu email.');
      if (mockSessions.size >= 16) throw error(503, 'The demo is busy. Please try again shortly.');
      const memory = new Store({ filename: ':memory:', now: store.now, demoMode: true, temporary: true });
      memory.db.exec('DELETE FROM answers; DELETE FROM questions;');
      for (const question of store.questions()) memory.saveQuestion(question, store.questionSource(question.QuizDay));
      const mock = createApp({ store: memory, temporary: true, dataDir: storageDir, port,
        config: { ...config, AUTH_MODE: 'demo', ADMIN_PASSWORD: token() }, fetchImpl, spotifySearch,
        sampleNoteIntervalMs: options.sampleNoteIntervalMs, sampleNotePollMs: options.sampleNotePollMs, replyDelayMs: options.replyDelayMs });
      const opened = mock.openMock(input.Email.trim());
      mockSessions.set(hash(opened.Token), { app: mock, token: opened.Token, lastUsed: Date.now() });
      return json(res, 200, opened);
    }
    if (req.method === 'POST' && pathname === '/api/auth/demo') {
      if (options.temporary) throw error(404, 'Page not found.');
      if ((config.AUTH_MODE || 'mixed') !== 'demo') throw error(403, 'Demo sign-in is disabled.');
      throttle(req, 'demo'); const input = await body(req, 2048);
      if (typeof input.Email !== 'string') throw error(400, 'Enter a valid demo email.');
      const result = store.loginPerson(input.Email);
      const personID = typeof result === 'string' ? result : result.PersonID;
      setSession(res, personID, 'demo'); return json(res, 200, store.state(personID, activeDay(personID)));
    }
    if (req.method === 'POST' && pathname === '/api/auth/logout') {
      const s = session(req); if (s) db.prepare('DELETE FROM web_sessions WHERE token_hash=?').run(s.tokenHash);
      if (!options.temporary) res.setHeader('Set-Cookie', 'homeroom_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'); return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && pathname === '/auth/google') {
      if (options.temporary || (config.AUTH_MODE || 'mixed') === 'demo') throw error(404, 'Page not found.');
      if (!googleConfigured()) throw error(503, 'Google sign-in needs a configured OAuth client. Use local demo sign-in for now.');
      const state = token(), verifier = token(); db.prepare('DELETE FROM oauth_states WHERE expires_at<?').run(Date.now());
      db.prepare('INSERT INTO oauth_states VALUES(?,?,?)').run(hash(state), verifier, Date.now() + 600000);
      const target = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      target.search = new URLSearchParams({ client_id: config.GOOGLE_CLIENT_ID, redirect_uri: origin + '/auth/google/callback', response_type: 'code', scope: 'openid email profile', state, code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', hd: 'berkeley.edu' });
      res.setHeader('Set-Cookie', `homeroom_oauth=${state}; HttpOnly; SameSite=Lax; Path=/auth/google; Max-Age=600${origin.startsWith('https:') ? '; Secure' : ''}`);
      res.writeHead(302, { Location: target.toString() }); return res.end();
    }
    if (req.method === 'GET' && pathname === '/auth/google/callback') {
      if (options.temporary || (config.AUTH_MODE || 'mixed') === 'demo') throw error(404, 'Page not found.');
      const state = url.searchParams.get('state') || '', cookieState = /(?:^|;\s*)homeroom_oauth=([^;]+)/.exec(req.headers.cookie || '')?.[1];
      const flow = db.prepare('SELECT * FROM oauth_states WHERE state_hash=? AND expires_at>?').get(hash(state), Date.now());
      db.prepare('DELETE FROM oauth_states WHERE state_hash=?').run(hash(state));
      if (!flow || !cookieState || cookieState !== state || !url.searchParams.get('code')) throw error(400, 'Google sign-in expired or was declined.');
      const response = await fetchImpl('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code: url.searchParams.get('code'), client_id: config.GOOGLE_CLIENT_ID, client_secret: config.GOOGLE_CLIENT_SECRET, redirect_uri: origin + '/auth/google/callback', grant_type: 'authorization_code', code_verifier: flow.verifier }), signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw error(502, 'Google could not complete sign-in.'); const credentials = await response.json();
      const user = await fetchImpl('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: 'Bearer ' + credentials.access_token }, signal: AbortSignal.timeout(20000) });
      if (!user.ok) throw error(502, 'Google could not verify the account.'); const claims = await user.json();
      if (!claims.email_verified || claims.hd !== 'berkeley.edu' || !claims.email?.endsWith('@berkeley.edu')) throw error(403, 'A verified Berkeley account is required.');
      const result = store.loginPerson(claims.email.toLowerCase()), personID = typeof result === 'string' ? result : result.PersonID;
      const person = store.person(personID);
      if (person.OnboardingStatus === 'draft' && !person.PersonMeta.name && claims.given_name) { person.PersonMeta.name = String(claims.given_name).slice(0, 22); store.putPerson(person); }
      setSession(res, personID, 'google');
      res.writeHead(302, { Location: '/' }); return res.end();
    }
    if (req.method === 'POST' && pathname === '/api/admin/login') {
      throttle(req, 'admin'); const input = await body(req, 4096);
      const account = db.prepare('SELECT * FROM admin_accounts WHERE username=?').get(String(input.Username || ''));
      const actual = crypto.scryptSync(String(input.Password || '').slice(0, 1024), account?.salt || 'invalid-account', 64);
      const expected = account ? Buffer.from(account.password_hash, 'hex') : Buffer.alloc(64);
      if (!account || !crypto.timingSafeEqual(actual, expected)) throw error(401, 'Invalid administrator credentials.');
      setSession(res, null, 'admin'); return json(res, 200, { ok: true });
    }
    if (pathname.startsWith('/api/admin/')) {
      if (options.temporary) throw error(403, 'Administrator operations are unavailable in mock mode.');
      requireSession(req, true);
      if (req.method === 'GET' && pathname === '/api/admin/status') return json(res, 200, { Day: activeDay(), Questions: store.questions(), Generation: db.prepare('SELECT * FROM generation_status ORDER BY quiz_day').all(), DirectoryCount: db.prepare('SELECT COUNT(*) AS n FROM directory').get().n });
      if (req.method === 'POST' && pathname === '/api/admin/simulate') {
        const input = await body(req, 2048); if (input.Day === 'today') db.prepare("DELETE FROM app_settings WHERE key='simulated_day'").run(); else setSetting('simulated_day', parseDay(input.Day, store.day()));
        await tick(); return json(res, 200, { Day: activeDay() });
      }
      if (req.method === 'POST' && pathname === '/api/admin/directory/import') {
        const file = path.join(storageDir, 'directory-roster.json');
        if (!fs.existsSync(file)) throw error(404, 'Use the local directory page to save a roster first.');
        const roster = JSON.parse(fs.readFileSync(file, 'utf8')); store.importDirectory(roster.DirectoryPeople); return json(res, 200, { Imported: roster.DirectoryPeople.length, Source: roster.Source });
      }
      if (req.method === 'POST' && pathname === '/api/admin/questions/generate') {
        const input = await body(req, 2048); const day = parseDay(input.Day ?? 1, activeDay()); await ensureDay(day); return json(res, 200, { Question: store.questionForDay(day) });
      }
      throw error(404, 'Endpoint not found.');
    }
    if (pathname.startsWith('/api/')) {
      const { personID } = requireSession(req);
      if (req.method === 'POST' && pathname === '/api/spotify/search') {
        const input = await body(req, 2048);
        const query = typeof input.query === 'string' ? input.query.trim().replace(/\s+/g, ' ') : '';
        if (query.length < 2 || query.length > 120) throw error(400, 'Enter a song or artist between 2 and 120 characters.');
        const now = Date.now(), previous = musicRequests.get(personID);
        if (previous?.pending || (previous && now - previous.started < 1000)) throw error(429, 'Wait a moment before searching again.');
        const entry = { started: now, pending: true }; musicRequests.set(personID, entry);
        try { return json(res, 200, await spotifySearch(query)); } finally { entry.pending = false; }
      }
      if (req.method === 'POST' && pathname === '/api/demo/advance') {
        if (!demoMode) throw error(403, 'Day skipping is available only in demo matching mode.');
        if (store.person(personID).OnboardingStatus !== 'live') throw error(400, 'Finish your profile first.');
        const next = require('../src/demo-model.js').shiftDay(activeDay(personID), 1);
        await ensureDay(next);
        setSetting('day-offset:' + personID, String(Number(setting('day-offset:' + personID) || 0) + 1));
        updateDemoGroup(personID); emit([personID]);
        return json(res, 200, store.state(personID, activeDay(personID)));
      }
      if (req.method === 'POST' && pathname === '/api/demo/reset') {
        store.restartDemo(personID);
        db.prepare('DELETE FROM web_sessions WHERE person_id=?').run(personID);
        if (!options.temporary) res.setHeader('Set-Cookie', 'homeroom_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
        emit(); return json(res, 200, { Reset: true });
      }
      if (req.method === 'GET' && pathname === '/api/state') { await ensureDay(activeDay(personID)); updateDemoGroup(personID); return json(res, 200, store.state(personID, activeDay(personID))); }
      if (req.method === 'GET' && pathname === '/api/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        res.write('event: ready\ndata: {}\n\n'); const peer = { personID, response: res }; peers.add(peer);
        const ping = setInterval(() => { if (!session(req)) { res.end(); return; } res.write(': heartbeat\n\n'); }, 25000); ping.unref();
        req.on('close', () => { clearInterval(ping); peers.delete(peer); }); return;
      }
      if (req.method === 'PUT' && pathname === '/api/me') {
        const input = await body(req); if (input.MediaAssets !== undefined) throw error(400, 'Register images through the upload endpoint.'); store.savePerson(personID, input, activeDay(personID)); await updateDemoGroup(personID); emit([personID, ...store.state(personID, activeDay(personID)).People.map(p => p.PersonID)]); return json(res, 200, store.state(personID, activeDay(personID)));
      }
      if (req.method === 'POST' && pathname === '/api/uploads') {
        const input = await body(req); const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(input.DataURL || '');
        if (!match || !['Photo', 'Sticker'].includes(input.Kind)) throw error(400, 'Upload a processed PNG photo or sticker.');
        const bytes = Buffer.from(match[1], 'base64');
        if (bytes.length > 5 * 1024 * 1024 || bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw error(400, 'Invalid PNG upload.');
        const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20); if (!width || !height || width * height > 20000000) throw error(400, 'Image dimensions are too large.');
        const id = 'media:' + personID + ':' + crypto.randomUUID();
        const asset = { ID: id, OwnerPersonID: personID, Kind: input.Kind, StorageKey: '/media/' + encodeURIComponent(id), MimeType: 'image/png', Title: String(input.Title || '').slice(0, 24), Description: String(input.Description || '').slice(0, 160) };
        if (options.temporary) {
          const storedBytes = store.rows('assets').filter(a => a.OwnerPersonID).reduce((sum, a) => sum + a.StorageKey.length, 0);
          if (storedBytes + input.DataURL.length > 8 * 1024 * 1024) throw error(413, 'This temporary upload bank is full. Restart mock mode to clear it.');
          asset.StorageKey = input.DataURL; store.saveMedia(personID, asset); return json(res, 201, asset);
        }
        const uploadDir = path.join(storageDir, 'uploads'); fs.mkdirSync(uploadDir, { recursive: true, mode: 0o700 });
        const file = path.join(uploadDir, hash(id) + '.png'); fs.writeFileSync(file, bytes, { mode: 0o600 });
        try { store.saveMedia(personID, asset); } catch (e) { fs.unlinkSync(file); throw e; } return json(res, 201, asset);
      }
      if (req.method === 'POST' && pathname === '/api/answers') { const input = await body(req, 8192); store.answer(personID, input.QuestionID, input.Answer, activeDay(personID)); await updateDemoGroup(personID); emit([personID]); return json(res, 200, store.state(personID, activeDay(personID))); }
      if (req.method === 'POST' && pathname === '/api/messages') { const input = await body(req, 8192); const message = store.send(personID, input.Recipient, input.Content, activeDay(personID)); scheduleReply(message); emit([personID, input.Recipient]); return json(res, 201, message); }
      if (req.method === 'POST' && pathname === '/api/messages/open') { const input = await body(req, 4096); store.openMessage(personID, input.MessageID); const s = store.state(personID, activeDay(personID)); emit([personID, ...s.Conversations.flatMap(c => [c.Person1, c.Person2])]); return json(res, 200, s); }
      if (req.method === 'POST' && pathname === '/api/invitations') { const input = await body(req, 4096); return json(res, 201, store.invite(personID, input.Email)); }
      throw error(404, 'Endpoint not found.');
    }
    if (req.method === 'GET' && pathname.startsWith('/media/')) {
      const { personID } = requireSession(req); const id = decodeURIComponent(pathname.slice(7));
      const asset = store.media(id); if (!asset) throw error(404, 'Image not found.');
      const visible = store.state(personID, activeDay(personID)).MediaBucket.Assets.some(a => a.ID === id);
      if (!visible) throw error(403, 'This image is private.');
      const file = path.join(storageDir, 'uploads', hash(id) + '.png'); if (!fs.existsSync(file)) throw error(404, 'Image not found.');
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=3600' }); return fs.createReadStream(file).pipe(res);
    }
    if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }); return fs.createReadStream(path.join(ROOT, 'index.html')).pipe(res); }
    throw error(404, 'Page not found.');
  }
  const server = http.createServer((req, res) => {
    const mockToken = req.headers['x-homeroom-mock'];
    if (!options.temporary && mockToken) {
      const key = hash(String(mockToken)), entry = mockSessions.get(key);
      if (!entry) return json(res, 401, { error: 'This mock session has ended. Start a new one.' });
      entry.lastUsed = Date.now(); req.headers.cookie = 'homeroom_session=' + entry.token;
      if (['/api/auth/logout', '/api/demo/reset'].includes(req.url)) res.once('finish', () => { mockSessions.delete(key); entry.app.close().catch(() => {}); });
      entry.app.server.emit('request', req, res); return;
    }
    route(req, res).catch(e => { if (res.headersSent) return res.end(); const status = Number(e.status) || 500; json(res, status, { error: status < 500 ? e.message : status === 503 ? e.message : 'The request could not be completed.' }); });
  });
  const timer = setInterval(() => { tick().catch(() => console.error('Daily update could not complete; it will retry.')); }, 30000); timer.unref();
  const notesTimer = setInterval(() => {
    if (closing) return;
    for (const person of store.rows('people').filter(p => !p.IsDemo && p.OnboardingStatus === 'live')) {
      try { if (store.deliverSampleNote(person.PersonID, activeDay(person.PersonID), options.sampleNoteIntervalMs ?? 30000)) emit([person.PersonID]); } catch { /* Retry on the next tick. */ }
    }
    for (const [key, entry] of mockSessions) if (Date.now() - entry.lastUsed > 30 * 60000) { mockSessions.delete(key); entry.app.close().catch(() => {}); }
  }, options.sampleNotePollMs ?? 1000); notesTimer.unref();
  let midnightTimer;
  function scheduleMidnight() {
    const nextDay = require('../src/demo-model.js').shiftDay(store.day(), 1);
    const next = Date.parse(require('./store.cjs').midnight(nextDay));
    midnightTimer = setTimeout(() => { tick().catch(() => console.error('Midnight update will retry.')); scheduleMidnight(); }, Math.max(1000, Math.min(2147483647, next - store.now().getTime()))); midnightTimer.unref();
  }
  scheduleMidnight();
  let closeTask;
  return { server, store, tick, activeDay,
    openMock(email) { const personID = store.loginPerson(email); return { Token: newSession(personID, 'mock'), State: store.state(personID, activeDay(personID)) }; },
    close() {
      if (closeTask) return closeTask;
      closing = true;
      closeTask = (async () => { clearInterval(timer); clearInterval(notesTimer); clearTimeout(midnightTimer); for (const t of replyTimers) clearTimeout(t); for (const peer of peers) peer.response.end();
        await new Promise(resolve => server.close(resolve));
        await Promise.allSettled([...mockSessions.values()].map(entry => entry.app.close())); mockSessions.clear();
        await Promise.allSettled([...demoTasks.values(), ...generationTasks.values(), ...(ticking ? [ticking] : [])]); store.close(); })();
      return closeTask;
    } };
}
if (require.main === module) {
  loadEnv(); const app = createApp(); const port = Number(process.env.PORT || 3000);
  const host = process.env.IP || process.env.HOST || '127.0.0.1';
  app.server.listen(port, host, () => { console.log(`Homeroom listening on ${host}:${port}`); app.tick().catch(() => console.error('Daily generation unavailable; check admin status.')); });
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => process.exit(1), 10000); deadline.unref();
    app.close().then(() => process.exit(0), () => process.exit(1));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
module.exports = { createApp, loadEnv, parseDay };
