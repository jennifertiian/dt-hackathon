'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const {Store} = require('../server/store.cjs');
const {createApp} = require('../server/app.cjs');
async function setup(t, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'homeroom-http-'));
  const probe = net.createServer(); await new Promise(resolve => probe.listen(0,'127.0.0.1',resolve)); const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const store = new Store({filename:path.join(dir,'db.sqlite'),now:() => new Date('2026-10-17T20:00:00Z')});
  const app = createApp({port,dataDir:dir,store,config:{AUTH_MODE:'demo',ADMIN_USERNAME:'admin',ADMIN_PASSWORD:'test-password'}, ...options});
  await new Promise(resolve => app.server.listen(port,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  t.after(async () => { await app.close(); fs.rmSync(dir,{recursive:true,force:true}); });
  async function req(route,{method='GET',body,cookie,headers={}} = {}) {
    return fetch(base + route,{method,redirect:'manual',headers:{Host:`127.0.0.1:${port}`,...(body !== undefined ? {'Content-Type':'application/json'} : {}),...(cookie ? {Cookie:cookie} : {}),...headers},...(body !== undefined ? {body:JSON.stringify(body)} : {})});
  }
  async function login(email) { const response = await req('/api/auth/demo',{method:'POST',body:{Email:email}}); assert.equal(response.status,200); return {cookie:response.headers.get('set-cookie').split(';')[0],state:await response.json()}; }
  return {app,store,req,login,dir,base};
}
test('HTTP sessions require login, constrain host/origin, and logout revokes the cookie',async t => {
  const {req,login,base} = await setup(t);
  assert.equal((await req('/api/state')).status,401);
  const badHostStatus = await new Promise((resolve,reject) => { const request = require('node:http').get(base + '/api/config',{headers:{Host:'evil.example'}},response => { response.resume(); resolve(response.statusCode); }); request.on('error',reject); });
  assert.equal(badHostStatus,403);
  assert.equal((await req('/api/auth/demo',{method:'POST',body:{Email:'a@berkeley.edu'},headers:{Origin:'https://evil.example'}})).status,403);
  assert.equal((await req('/api/auth/demo',{method:'POST',body:{Email:'not-an-email'}})).status,400);
  const {cookie,state} = await login('a@berkeley.edu');
  assert.equal(state.People[0].OnboardingStatus,'draft');
  assert.equal((await req('/api/state',{cookie})).status,200);
  assert.equal((await req('/api/admin/status',{cookie})).status,401);
  assert.equal((await req('/api/auth/logout',{method:'POST',cookie})).status,200);
  assert.equal((await req('/api/state',{cookie})).status,401);
});
test('demo auth accepts synthetic email and hides Google and directory routes even with credentials present', async t => {
  const { req, login } = await setup(t, { config: { AUTH_MODE: 'demo', GOOGLE_CLIENT_ID: 'unused', GOOGLE_CLIENT_SECRET: 'unused', ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'test-password' } });
  const first = await login('  DEMO@example.com  '), again = await login('demo@example.com');
  assert.equal(first.state.CurrentPersonID, again.state.CurrentPersonID);
  const config = await (await req('/api/config')).json();
  assert.equal(config.AuthMode, 'demo'); assert.equal(config.GoogleConfigured, false); assert.equal(config.DirectoryURL, null);
  for (const route of ['/auth/google', '/auth/google/callback', '/directory']) assert.equal((await req(route)).status, 404);
});
test('admin simulation publishes shared groups and HTTP messages emit SSE invalidations',async t => {
  const {req,login,base} = await setup(t);
  const a = await login('a@berkeley.edu'), b = await login('b@berkeley.edu');
  for (const person of [a,b]) {
    const p = person.state.People[0]; p.PersonMeta={name:'Student',major:'CS',year:'2027',interests:['hiking'],hobbies:[]};p.OnboardingStatus='live';
    const save = await req('/api/me',{method:'PUT',cookie:person.cookie,body:{Person:p}}); assert.equal(save.status,200);
  }
  assert.equal((await req('/api/admin/login',{method:'POST',body:{Username:'admin',Password:'wrong'}})).status,401);
  const auth = await req('/api/admin/login',{method:'POST',body:{Username:'admin',Password:'test-password'}}), admin = auth.headers.get('set-cookie').split(';')[0];
  assert.equal((await req('/api/admin/status',{cookie:admin})).status,200);
  assert.equal((await req('/api/demo/reset', { method: 'POST', cookie: a.cookie, body: {} })).status, 403);
  const simulation = await req('/api/admin/simulate',{method:'POST',cookie:admin,body:{Day:1}}); assert.equal(simulation.status,200);
  const state = await (await req('/api/state',{cookie:a.cookie})).json();
  assert.equal(state.ActiveDay,'2026-10-18');assert.equal(state.MatchGroups[0].Members.length,9);
  const events = await req('/api/events',{cookie:b.cookie}), reader = events.body.getReader();
  const ready = await reader.read(); assert.match(new TextDecoder().decode(ready.value),/event: ready/);
  const noteResponse = await req('/api/messages',{method:'POST',cookie:a.cookie,body:{Recipient:b.state.CurrentPersonID,Content:'hello'}});
  assert.equal(noteResponse.status,201); const note = await noteResponse.json(); assert.equal(note.Type,'locker_note');
  const update = await Promise.race([reader.read(),new Promise((_,reject) => setTimeout(() => reject(Error('SSE event missing')),2000).unref())]);
  assert.match(new TextDecoder().decode(update.value),/event: state/);await reader.cancel();
  assert.equal((await req('/api/messages/open',{method:'POST',cookie:a.cookie,body:{MessageID:note.ID}})).status,403);
  assert.equal((await req('/api/messages/open',{method:'POST',cookie:b.cookie,body:{MessageID:note.ID}})).status,200);
  const reply = await req('/api/messages',{method:'POST',cookie:b.cookie,body:{Recipient:a.state.CurrentPersonID,Content:'hi!'}});assert.equal((await reply.json()).Type,'direct_message');
});
test('uploads persist privately in bank, reject non-PNG content and require authorization',async t => {
  const {req,login,dir} = await setup(t), a = await login('a@berkeley.edu'), b = await login('b@berkeley.edu');
  assert.equal((await req('/api/uploads',{method:'POST',cookie:a.cookie,body:{Kind:'Photo',DataURL:'data:image/svg+xml;base64,AAAA'}})).status,400);
  const bytes = fs.readFileSync(path.join(__dirname,'../art/assets/plant.png'));
  const upload = await req('/api/uploads',{method:'POST',cookie:a.cookie,body:{Kind:'Photo',DataURL:'data:image/png;base64,' + bytes.toString('base64'),Title:'plant',Description:'my plant'}});
  assert.equal(upload.status,201); const asset = await upload.json();
  assert.equal((await req(asset.StorageKey)).status,401);
  assert.equal((await req(asset.StorageKey,{cookie:b.cookie})).status,403);
  const image = await req(asset.StorageKey,{cookie:a.cookie}); assert.equal(image.status,200); assert.deepEqual(Buffer.from(await image.arrayBuffer()),bytes);
  assert.equal(fs.readdirSync(path.join(dir,'uploads')).length,1);
  const state = await (await req('/api/state',{cookie:a.cookie})).json(); assert.ok(state.MediaBucket.Assets.some(x => x.ID === asset.ID));
  assert.equal((await req('/.env')).status,404);
  assert.equal((await req('/data/admin-login.json')).status,404);
});

test('demo publication gives stable immediate peers, typed variants, capped replies and server clock', async t => {
  const { req, login, store } = await setup(t, { demoMode: true, replyDelayMs: 5 });
  const a = await login('immediate@berkeley.edu');
  const person = a.state.People[0];
  person.PersonMeta = { name: 'Demo Student', major: 'CS', year: '2027', interests: ['hiking'], hobbies: ['drawing'] }; person.OnboardingStatus = 'live';
  const save = await req('/api/me', { method: 'PUT', cookie: a.cookie, body: { Person: person } });
  assert.equal(save.status, 200);
  const state = await save.json(), group = state.MatchGroups[0];
  assert.equal(state.DemoMode, true); assert.equal(group.Kind, 'demo_preview'); assert.equal(group.Members.length, 9);
  assert.equal(store.person(a.state.CurrentPersonID).EligibleFrom, state.ActiveDay);
  assert.equal(state.NextRefreshAt, '2026-10-18T07:00:00.000Z'); assert.equal(state.ServerNow, '2026-10-17T20:00:00.000Z');
  const q = store.questionForDay(), answer = { Type: 'SingleChoice', ChoiceID: q.Choices[1].ID };
  const revised = await (await req('/api/answers', { method: 'POST', cookie: a.cookie, body: { QuestionID: q.ID, Answer: answer } })).json();
  assert.deepEqual(revised.MatchGroups[0].Members, group.Members);
  assert.ok(revised.MatchGroups[0].MatchingInputs.every(x => x.SourceQuestionID === q.ID));
  assert.ok(revised.QuestionAnswers.every(x => x.PersonID === state.CurrentPersonID));
  for (const id of group.Members.slice(1)) assert.deepEqual(store.exportData().QuestionAnswers.find(x => x.PersonID === id && x.QuestionID === q.ID).Answer, answer);
  const recipient = group.Members[1];
  const first = await (await req('/api/messages', { method: 'POST', cookie: a.cookie, body: { Recipient: recipient, Content: 'hello' } })).json();
  await new Promise(resolve => setTimeout(resolve, 30));
  const messages = store.state(state.CurrentPersonID).Messages;
  assert.equal(messages.length, 2); assert.equal(messages[1].Sender, recipient); assert.equal(messages[1].Type, 'direct_message');
  assert.equal(messages[1].ConversationID, first.ConversationID);
  assert.equal((await req('/api/messages', { method: 'POST', cookie: a.cookie, body: { Recipient: recipient, Content: 'x'.repeat(200) } })).status, 201);
  assert.equal((await req('/api/messages', { method: 'POST', cookie: a.cookie, body: { Recipient: recipient, Content: 'x'.repeat(201) } })).status, 400);
  store.openMessage(state.CurrentPersonID, messages[1].ID);
  assert.ok(store.state(state.CurrentPersonID).Messages.find(m => m.ID === messages[1].ID).IsOpened);
  const reset = await req('/api/demo/reset', { method: 'POST', cookie: a.cookie, body: {} });
  assert.equal(reset.status, 200); assert.match(reset.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await req('/api/state', { cookie: a.cookie })).status, 401);
  const fresh = await login('immediate@berkeley.edu');
  assert.notEqual(fresh.state.CurrentPersonID, state.CurrentPersonID);
  assert.equal(fresh.state.People.length, 1); assert.equal(fresh.state.People[0].OnboardingStatus, 'draft');
  assert.deepEqual(fresh.state.People[0].PersonMeta, {});
  assert.equal(fresh.state.Conversations.length, 0); assert.equal(fresh.state.QuestionAnswers.length, 0);
  assert.equal(fresh.state.MatchGroups.length, 0);
  assert.ok(store.exportData().Messages.some(m => m.ID === first.ID), 'previous run remains recoverable');
});

