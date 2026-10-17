'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { Store } = require('../server/store.cjs');
const copy = value => JSON.parse(JSON.stringify(value));
const flush = () => new Promise(resolve => setImmediate(resolve));

function setup(t) {
  const store = new Store({ filename: ':memory:', now: () => new Date('2026-10-17T20:00:00Z') });
  t.after(() => store.close());
  let personID = store.loginPerson('adapter@berkeley.edu');
  const requests = [], streams = [];
  const handler = async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : undefined;
    requests.push({ url, ...options, body });
    try {
      if (url === '/api/spotify/search') return { ok: true, json: async () => ({ tracks: [{ id: '6fwW6uPloanwDx78kBvH0N', title: 'Spring (The Valley Comes Alive)', artist: 'ConcernedApe' }] }) };
      if (url === '/api/auth/demo') personID = store.loginPerson(body.Email);
      if (url === '/api/me') store.savePerson(personID, body);
      if (url === '/api/answers') store.answer(personID, body.QuestionID, body.Answer);
      if (url === '/api/messages/open') store.openMessage(personID, body.MessageID);
      if (url === '/api/invitations') return { ok: true, json: async () => store.invite(personID, body.Email) };
      if (url === '/api/messages') return { ok: true, json: async () => store.send(personID, body.Recipient, body.Content) };
      return { ok: true, json: async () => copy(store.state(personID)) };
    } catch (error) { return { ok: false, status: error.status || 500, json: async () => ({ error: error.message }) }; }
  };
  let fetchImpl = handler;
  const context = vm.createContext({
    fetch: (...args) => fetchImpl(...args), crypto, LOCKER_COLORS: { blue: '#7593d4' },
    sz: () => [20, 24],
    canvas: (width, height) => [{ width, height, toDataURL: () => 'data:image/png;base64,fixture' }, { drawImage() {} }],
    EventSource: class {
      constructor(url) { this.url = url; this.events = {}; streams.push(this); }
      addEventListener(name, handler) { this.events[name] = handler; }
      close() { this.closed = true; }
    },
  });
  vm.runInContext(fs.readFileSync('src/remote-model.js', 'utf8'), context);
  const memory = { data: store.state(personID), answerLabel: () => 'label', shiftDay: require('../src/demo-model.js').shiftDay };
  const model = new context.HomeroomRemote.RemoteModel(memory);
  const profile = { name: 'Adapter Bear', major: 'CS', year: '2027', interests: 'hiking, drawing', hobbies: '', skin: 'blue', paper: 'floral', doorSticker: 'sticker_star' };
  const sprite = { eyes: 'star', mouth: 'cat', hairStyle: 'curly', skin: '#efc7a2', hair: '#2a2026', shirt: '#fffaf0', bg: '#fff1b8', blush: false };
  const placements = [{ base: 'plant', kind: 'object', scale: 1.5, cx: 25, cy: 35, rot: 30, flip: true, title: 'My plant', desc: 'A story about my plant' }];
  return { model, store, personID, requests, streams, handler, profile, sprite, placements, setFetch(value) { fetchImpl = value; } };
}

test('RemoteModel publishes actual store-compatible avatar, profile and placement records', async t => {
  const f = setup(t);
  await f.model.restore();
  await f.model.publish(f.profile, f.sprite, f.placements);
  const person = f.store.person(f.personID);
  assert.equal(person.OnboardingStatus, 'live');
  assert.deepEqual(person.PersonMeta.interests, ['hiking', 'drawing']);
  assert.equal(person.AvatarConfiguration.Blush, false);
  assert.equal(person.AvatarConfiguration.EyesStyleID, 'system:eyes_star');
  const item = person.Locker.LockerBoard.Items[0];
  assert.equal(item.Width, 30);
  assert.equal(item.Height, 36);
  assert.equal(item.X, 10);
  assert.equal(item.Y, 17);
  assert.equal(item.Orientation, 30);
  assert.equal(item.FlipX, true);
  assert.equal(item.Asset.MediaAssetID, 'media:plant');
  assert.deepEqual(person.Locker.LockerMeta.OuterStickers, []);
  assert.equal(person.EligibleFrom, '2026-10-18');
  const initialID = item.ID;
  f.placements[0].title = 'New title';
  await f.model.publish(f.profile, f.sprite, f.placements);
  assert.equal(f.store.person(f.personID).Locker.LockerBoard.Items[0].ID, initialID);
  assert.equal(f.model.currentPerson().Locker.LockerBoard.Items[0].Title, 'New title');
  assert.ok(f.requests.every(request => request.credentials === 'same-origin'));
});