test('existing live demo users get neighbors immediately while Luna is still pending', async t => {
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const { req, login, store } = await setup(t, { demoMode: true,
    config: { AUTH_MODE: 'demo', CHATGPT_API_KEY: 'fake-key', ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'test-password' },
    fetchImpl: async (_, options) => {
      const body = JSON.parse(options.body);
      if (body.text.format.name !== 'demo_neighbors') return { ok: false, status: 503 };
      await waiting;
      const value = { Reason: 'A shared interest in hiking and exploring trails.', Variants: require('../server/demo-neighbors.cjs').fallback(JSON.parse(body.input)).map(v => ({ ...v, Interests: ['hiking', 'trail running'] })) };
      return { ok: true, text: async () => JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] }) };
    }
  });
  t.after(() => release());
  const a = await login('existing-demo@berkeley.edu'), person = store.person(a.state.CurrentPersonID);
  person.PersonMeta = { name: 'Existing Bear', major: 'CS', year: '2027', interests: ['hiking'], hobbies: [] }; person.OnboardingStatus = 'live';
  store.demoMode = false; store.savePerson(person.PersonID, person); store.demoMode = true;
  assert.equal(store.person(person.PersonID).EligibleFrom, '2026-10-18');
  try {
    const response = await Promise.race([req('/api/state', { cookie: a.cookie }), new Promise((_, reject) => setTimeout(() => reject(Error('Neighbors waited for Luna')), 500).unref())]);
    const state = await response.json(); assert.equal(state.MatchGroups[0].Members.length, 9);
    assert.equal(store.person(person.PersonID).EligibleFrom, state.ActiveDay);
    const ids = state.MatchGroups[0].Members;
    release(); await new Promise(resolve => setImmediate(resolve));
    const enriched = await (await req('/api/state', { cookie: a.cookie })).json();
    assert.deepEqual(enriched.MatchGroups[0].Members, ids);
    assert.equal(enriched.MatchGroups[0].Reason, 'A shared interest in hiking and exploring trails.');
    assert.ok(enriched.People.filter(p => p.IsDemo).every(p => p.PersonMeta.interests.includes('trail running')));
  } finally { release(); }
});

test('complete mock is isolated in memory, accepts Berkeley email and discards its session on exit', async t => {
  const { req, store, dir } = await setup(t, { demoMode: true });
  const count = store.rows('people').length, files = fs.readdirSync(dir).sort();
  assert.equal((await req('/api/auth/mock', { method: 'POST', body: { Email: 'wrong@example.com' } })).status, 400);
  const start = await req('/api/auth/mock', { method: 'POST', body: { Email: 'made-up@berkeley.edu' } });
  assert.equal(start.status, 200); assert.equal(start.headers.get('set-cookie'), null);
  const first = await start.json(), headers = { 'X-Homeroom-Mock': first.Token };
  assert.equal(first.State.IsTemporary, true); assert.equal(first.State.DemoMode, true);
  const person = first.State.People[0]; person.PersonMeta = { name: 'Mock Student', major: 'Art', year: '2027', interests: ['pottery'], hobbies: ['drawing'] }; person.OnboardingStatus = 'live';
  const published = await req('/api/me', { method: 'PUT', headers, body: { Person: person } }); assert.equal(published.status, 200);
  const state = await published.json(); assert.equal(state.MatchGroups[0].Members.length, 9);
  const upload = await req('/api/uploads', { method: 'POST', headers, body: { Kind: 'Photo', DataURL: 'data:image/png;base64,' + fs.readFileSync('art/assets/plant.png').toString('base64') } });
  assert.equal(upload.status, 201); assert.match((await upload.json()).StorageKey, /^data:image\/png;base64,/);
  assert.equal(store.rows('people').length, count); assert.deepEqual(fs.readdirSync(dir).sort(), files);
  assert.equal((await req('/api/state')).status, 401);
  const again = await (await req('/api/auth/mock', { method: 'POST', body: { Email: 'made-up@berkeley.edu' } })).json();
  assert.notEqual(again.State.CurrentPersonID, state.CurrentPersonID);
  const logout = await req('/api/auth/logout', { method: 'POST', headers }); assert.equal(logout.status, 200); assert.equal(logout.headers.get('set-cookie'), null);
  assert.equal((await req('/api/state', { headers })).status, 401);
  assert.equal(store.rows('people').length, count);
});