test('RemoteModel retains canonical owned upload references across publish and restore', async t => {
  const f = setup(t);
  await f.model.restore();
  const asset = { ID: 'media:upload-one', OwnerPersonID: f.personID, Kind: 'Photo', StorageKey: '/media/upload-one', MimeType: 'image/png', Title: 'Bank default', Description: 'Default story' };
  f.store.saveMedia(f.personID, asset);
  const placement = { upload: { width: 800, height: 600 }, kind: 'photo', assetKey: 'temporary-upload-key', mediaID: asset.ID, sourceWidth: 800, sourceHeight: 600, scale: 1, size: 2, cx: 60, cy: 60, rot: -15, flip: false, title: 'This copy', desc: 'This copy has its own story' };
  await f.model.publish(f.profile, f.sprite, [placement]);
  const saved = f.store.person(f.personID).Locker.LockerBoard.Items[0];
  assert.equal(saved.Asset.MediaAssetID, asset.ID);
  assert.equal(saved.FrameStyleID, 'system:frame_large');
  assert.equal(saved.Width, 36);
  assert.equal(saved.Height, 42);
  assert.equal(f.store.media(asset.ID).Title, 'Bank default');
  assert.equal(saved.Title, 'This copy');
  assert.equal(f.requests.find(request => request.url === '/api/me').body.MediaAssets, undefined);
});

test('RemoteModel preserves API errors and rejects a missing upload reference without saving', async t => {
  const f = setup(t);
  await f.model.restore();
  await assert.rejects(f.model.publish({ ...f.profile, name: '' }, f.sprite, f.placements), error => error.status === 400);
  const count = f.requests.length;
  await assert.rejects(f.model.publish(f.profile, f.sprite, [{ ...f.placements[0], base: null, upload: { width: 20, height: 24 }, assetKey: 'missing' }]), /upload to finish/);
  assert.equal(f.requests.length, count);
});

test('an in-flight SSE refresh cannot overwrite a successful profile save with an old snapshot', async t => {
  const f = setup(t);
  await f.model.restore();
  const oldState = copy(f.store.state(f.personID));
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let held = false;
  f.setFetch(async (url, options) => {
    if (url === '/api/state' && !held) { held = true; await gate; return { ok: true, json: async () => oldState }; }
    return f.handler(url, options);
  });
  const refresh = f.model.refresh();
  await flush();
  const publish = f.model.publish(f.profile, f.sprite, f.placements);
  await flush();
  release();
  await Promise.all([refresh, publish]);
  assert.equal(f.store.person(f.personID).OnboardingStatus, 'live');
  assert.equal(f.model.currentPerson().OnboardingStatus, 'live');
  assert.equal(f.model.currentPerson().PersonMeta.name, 'Adapter Bear');
});

test('RemoteModel serialization prevents asynchronous state hydrations from overlapping', async t => {
  const f = setup(t);
  await f.model.restore();
  let active = 0, maximum = 0;
  f.model.onChange = async () => { active++; maximum = Math.max(maximum, active); await flush(); active--; };
  const q = f.model.questionForDay();
  await Promise.all([
    f.model.refresh(),
    f.model.submitAnswer(f.personID, q.ID, { Type: 'SingleChoice', ChoiceID: q.Choices[0].ID }),
  ]);
  assert.equal(maximum, 1);
});