test('skip day creates new private people and a question without moving another user or losing history', async t => {
  const { req, login, store } = await setup(t, { demoMode: true });
  const a = await login('skip-a@berkeley.edu'), b = await login('skip-b@berkeley.edu');
  for (const user of [a, b]) {
    const person = user.state.People[0]; person.PersonMeta = { name: 'Time Traveler', major: 'CS', year: '2027', interests: ['hiking'], hobbies: [] }; person.OnboardingStatus = 'live';
    const response = await req('/api/me', { method: 'PUT', cookie: user.cookie, body: { Person: person } }); assert.equal(response.status, 200); user.state = await response.json();
  }
  const question = store.questionForDay(), Answer = { Type: 'SingleChoice', ChoiceID: question.Choices[0].ID };
  assert.equal((await req('/api/answers', { method: 'POST', cookie: a.cookie, body: { QuestionID: question.ID, Answer } })).status, 200);
  const old = a.state.MatchGroups[0], response = await req('/api/demo/advance', { method: 'POST', cookie: a.cookie, body: {} }); assert.equal(response.status, 200);
  const next = await response.json(); assert.equal(next.ActiveDay, '2026-10-18'); assert.ok(next.Questions.some(q => q.QuizDay === next.ActiveDay));
  assert.ok(next.MatchGroups[0].Members.slice(1).every(id => !old.Members.includes(id)));
  assert.ok(next.QuestionAnswers.some(a => a.QuestionID === question.ID));
  assert.equal(store.rows('groups').filter(g => g.OwnerPersonID === next.CurrentPersonID).length, 2);
  const unchanged = await (await req('/api/state', { cookie: b.cookie })).json(); assert.equal(unchanged.ActiveDay, '2026-10-17'); assert.equal(unchanged.MatchGroups[0].ID, b.state.MatchGroups[0].ID);
  assert.ok(!unchanged.People.some(p => next.MatchGroups[0].Members.includes(p.PersonID)));
});