test('failed mutations leave canonical client records untouched and do not poison later refreshes', async t => {
  const f = setup(t);
  await f.model.restore();
  const before = copy(f.model.data);
  f.setFetch(async (url, options) => url === '/api/answers' || url === '/api/uploads'
    ? { ok: false, status: 403, json: async () => ({ error: 'Not permitted' }) }
    : f.handler(url, options));
  const q = f.model.questionForDay();
  await assert.rejects(f.model.submitAnswer(f.personID, q.ID, { Type: 'SingleChoice', ChoiceID: q.Choices[0].ID }), error => error.status === 403);
  assert.deepEqual(copy(f.model.data), before);
  await assert.rejects(f.model.registerUpload('failed-upload', 'Title', 'Story', 'photo', { width: 20, height: 24 }), error => error.status === 403);
  assert.equal(f.model.uploadRecords.has('failed-upload'), false);
  assert.deepEqual(copy(f.model.data), before);
  await f.model.refresh();
  assert.equal(f.model.currentPerson().PersonID, f.personID);
});

test('a delivered message remains successful when the follow-up refresh fails', async t => {
  const f = setup(t);
  await f.model.restore();
  await f.model.publish(f.profile, f.sprite, f.placements);
  const recipient = f.store.loginPerson('recipient@berkeley.edu');
  f.store.savePerson(recipient, { Person: { ...copy(f.store.person(f.personID)), PersonID: recipient } });
  for (const id of [f.personID, recipient]) f.store.putPerson({ ...f.store.person(id), EligibleFrom: '2000-01-01' });
  f.store.runDay();
  await f.model.refresh();
  let posts = 0;
  f.setFetch(async (url, options) => {
    if (url === '/api/messages') posts++;
    if (url === '/api/state') return { ok: false, status: 503, json: async () => ({ error: 'Temporarily unavailable' }) };
    return f.handler(url, options);
  });
  const message = await f.model.send(f.personID, recipient, 'Delivered once');
  assert.equal(message.Type, 'locker_note');
  assert.equal(posts, 1);
  assert.equal(f.store.rows('messages').filter(row => row.Content === 'Delivered once').length, 1);
  assert.ok(f.model.data.Messages.some(row => row.ID === message.ID));
});

test('a persisted upload remains successful and reusable when follow-up state refresh fails', async t => {
  const f = setup(t);
  await f.model.restore();
  let posts = 0;
  f.setFetch(async (url, options) => {
    if (url === '/api/uploads') {
      posts++;
      const payload = JSON.parse(options.body);
      const asset = { ID: 'media:post-succeeded', OwnerPersonID: f.personID, Kind: payload.Kind, StorageKey: '/media/post-succeeded', MimeType: 'image/png', Title: payload.Title, Description: payload.Description };
      f.store.saveMedia(f.personID, asset);
      return { ok: true, json: async () => asset };
    }
    if (url === '/api/state') return { ok: false, status: 503, json: async () => ({ error: 'Temporarily unavailable' }) };
    return f.handler(url, options);
  });
  const asset = await f.model.registerUpload('reusable-key', 'Uploaded', 'My story', 'photo', { width: 100, height: 50 });
  assert.equal(posts, 1);
  assert.equal(asset.ID, 'media:post-succeeded');
  assert.equal(f.model.uploadRecords.get('reusable-key').ID, asset.ID);
  assert.equal(f.store.media(asset.ID).OwnerPersonID, f.personID);
});

async function browserFixture(t, f) {
  const { JSDOM, VirtualConsole } = require('jsdom');
  const assets = Object.fromEntries(fs.readdirSync('art/assets').filter(file => file.endsWith('.png')).map(file => [file.slice(0, -4), 'data:image/png;base64,fixture']));
  assets.hallway = 'data:image/png;base64,fixture';
  const html = '<!doctype html><html><head><meta charset="utf-8"></head><body>'
    + fs.readFileSync('src/index.template.html', 'utf8').replace('__ASSETS__', JSON.stringify(assets)).replace('__MUSIC_STYLES__', fs.readFileSync('src/music.css', 'utf8')).replace('__MUSIC_SCRIPT__', fs.readFileSync('src/music.js', 'utf8'))
    + '<script>' + fs.readFileSync('src/demo-model.js', 'utf8') + '</script>'
    + '<script>' + fs.readFileSync('src/remote-model.js', 'utf8') + '</script>'
    + fs.readFileSync('src/flows.template.html', 'utf8') + '</body></html>';
  const errors = [];
  const dom = new JSDOM(html, {
    url: 'http://localhost:3000/', runScripts: 'dangerously', pretendToBeVisual: true,
    virtualConsole: new VirtualConsole().on('jsdomError', error => errors.push(error)),
    beforeParse(window) {
      window.fetch = f.handler;
      window.EventSource = class { constructor() { this.events = {}; } addEventListener(name, callback) { this.events[name] = callback; } close() {} };
      window.matchMedia = () => ({ matches: true });
      window.HTMLCanvasElement.prototype.getContext = function () {
        return new Proxy({ getImageData: (x, y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }), drawImage() {} }, { get: (object, key) => object[key] || (() => {}) });
      };
      window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,fixture';
      window.HTMLElement.prototype.animate = () => ({});
      window.Image = class {
        constructor() { this.width = this.naturalWidth = 20; this.height = this.naturalHeight = 24; }
        set src(value) { this._src = value; queueMicrotask(() => this.onload?.()); }
        get src() { return this._src; }
      };
    },
  });
  t.after(() => { dom.window.close(); assert.deepEqual(errors.map(error => error.message), []); });
  for (let count = 0; count < 100 && !dom.window.document.querySelector('.locker'); count++) await new Promise(resolve => setTimeout(resolve, 10));
  return dom;
}

test('real server record shapes hydrate into editable locker items and persist without losing ownership', async t => {
  const f = setup(t);
  await f.model.restore();
  const asset = { ID: 'media:browser-upload', OwnerPersonID: f.personID, Kind: 'Photo', StorageKey: '/media/browser-upload', MimeType: 'image/png', Title: 'Bank default', Description: 'Bank description' };
  f.store.saveMedia(f.personID, asset);
  await f.model.publish(f.profile, f.sprite, [{ upload: { width: 200, height: 100 }, kind: 'photo', mediaID: asset.ID, sourceWidth: 200, sourceHeight: 100, size: 2, scale: 1, cx: 70, cy: 80, rot: 20, flip: true, title: 'My photo', desc: 'My photo story' }]);
  const original = copy(f.store.person(f.personID));
  const dom = await browserFixture(t, f);
  const ui = dom.window.eval('({ profile, items, appModel })');
  assert.equal(ui.profile.name, original.PersonMeta.name);
  assert.equal(ui.profile.live, true);
  assert.equal(dom.window.document.querySelectorAll('.locker').length, 1);
  assert.equal(ui.items[0].mediaID, asset.ID);
  assert.equal(ui.items[0].persistedID, original.Locker.LockerBoard.Items[0].ID);
  assert.equal(ui.items[0].size, 2);
  assert.equal(ui.items[0].flip, true);
  assert.equal(ui.items[0].full, asset.StorageKey);
  dom.window.eval('openLocker(ME)');
  const photo = dom.window.document.querySelector('#items .hasfull'); assert.ok(photo); photo.click();
  const full = dom.window.document.querySelector('#lockerDialog .fullpic');
  assert.ok(full.src.endsWith(asset.StorageKey)); assert.ok(full.closest('.photo'));
  dom.window.eval('closeLocker()');
  await dom.window.eval('openEditor(2)');
  dom.window.eval('items[0].title = "Edited photo"');
  await dom.window.eval('goLive()');
  const persisted = f.store.person(f.personID).Locker.LockerBoard.Items[0];
  assert.equal(persisted.Title, 'Edited photo');
  assert.equal(persisted.ID, original.Locker.LockerBoard.Items[0].ID);
  assert.equal(persisted.Asset.MediaAssetID, asset.ID);
  assert.equal(persisted.Width, 36);
  assert.equal(persisted.Height, 42);
  assert.equal(f.store.media(asset.ID).OwnerPersonID, f.personID);
});