test('Google callback verifies Berkeley identity and restores a persistent account, without directory access', async t => {
  const { req, store } = await setup(t, { demoMode: true,
    config: { AUTH_MODE: 'mixed', GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret', ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'test-password' },
    fetchImpl: async url => url === 'https://oauth2.googleapis.com/token' ? { ok: true, json: async () => ({ access_token: 'fake-token' }) } :
      url === 'https://openidconnect.googleapis.com/v1/userinfo' ? { ok: true, json: async () => ({ email_verified: true, hd: 'berkeley.edu', email: 'google@berkeley.edu', given_name: 'Google Bear' }) } : { ok: false, status: 503 }
  });
  const configuration = await (await req('/api/config')).json(); assert.equal(configuration.GoogleConfigured, true); assert.equal(configuration.DirectoryURL, null);
  const start = await req('/auth/google'); assert.equal(start.status, 302);
  const target = new URL(start.headers.get('location')), state = target.searchParams.get('state'), cookie = start.headers.get('set-cookie').split(';')[0];
  assert.equal(target.searchParams.get('hd'), 'berkeley.edu'); assert.equal(target.searchParams.get('scope'), 'openid email profile');
  const callback = await req('/auth/google/callback?state=' + state + '&code=fake', { cookie }); assert.equal(callback.status, 302);
  const session = callback.headers.get('set-cookie').split(';')[0], response = await req('/api/state', { cookie: session }); assert.equal(response.status, 200);
  const saved = await response.json(); assert.equal(saved.IsTemporary, false); assert.equal(saved.People[0].PersonMeta.name, 'Google Bear');
  assert.equal(store.loginPerson('google@berkeley.edu'), saved.CurrentPersonID);
  store.db.prepare('INSERT INTO web_sessions VALUES(?,?,?,?)').run(require('node:crypto').createHash('sha256').update('old-demo-token').digest('hex'), saved.CurrentPersonID, 'user', Date.now() + 60000);
  assert.equal((await req('/api/state', { cookie: 'homeroom_session=old-demo-token' })).status, 401, 'legacy unverified cookies cannot restore saved Google accounts');
  assert.equal((await req('/auth/google/callback?state=' + state + '&code=fake', { cookie })).status, 400);
  assert.equal((await req('/directory')).status, 404);
});

test('Spotify search authenticates both saved and mock sessions; mock cassette saves never touch durable people', async t => {
  const queries = [];
  const { req, login, store } = await setup(t, { spotifySearch: async query => { queries.push(query); return { tracks: [{ id: '46rPcSaUj5jHxX60xWmsMD', title: 'From The Start', artist: 'Laufey' }] }; } });
  assert.equal((await req('/api/spotify/search', { method: 'POST', body: { query: 'Laufey' } })).status, 401);
  const saved = await login('saved@berkeley.edu');
  assert.equal((await req('/api/spotify/search', { method: 'POST', cookie: saved.cookie, body: { query: 'x' } })).status, 400);
  assert.equal((await req('/api/spotify/search', { method: 'POST', cookie: saved.cookie, body: { query: '  From   The Start ' } })).status, 200);
  assert.deepEqual(queries, ['From The Start']);
  assert.equal((await req('/api/spotify/search', { method: 'POST', cookie: saved.cookie, body: { query: 'another song' } })).status, 429);
  const opened = await (await req('/api/auth/mock', { method: 'POST', body: { Email: 'saved@berkeley.edu' } })).json();
  const headers = { 'X-Homeroom-Mock': opened.Token };
  assert.equal((await req('/api/spotify/search', { method: 'POST', cookie: saved.cookie, headers, body: { query: 'Laufey' } })).status, 200);
  const person = opened.State.People.find(p => p.PersonID === opened.State.CurrentPersonID);
  person.Locker.LockerBoard.Items.push({ ID: 'mock-song', Asset: { MediaAssetID: 'media:music_cassette' }, SpotifyTrack: { ID: '46rPcSaUj5jHxX60xWmsMD', Title: 'From The Start', Artist: 'Laufey' }, Title: 'From The Start', Description: 'Temporary story', X: 44, Y: 132, Width: 28, Height: 18, Orientation: 0, FlipX: false, FrameStyleID: null });
  assert.equal((await req('/api/me', { method: 'PUT', cookie: saved.cookie, headers, body: { Person: person } })).status, 200);
  assert.ok((await (await req('/api/state', { headers })).json()).People.find(p => p.PersonID === person.PersonID).Locker.LockerBoard.Items.some(it => it.SpotifyTrack));
  assert.equal(store.person(saved.state.CurrentPersonID).Locker.LockerBoard.Items.some(it => it.SpotifyTrack), false);
  await req('/api/auth/logout', { method: 'POST', headers });
  assert.equal((await req('/api/state', { headers })).status, 401);
  const fresh = await (await req('/api/auth/mock', { method: 'POST', body: { Email: 'saved@berkeley.edu' } })).json();
  assert.equal(fresh.State.People.find(p => p.PersonID === fresh.State.CurrentPersonID).Locker.LockerBoard.Items.some(it => it.SpotifyTrack), false);
});