test('music search forwards the temporary session and cancellation signal', async t => {
  const f = setup(t); await f.model.restore(); f.model.mockToken = 'temporary-token';
  const controller = new AbortController(); await f.model.searchSpotify('Stardew', controller.signal);
  const request = f.requests.at(-1);
  assert.equal(request.url, '/api/spotify/search');
  assert.equal(request.headers['X-Homeroom-Mock'], 'temporary-token');
  assert.equal(request.signal, controller.signal);
});

test('cassette picker stays draft until locker save, restores full tracks, plays, and removes through the same save flow', async t => {
  const f = setup(t); await f.model.restore(); await f.model.publish(f.profile, f.sprite, f.placements);
  const dom = await browserFixture(t, f), w = dom.window, doc = w.document;
  const waitFor = async predicate => { for (let i = 0; i < 100 && !predicate(); i++) await new Promise(r => setTimeout(r, 5)); assert.ok(predicate()); };
  const songSaved = () => f.store.person(f.personID).Locker.LockerBoard.Items.find(it => it.SpotifyTrack);
  w.localStorage.setItem('homeroom.locker-song.v1', JSON.stringify({ id: '46rPcSaUj5jHxX60xWmsMD', title: 'Leaked browser song', artist: 'Old account' }));
  await w.eval('openEditor(2)');
  assert.equal(w.eval('items.some(it => it.song)'), false);
  await w.eval("addItem('music_cassette', 'object', 95, 130)");
  doc.querySelector('#songSearch').value = 'Stardew';
  doc.querySelector('.music-search-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => doc.querySelector('.music-result'));
  doc.querySelector('.music-result').click(); doc.querySelector('#songCaption').value = 'My study soundtrack';
  doc.querySelector('.music-footer .primary').click(); await waitFor(() => !doc.querySelector('.music-overlay'));
  assert.equal(songSaved(), undefined);
  assert.equal(w.eval('items.filter(it => it.song).length'), 1);
  assert.equal(w.eval('sel.song.title'), 'Spring (The Valley Comes Alive)');
  w.eval('openMusicEditor()'); doc.querySelector('#songCaption').value = 'Cancelled story';
  doc.querySelector('.music-close').click(); assert.equal(w.eval('items.find(it => it.song).desc'), 'My study soundtrack');
  await w.eval("(async () => { const it = items.find(it => it.song); Object.assign(it, { scale: 2, rot: 30, flip: true, cx: 80, cy: 115 }); await bake(it); })()");
  await w.eval('goLive()');
  assert.equal(songSaved().SpotifyTrack.Title, 'Spring (The Valley Comes Alive)');
  assert.equal(songSaved().Width, 56); assert.equal(songSaved().Height, 36);
  assert.equal(songSaved().Orientation, 30); assert.equal(songSaved().FlipX, true);
  await w.eval('appModel.refresh()');
  assert.equal(w.eval('items.find(it => it.song).song.artist'), 'ConcernedApe');
  w.eval('openLocker(ME)'); doc.querySelector('#items [aria-label^="Listen to"]').click();
  assert.equal(doc.querySelector('.spotify-frame').src, 'https://open.spotify.com/embed/track/6fwW6uPloanwDx78kBvH0N?theme=0');
  doc.querySelector('.music-close').click(); assert.equal(doc.querySelector('#stage').inert, false);
  w.eval('closeLocker()'); await w.eval('openEditor(2)');
  w.eval('select(items.find(it => it.song))'); doc.querySelector('#editor [title="remove"]').click();
  assert.ok(songSaved()); await w.eval('goLive()'); assert.equal(songSaved(), undefined);
});
