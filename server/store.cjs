'use strict';
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createDemo, day, shiftDay } = require('../src/demo-model.js');
const copy = value => JSON.parse(JSON.stringify(value));
const uid = kind => kind + ':' + randomUUID();
function fail(message, status = 400) { const error = new Error(message); error.status = status; throw error; }
function midnight(date) {
  let stamp = Date.parse(date + 'T00:00:00Z');
  const format = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  for (let i = 0; i < 3; i++) stamp += Date.parse(date + 'T00:00:00Z') - Date.parse(format.format(new Date(stamp)).replace(' ', 'T') + 'Z');
  return new Date(stamp).toISOString();
}
function validDay(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value; }
function defaultFixture(now) {
  const root = path.join(__dirname, '..');
  const text = fs.readFileSync(path.join(root, 'src/index.template.html'), 'utf8');
  const start = text.indexOf('const SIZES =');
  const end = text.indexOf('// Mittens', start);
  const context = vm.createContext({});
  const visuals = vm.runInContext(text.slice(start, end) + '\n;({people: PEOPLE, sizes:SIZES})', context);
  const assets = Object.fromEntries(fs.readdirSync(path.join(root, 'art/assets')).filter(f => f.endsWith('.png')).map(f => [f.slice(0, -4), true]));
  const flows = fs.readFileSync(path.join(root, 'src/flows.template.html'), 'utf8');
  const avatarStart = flows.indexOf('const AV =');
  const avatars = avatarStart < 0 ? {} : vm.runInContext(flows.slice(avatarStart, flows.indexOf('Object.entries(AV)', avatarStart)) + '\n;AV', context);
  const fixture = copy(createDemo(visuals.people, assets, visuals.sizes, now, avatars).data);
  for (const person of fixture.People) { person.IsDemo = true; person.EligibleFrom = '2000-01-01'; }
  const catalog = {EyesStyle:['dot','round','happy','sleepy','wink','lashes','glasses','star'],MouthStyle:['smile','grin','open','cat','flat'],HairStyle:['bob','long','short','bun','curly','spiky','pigtails','buzz','none','crop','sidepart','fringe','afro','ponytail','wavy'],PhotoFrame:['small','medium','large']};
  for (const [Kind, names] of Object.entries(catalog)) for (const name of names) {
    const key = ({EyesStyle:'eyes',MouthStyle:'mouth',HairStyle:'hair',PhotoFrame:'frame'})[Kind] + '_' + name;
    const mid = 'media:' + key, sid = 'system:' + key;
    if (!fixture.MediaBucket.Assets.some(a => a.ID === mid)) fixture.MediaBucket.Assets.push({ID:mid,OwnerPersonID:null,Kind:'SpritePart',StorageKey:key,MimeType:'image/png',Title:key,Description:''});
    if (!fixture.SystemAssets.some(a => a.ID === sid)) fixture.SystemAssets.push({ID:sid,Kind,MediaAssetID:mid});
  }
  fixture.DirectoryPeople = []; fixture.MatchGroups = []; fixture.Conversations = []; fixture.Messages = []; fixture.Invitations = [];
  fixture.QuestionAnswers = fixture.QuestionAnswers.filter(a => a.PersonID !== 'you');
  return fixture;
}
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).sort().join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
function jaccard(a, b, empty = 1) {
  const left = new Set(a), right = new Set(b), union = new Set([...left, ...right]);
  return union.size ? [...left].filter(x => right.has(x)).length / union.size : empty;
}
const words = value => String(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/u).filter(Boolean);
function answerScore(a, b) {
  if (!a || !b || a.QuestionID !== b.QuestionID) return 0;
  const x = a.Answer, y = b.Answer;
  if (x.Type !== y.Type) return 0;
  if (x.Type === 'SingleChoice') return Number(x.ChoiceID === y.ChoiceID);
  if (x.Type === 'MultipleChoices') return jaccard(x.ChoiceIDs, y.ChoiceIDs);
  return jaccard(words(x.Content), words(y.Content), 0);
}
function metaScore(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) return jaccard(a.map(canonical), b.map(canonical));
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = Object.keys(a).filter(k => k in b);
    return keys.length ? keys.reduce((sum, k) => sum + metaScore(a[k], b[k]), 0) / keys.length : 0;
  }
  return Number(a === b);
}
function schemaValid(value, schema) {
  if (!schema) return false;
  if (schema.Type === 'Text') return typeof value === 'string';
  if (schema.Type === 'Number') return typeof value === 'number' && Number.isFinite(value);
  if (schema.Type === 'Boolean') return typeof value === 'boolean';
  if (schema.Type === 'Enum') return schema.Options.includes(value);
  if (schema.Type === 'List') return Array.isArray(value) && value.every(v => schemaValid(v, schema.ItemSchema));
  return schema.Type === 'Record' && value && typeof value === 'object' && !Array.isArray(value) && Object.keys(schema.Fields).every(k => schemaValid(value[k], schema.Fields[k])) && Object.keys(value).every(k => k in schema.Fields);
}
class Store {
  constructor({ filename = 'data/homeroom.sqlite', now = () => new Date(), fixture, demoMode = false, temporary = false } = {}) {
    this.now = now;
    this.demoMode = demoMode;
    this.temporary = temporary;
    if (filename !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS people(id TEXT PRIMARY KEY,email TEXT UNIQUE,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY,owner TEXT REFERENCES people(id),data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS system_assets(id TEXT PRIMARY KEY,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS properties(id TEXT PRIMARY KEY,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS questions(id TEXT PRIMARY KEY,day TEXT UNIQUE NOT NULL,source TEXT NOT NULL,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS answers(person TEXT REFERENCES people(id),question TEXT REFERENCES questions(id),data TEXT NOT NULL,PRIMARY KEY(person,question));
      CREATE TABLE IF NOT EXISTS match_days(day TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS groups(id TEXT PRIMARY KEY,day TEXT NOT NULL REFERENCES match_days(day),data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS memberships(day TEXT NOT NULL,person TEXT REFERENCES people(id),group_id TEXT REFERENCES groups(id),PRIMARY KEY(day,person));
      CREATE INDEX IF NOT EXISTS memberships_group ON memberships(group_id);
      CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY,person1 TEXT NOT NULL REFERENCES people(id),person2 TEXT NOT NULL REFERENCES people(id),data TEXT NOT NULL,UNIQUE(person1,person2),CHECK(person1<person2));
      CREATE INDEX IF NOT EXISTS conversations_person2 ON conversations(person2);
      CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,conversation TEXT REFERENCES conversations(id),sender TEXT REFERENCES people(id),recipient TEXT REFERENCES people(id),created TEXT NOT NULL,data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS messages_conversation ON messages(conversation,created,id);
      CREATE INDEX IF NOT EXISTS messages_recipient ON messages(recipient);
      CREATE TABLE IF NOT EXISTS directory(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS invitations(id TEXT PRIMARY KEY,sender TEXT REFERENCES people(id),data TEXT NOT NULL);`);
    if (!this.db.prepare("SELECT 1 FROM meta WHERE key='seeded'").get()) this.transaction(() => {
      const data = fixture || defaultFixture(this.now());
      for (const p of data.People) this.putPerson({ ...p, IsDemo: p.IsDemo !== false, EligibleFrom: p.EligibleFrom || '2000-01-01' });
      for (const a of data.MediaBucket.Assets) this.putAsset(a);
      for (const a of data.SystemAssets) this.upsert('system_assets', a.ID, a);
      for (const p of data.PropertyDefinitions) this.upsert('properties', p.Key, p);
      for (const q of data.Questions) this.saveQuestion(q, 'fixture');
      for (const a of data.QuestionAnswers) this.db.prepare('INSERT OR REPLACE INTO answers VALUES(?,?,?)').run(a.PersonID, a.QuestionID, JSON.stringify(a));
      this.db.prepare("INSERT INTO meta VALUES('seeded','1')").run();
    });
    // Add newly shipped catalog entries without replacing saved people, media or placements.
    if (!fixture) this.transaction(() => {
      const catalog = defaultFixture(this.now());
      for (const asset of catalog.MediaBucket.Assets) if (!this.media(asset.ID)) this.putAsset(asset);
      for (const asset of catalog.SystemAssets) if (!this.db.prepare('SELECT 1 FROM system_assets WHERE id=?').get(asset.ID)) this.upsert('system_assets', asset.ID, asset);
      // Add preset songs to existing fictional lockers without replacing saved contents.
      const songs = catalog.People.filter(p => p.IsDemo).map(p => p.Locker.LockerBoard.Items.find(it => it.SpotifyTrack)).filter(Boolean);
      for (const person of this.rows('people').filter(p => p.IsDemo && p.OnboardingStatus === 'live')) {
        if (!songs.length || person.Locker.LockerBoard.Items.some(it => it.SpotifyTrack)) continue;
        const index = [...person.PersonID].reduce((sum, c) => sum + c.charCodeAt(0), 0) % songs.length;
        const source = catalog.People.find(p => p.PersonID === person.PersonID)?.Locker.LockerBoard.Items.find(it => it.SpotifyTrack) || songs[index];
        person.Locker.LockerBoard.Items.push({ ...copy(source), ID: uid('placement') }); this.putPerson(person);
      }
    });
  }
  close() { this.db.close(); }
  day() { return day(this.now()); }
  transaction(fn) { this.db.exec('BEGIN IMMEDIATE'); try { const value = fn(); this.db.exec('COMMIT'); return value; } catch (error) { this.db.exec('ROLLBACK'); throw error; } }
  rows(table) { return this.db.prepare('SELECT data FROM ' + table).all().map(row => JSON.parse(row.data)); }
  upsert(table, id, data) { this.db.prepare('INSERT INTO ' + table + '(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(id, JSON.stringify(data)); }
  putPerson(person, email = null) { this.db.prepare('INSERT INTO people VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(person.PersonID, email, JSON.stringify(person)); }
  putAsset(asset) { this.db.prepare('INSERT INTO assets VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(asset.ID, asset.OwnerPersonID, JSON.stringify(asset)); }
  person(id) { const row = this.db.prepare('SELECT data FROM people WHERE id=?').get(id); if (!row) fail('Unknown person.', 404); return JSON.parse(row.data); }
  loginPerson(email) {
    email = String(email).trim().toLowerCase(); if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail('Enter a valid demo email.');
    return this.transaction(() => {
      const roster = this.db.prepare('SELECT data FROM directory WHERE email=?').get(email);
      if (roster && JSON.parse(roster.data).Suspended) fail('This directory account is suspended.', 403);
      const existing = this.db.prepare('SELECT id FROM people WHERE email=?').get(email); if (existing) return existing.id;
      const template = this.rows('people').find(p => p.PersonID === 'you') || this.rows('people')[0];
      if (!template) fail('Missing starter locker.', 500);
      const id = uid('person'); const p = copy(template); p.PersonID = id; p.PersonMeta = {}; p.OnboardingStatus = 'draft'; p.IsDemo = false; p.EligibleFrom = null;
      p.Locker.LockerBoard.Items = p.Locker.LockerBoard.Items.map(item => ({ ...item, ID: uid('placement') }));
      this.putPerson(p, email);
      if (roster) { const r = JSON.parse(roster.data); r.PersonID = id; this.db.prepare('UPDATE directory SET data=? WHERE email=?').run(JSON.stringify(r), email); }
      return id;
    });
  }
  restartDemo(id) {
    if (!this.demoMode) fail('Restart is available only in demo mode.', 403);
    return this.transaction(() => {
      const person = this.person(id);
      if (person.IsDemo) fail('Cannot restart a fictional profile.', 403);
      // Retire this run and release its login so the next sign-in starts with a new
      // starter locker. Keep historical messages/uploads and other people's data.
      person.OnboardingStatus = 'draft'; person.EligibleFrom = null;
      this.putPerson(person);
      this.db.prepare('UPDATE people SET email=NULL WHERE id=?').run(id);
      for (const record of this.rows('directory').filter(r => r.PersonID === id)) {
        record.PersonID = null; this.db.prepare('UPDATE directory SET data=? WHERE id=?').run(JSON.stringify(record), record.ID);
      }
      this.db.prepare('INSERT OR REPLACE INTO meta VALUES(?,?)').run('retired-demo:' + id, this.now().toISOString());
    });
  }
  savePerson(id, payload, date = this.day()) {
    return this.transaction(() => {
      const previous = this.person(id), input = payload?.Person || payload;
      if (!input || !input.PersonMeta || !input.AvatarConfiguration || !input.Locker) fail('A complete person record is required.');
      if (previous.IsDemo) fail('Demo profiles cannot be edited.', 403);
      if (input.PersonID !== id) fail('Cannot edit another person.', 403);
      const p = { PersonID: id, PersonMeta: copy(input.PersonMeta), AvatarConfiguration: copy(input.AvatarConfiguration), Locker: copy(input.Locker), OnboardingStatus: input.OnboardingStatus, IsDemo: false, EligibleFrom: previous.EligibleFrom };
      if (!['draft', 'live'].includes(p.OnboardingStatus)) fail('Invalid onboarding state.');
      const definitions = new Map(this.rows('properties').map(x => [x.Key, x.ValueSchema]));
      if (!p.PersonMeta || Object.entries(p.PersonMeta).some(([k, v]) => !schemaValid(v, definitions.get(k)))) fail('Invalid profile metadata.');
      for (const [k, value] of Object.entries(p.PersonMeta)) {
        const limit = k === 'name' ? 22 : k === 'pronouns' ? 16 : 60;
        if ((Array.isArray(value) ? value.join(', ') : typeof value === 'string' ? value : '').length > limit) fail('Profile field is too long.');
      }
      if (payload.MediaAssets !== undefined && !Array.isArray(payload.MediaAssets)) fail('MediaAssets must be an array.');
      for (const asset of payload.MediaAssets || []) {
        const old = this.db.prepare('SELECT owner FROM assets WHERE id=?').get(asset.ID);
        if (!asset.ID || asset.OwnerPersonID !== id || (old && old.owner !== id)) fail('Cannot replace another owner’s asset.', 403);
        if (!['Photo', 'Sticker', 'Object2D'].includes(asset.Kind) || typeof asset.StorageKey !== 'string' || !asset.StorageKey || typeof asset.Title !== 'string' || asset.Title.length > 24 || typeof asset.Description !== 'string' || asset.Description.length > 160) fail('Invalid upload metadata.');
        this.putAsset(asset);
      }
      const assets = new Map(this.rows('assets').map(a => [a.ID, a])), system = new Map(this.rows('system_assets').map(a => [a.ID, a]));
      const available = mid => { const a = assets.get(mid); return a && (!a.OwnerPersonID || a.OwnerPersonID === id); };
      const cfg = p.AvatarConfiguration;
      if (!cfg || [['EyesStyleID','EyesStyle'],['MouthStyleID','MouthStyle'],['HairStyleID','HairStyle']].some(([key, kind]) => system.get(cfg[key])?.Kind !== kind) || ['SkinColor','HairColor','ShirtColor','BackgroundColor'].some(k => !/^#[a-f\d]{6}$/i.test(cfg[k])) || typeof cfg.Blush !== 'boolean') fail('Invalid avatar configuration.');
      const locker = p.Locker, items = locker?.LockerBoard?.Items, meta = locker?.LockerMeta;
      if (!Array.isArray(items) || items.length > 200 || !meta || !available(meta.InnerBackground?.MediaAssetID) || !/^#[a-f\d]{6}$/i.test(meta.OuterBackground) || !Array.isArray(meta.OuterStickers) || meta.OuterStickers.length > 1) fail('Invalid locker configuration.');
      const placementIDs = new Set();
      let musicCount = 0;
      for (const item of items) {
        if (typeof item.ID !== 'string' || !item.ID || placementIDs.has(item.ID) || !available(item.Asset?.MediaAssetID) || typeof item.Title !== 'string' || item.Title.length > 24 || typeof item.Description !== 'string' || item.Description.length > 160 || typeof item.FlipX !== 'boolean' || ['X','Y','Width','Height','Orientation'].some(k => !Number.isFinite(item[k])) || item.Width <= 0 || item.Height <= 0 || (item.FrameStyleID !== null && system.get(item.FrameStyleID)?.Kind !== 'PhotoFrame')) fail('Invalid board placement.');
        if (assets.get(item.Asset.MediaAssetID).StorageKey === 'music_cassette') {
          const track = item.SpotifyTrack;
          if (++musicCount > 1 || !track || Object.keys(track).sort().join(',') !== 'Artist,ID,Title' || typeof track.ID !== 'string' || !/^[A-Za-z0-9]{22}$/.test(track.ID) || ['Title','Artist'].some(k => typeof track[k] !== 'string' || !track[k].trim() || track[k].length > 500) || item.Description.length > 120) fail('Invalid Spotify cassette.');
        } else if (item.SpotifyTrack !== undefined) fail('Only a music cassette can contain a Spotify track.');
        placementIDs.add(item.ID);
      }
      for (const sticker of meta.OuterStickers) if (system.get(sticker.SystemAssetID)?.Kind !== 'Sticker' || ['X','Y','Width','Height'].some(k => !Number.isFinite(sticker[k])) || sticker.Width <= 0 || sticker.Height <= 0) fail('Invalid exterior sticker.');
      const text = key => typeof p.PersonMeta[key] === 'string' && p.PersonMeta[key].trim();
      const list = key => Array.isArray(p.PersonMeta[key]) && p.PersonMeta[key].some(v => v.trim());
      if (p.OnboardingStatus === 'live' && (!text('name') || !text('major') || !text('year') || !(list('interests') || list('hobbies')) || !items.some(i => i.Title.trim() && i.Description.trim()))) fail('Add your name, major, year, an interest or hobby, and an item with title and description.');
      if (p.OnboardingStatus === 'live' && previous.OnboardingStatus !== 'live') p.EligibleFrom = this.demoMode ? date : shiftDay(date, 1);
      if (p.OnboardingStatus === 'draft') p.EligibleFrom = null;
      this.putPerson(p); return p;
    });
  }
  questions() { return this.rows('questions').sort((a,b) => a.QuizDay.localeCompare(b.QuizDay)); }
  questionForDay(date = this.day()) { const row = this.db.prepare('SELECT data FROM questions WHERE day=?').get(date); return row ? JSON.parse(row.data) : null; }
  questionSource(date = this.day()) { return this.db.prepare('SELECT source FROM questions WHERE day=?').get(date)?.source || null; }
  saveQuestion(q, source = 'manual') {
    if (!q || typeof q.ID !== 'string' || !q.ID || !validDay(q.QuizDay) || typeof q.Prompt !== 'string' || !q.Prompt.trim() || q.Prompt.length > 500 || !['MultipleChoice','Checkbox','ShortResponse'].includes(q.Type) || !Array.isArray(q.Choices) || (q.Type === 'ShortResponse' ? q.Choices.length !== 0 : q.Choices.length < 2) || q.Choices.length > 20 || new Set(q.Choices.map(c => c.ID)).size !== q.Choices.length || q.Choices.some(c => typeof c.ID !== 'string' || !c.ID || typeof c.Label !== 'string' || !c.Label.trim() || c.Label.length > 200)) fail('Invalid question.');
    const existing = this.db.prepare('SELECT data FROM questions WHERE id=? OR day=?').get(q.ID, q.QuizDay);
    if (existing) { if (canonical(JSON.parse(existing.data)) === canonical(q)) return JSON.parse(existing.data); fail('A question already exists for that ID or day.', 409); }
    this.db.prepare('INSERT INTO questions VALUES(?,?,?,?)').run(q.ID, q.QuizDay, source, JSON.stringify(q)); return copy(q);
  }
  answer(id, qid, value, date = this.day()) {
    this.person(id); const q = this.questionForDay(date); if (!q || q.ID !== qid) fail('Only the active day’s quiz can be answered.');
    const choices = new Set(q.Choices.map(c => c.ID));
    const valid = value && (q.Type === 'MultipleChoice' ? value.Type === 'SingleChoice' && choices.has(value.ChoiceID) : q.Type === 'Checkbox' ? value.Type === 'MultipleChoices' && Array.isArray(value.ChoiceIDs) && new Set(value.ChoiceIDs).size === value.ChoiceIDs.length && value.ChoiceIDs.every(c => choices.has(c)) : value.Type === 'ShortText' && typeof value.Content === 'string' && !!value.Content.trim() && value.Content.length <= 200);
    if (!valid) fail('Answer does not match the question type.');
    const record = { PersonID: id, QuestionID: qid, Answer: copy(value), AnsweredAt: date === this.day() ? this.now().toISOString() : new Date(Date.parse(midnight(date)) + 12 * 3600000).toISOString() };
    this.db.prepare('INSERT OR REPLACE INTO answers VALUES(?,?,?)').run(id,qid,JSON.stringify(record)); return record;
  }
  send(sender, recipient, content, date = this.day()) {
    return this.transaction(() => {
      const from = this.person(sender), to = this.person(recipient);
      if (sender === recipient || typeof content !== 'string' || !content.trim()) fail('A message needs two people and text.');
      if (from.OnboardingStatus !== 'live' || to.OnboardingStatus !== 'live') fail('Complete onboarding before messaging.', 403);
      const [a,b] = [sender,recipient].sort();
      let conversation = this.db.prepare('SELECT data FROM conversations WHERE person1=? AND person2=?').get(a,b);
      const type = conversation ? 'direct_message' : 'locker_note', text = content.trim();
      if (text.length > 200) fail('Your message is too long.');
      if (!conversation && !this.db.prepare('SELECT 1 FROM memberships a JOIN memberships b ON a.group_id=b.group_id WHERE a.person=? AND b.person=? AND a.day=?').get(sender,recipient,date)) fail('Start conversations with an active locker neighbor.', 403);
      const lastStamp = conversation ? this.db.prepare('SELECT MAX(created) AS stamp FROM messages WHERE conversation=?').get(JSON.parse(conversation.data).ID)?.stamp : null;
      const stamp = new Date(Math.max(this.now().getTime(), lastStamp ? Date.parse(lastStamp) + 1 : 0)).toISOString();
      if (conversation) conversation = JSON.parse(conversation.data);
      else { conversation = { ID:uid('conversation'), Person1:a, Person2:b, FirstMessageTimestamp:stamp }; this.db.prepare('INSERT INTO conversations VALUES(?,?,?,?)').run(conversation.ID,a,b,JSON.stringify(conversation)); }
      const message = { ID:uid('message'), ConversationID:conversation.ID, Sender:sender, Recipient:recipient, Content:text, CreatedAt:stamp, IsOpened:false, Type:type };
      this.db.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?)').run(message.ID,conversation.ID,sender,recipient,stamp,JSON.stringify(message)); return message;
    });
  }
  openMessage(id, messageID) {
    const row = this.db.prepare('SELECT data FROM messages WHERE id=? AND recipient=?').get(messageID,id); if (!row) fail('Only the recipient can open this message.',403);
    const m = JSON.parse(row.data); m.IsOpened = true; this.db.prepare('UPDATE messages SET data=? WHERE id=?').run(JSON.stringify(m),messageID); return m;
  }
  invite(id, email) {
    this.person(id); if (typeof email !== 'string' || !/^[^@\s]+@berkeley\.edu$/i.test(email)) fail('Use a @berkeley.edu email.');
    const record = { ID:uid('invite'), SenderPersonID:id, RecipientEmail:email.toLowerCase(), CreatedAt:this.now().toISOString() }; this.db.prepare('INSERT INTO invitations VALUES(?,?,?)').run(record.ID,id,JSON.stringify(record)); return record;
  }
  importDirectory(records) {
    if (!Array.isArray(records)) fail('Expected directory records.');
    return this.transaction(() => {
      for (const input of records) {
        const email = String(input.PrimaryEmail || input.primaryEmail || '').toLowerCase(); if (!/^[^@\s]+@berkeley\.edu$/.test(email)) continue;
        const person = this.db.prepare('SELECT id FROM people WHERE email=?').get(email);
        const record = { ID:String(input.ID || input.id || 'directory:' + email), PrimaryEmail:email, DisplayName:String(input.DisplayName || input.name?.fullName || ''), PersonID:person?.id || null, Suspended:!!(input.Suspended || input.suspended) };
        this.db.prepare('INSERT INTO directory VALUES(?,?,?) ON CONFLICT(email) DO UPDATE SET data=excluded.data').run(record.ID,email,JSON.stringify(record));
      }
      return this.rows('directory').length;
    });
  }
  media(id) { const row = this.db.prepare('SELECT data FROM assets WHERE id=?').get(id); return row ? JSON.parse(row.data) : null; }
  saveMedia(id, asset) {
    this.person(id); const existing = this.media(asset.ID);
    if (!asset.ID || asset.OwnerPersonID !== id || (existing && existing.OwnerPersonID !== id)) fail('Cannot replace another owner’s asset.',403);
    if (!['Photo','Sticker','Object2D'].includes(asset.Kind) || typeof asset.StorageKey !== 'string' || !asset.StorageKey || typeof asset.MimeType !== 'string' || typeof asset.Title !== 'string' || asset.Title.length > 24 || typeof asset.Description !== 'string' || asset.Description.length > 160) fail('Invalid upload metadata.');
    this.putAsset(asset); return copy(asset);
  }
  ensureQuestion(date) {
    let q = this.questionForDay(date); if (q) return q;
    const seed = Number(date.replaceAll('-','')) % 3;
    q = { ID:'question:' + date, QuizDay:date, Prompt:['Where do you recharge between classes?','What belongs in a perfect weekend?','What are you excited to learn?'][seed], Type:['MultipleChoice','Checkbox','ShortResponse'][seed], Choices:seed === 2 ? [] : ['A quiet library','A walk outside','Food with friends','Music at home'].map((Label,i) => ({ ID:'choice:' + i, Label })) };
    return this.saveQuestion(q,'deterministic-fallback');
  }
  demoSeed(id, date = this.day()) {
    const questions = new Map(this.questions().map(q => [q.ID, q]));
    const answer = this.rows('answers').filter(a => a.PersonID === id && a.Answer && questions.get(a.QuestionID)?.QuizDay <= date)
      .sort((a, b) => questions.get(b.QuestionID).QuizDay.localeCompare(questions.get(a.QuestionID).QuizDay))[0];
    const seed = require('./demo-neighbors.cjs').seedFor(this.person(id), answer ? questions.get(answer.QuestionID) : null, answer);
    seed.Day = date;
    const previous = this.rows('groups').filter(g => g.Members.includes(id) && g.ActiveDay < date).sort((a, b) => b.ActiveDay.localeCompare(a.ActiveDay)).slice(0, 3);
    const previousIDs = new Set(previous.flatMap(g => g.Members).filter(peerID => peerID !== id));
    seed.PreviousNames = this.rows('people').filter(p => p.IsDemo && previousIDs.has(p.PersonID)).map(p => p.PersonMeta.name);
    return seed;
  }
  ensureDemoGroup(id, date, variants, reason = null, source = 'fallback') {
    if (!this.demoMode) return null;
    return this.transaction(() => {
      const person = this.person(id);
      if (person.IsDemo || person.OnboardingStatus !== 'live') return null;
      if (this.rows('directory').some(r => r.PersonID === id && r.Suspended)) return null;
      const membership = this.db.prepare('SELECT group_id FROM memberships WHERE day=? AND person=?').get(date, id);
      let group = membership && this.rows('groups').find(g => g.ID === membership.group_id);
      if (group && group.Kind !== 'demo_preview') {
        this.db.prepare('DELETE FROM memberships WHERE day=? AND person=?').run(date, id);
        group = null;
      }
      const seed = this.demoSeed(id, date);
      const templates = this.rows('people').filter(p => p.IsDemo && !p.PersonID.startsWith('demo:') && p.OnboardingStatus === 'live');
      if (!templates.length) fail('No demo lockers are available.', 500);
      if (!person.EligibleFrom || person.EligibleFrom > date) { person.EligibleFrom = date; this.putPerson(person); }
      const question = seed.Question && this.questions().find(q => q.ID === seed.Question.ID);
      this.db.prepare('INSERT OR IGNORE INTO match_days VALUES(?)').run(date);
      if (!group) group = { ID: 'group:preview:' + date + ':' + id, Kind: 'demo_preview', Members: [id], ActiveDay: date, OwnerPersonID: id };
      const peers = [];
      for (let i = 0; i < 8; i++) {
        const peerID = group.Members[i + 1] || 'demo:preview:' + date + ':' + id + ':' + i;
        const existing = this.db.prepare('SELECT data FROM people WHERE id=?').get(peerID);
        const peer = existing ? JSON.parse(existing.data) : copy(templates[(i + Number(date.replaceAll('-', ''))) % templates.length]);
        peer.PersonID = peerID; peer.IsDemo = true; peer.EligibleFrom = date;
        const v = variants[i]; peer.PersonMeta.interests = copy(v.Interests); peer.PersonMeta.hobbies = copy(v.Hobbies);
        if (v.Profile) Object.assign(peer.PersonMeta, copy(v.Profile));
        if (!existing) peer.Locker.LockerBoard.Items = peer.Locker.LockerBoard.Items.map((it, j) => ({ ...it, ID: peerID + ':placement:' + j }));
        if (v.Profile && peer.Locker.LockerBoard.Items[0]) peer.Locker.LockerBoard.Items[0].Description = (`A reminder of ${v.Interests[0] || v.Hobbies[0] || peer.PersonMeta.major}. ${peer.PersonMeta.fun || ''}`).slice(0, 160);
        this.putPerson(peer); peers.push(peer);
        if (v.Note) this.db.prepare('INSERT OR REPLACE INTO meta VALUES(?,?)').run('intro-note:' + peerID, v.Note);
        if (question && seed.Answer) {
          const answer = seed.Answer.Type === 'ShortText' ? { Type: 'ShortText', Content: v.AnswerText } : copy(seed.Answer);
          const record = { PersonID: peerID, QuestionID: question.ID, Answer: answer, AnsweredAt: this.now().toISOString() };
          this.db.prepare('INSERT OR REPLACE INTO answers VALUES(?,?,?)').run(peerID, question.ID, JSON.stringify(record));
        }
      }
      group.Members = [id, ...peers.map(p => p.PersonID)];
      group.QuestionID = question?.ID || this.ensureQuestion(shiftDay(date, -1)).ID;
      group.MatchingInputs = group.Members.map(PersonID => ({ PersonID, SourceQuestionID: question?.ID || null }));
      const common = seed.Interests[0] || seed.Hobbies[0];
      if (question && seed.Answer) {
        const answer = seed.Answer;
        const label = answer.Type === 'ShortText' ? null : question.Choices.filter(c => (answer.Type === 'SingleChoice' ? [answer.ChoiceID] : answer.ChoiceIDs).includes(c.ID)).map(c => c.Label).join(', ');
        group.Theme = question.Prompt;
        group.Reason = label ? `9 neighbors selected “${label}”.` : common ? `You share an interest in ${common}.` : answer.Type === 'MultipleChoices' ? '9 neighbors selected none of the listed activities.' : 'Your neighbors enjoy similar activities.';
      } else { group.Theme = 'Shared interests'; group.Reason = common ? `You share an interest in ${common}.` : 'A new set of neighbors to get to know.'; }
      if (typeof reason === 'string' && reason.trim() && reason.length <= 120) group.Reason = reason.trim();
      group.GenerationSource = source;
      group.OwnerPersonID = id;
      this.db.prepare('INSERT INTO groups VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(group.ID, date, JSON.stringify(group));
      for (const member of group.Members) this.db.prepare('INSERT OR IGNORE INTO memberships VALUES(?,?,?)').run(date, member, group.ID);
      return group;
    });
  }
  deliverSampleNote(id, date, intervalMs = 30000) {
    if (!this.demoMode || this.person(id).OnboardingStatus !== 'live') return null;
    const group = this.state(id, date).MatchGroups.find(g => g.Kind === 'demo_preview');
    if (!group) return null;
    const key = 'sample-notes:' + group.ID, now = this.now().getTime();
    const saved = this.db.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value;
    const progress = saved ? JSON.parse(saved) : { Sent: 0, NextAt: now + intervalMs };
    const save = () => this.db.prepare('INSERT OR REPLACE INTO meta VALUES(?,?)').run(key, JSON.stringify(progress));
    if (!saved) { save(); return null; }
    if (progress.Sent >= 4 || now < progress.NextAt) return null;
    progress.NextAt = now + intervalMs;
    const unopened = this.rows('messages').filter(m => m.Recipient === id && m.Type === 'locker_note' && !m.IsOpened).length;
    if (unopened >= 4) { save(); return null; }
    const sender = group.Members[progress.Sent + 1];
    const content = this.db.prepare('SELECT value FROM meta WHERE key=?').get('intro-note:' + sender)?.value;
    if (!content) { save(); return null; }
    const message = this.send(sender, id, content, date);
    progress.Sent++; save(); return message;
  }
  setMatchReason(groupID, reason) {
    if (typeof reason !== 'string' || !reason.trim() || reason.length > 120) fail('Invalid match reason.');
    const row = this.db.prepare('SELECT data FROM groups WHERE id=?').get(groupID);
    if (!row) fail('Unknown match group.', 404);
    const group = JSON.parse(row.data); group.Reason = reason.trim();
    this.db.prepare('UPDATE groups SET data=? WHERE id=?').run(JSON.stringify(group), groupID); return group;
  }
  clock(date = this.day()) {
    const next = Date.parse(midnight(shiftDay(date, 1))), start = Date.parse(midnight(date));
    const elapsed = this.now().getTime() - Date.parse(midnight(this.day()));
    return { ServerNow: new Date(start + Math.min(Math.max(0, elapsed), next - start - 1)).toISOString(), NextRefreshAt: new Date(next).toISOString() };
  }
  runDay(date = this.day()) {
    if (!validDay(date)) fail('Invalid matching day.');
    return this.transaction(() => {
      if (this.db.prepare('SELECT 1 FROM match_days WHERE day=?').get(date)) return this.rows('groups').filter(g => g.ActiveDay === date);
      const yesterday = shiftDay(date,-1), scheduled = this.ensureQuestion(yesterday), cutoff = midnight(date);
      const questions = new Map(this.questions().map(q => [q.ID,q]));
      const latest = new Map();
      for (const a of this.rows('answers')) {
        const q = questions.get(a.QuestionID);
        if (!a.Answer || !q || q.QuizDay > yesterday || a.AnsweredAt >= cutoff) continue;
        const old = latest.get(a.PersonID);
        if (!old || questions.get(old.QuestionID).QuizDay < q.QuizDay) latest.set(a.PersonID,a);
      }
      const all = this.rows('people'), templates = all.filter(p => p.IsDemo && p.OnboardingStatus === 'live' && !p.PersonID.startsWith('demo:'));
      const suspended = new Set(this.rows('directory').filter(r => r.Suspended && r.PersonID).map(r => r.PersonID));
      let pool = all.filter(p => !p.IsDemo && p.OnboardingStatus === 'live' && p.EligibleFrom && p.EligibleFrom <= date && !suspended.has(p.PersonID));
      pool.sort((a,b) => (questions.get(latest.get(b.PersonID)?.QuestionID)?.QuizDay || '').localeCompare(questions.get(latest.get(a.PersonID)?.QuestionID)?.QuizDay || '') || a.PersonID.localeCompare(b.PersonID));
      this.db.prepare('INSERT INTO match_days VALUES(?)').run(date);
      const results = [];
      while (pool.length) {
        const seed = pool.shift(), selected = [seed];
        const rank = candidate => {
          const a = latest.get(seed.PersonID), b = latest.get(candidate.PersonID);
          return [Number(!!a && !!b && a.QuestionID === b.QuestionID), answerScore(a,b), metaScore(seed.PersonMeta,candidate.PersonMeta)];
        };
        const compare = (a,b) => { const x = rank(a),y = rank(b); return y[0]-x[0] || y[1]-x[1] || y[2]-x[2] || a.PersonID.localeCompare(b.PersonID); };
        pool.sort(compare); selected.push(...pool.splice(0,8));
        const padding = [...templates].sort(compare);
        if (selected.length < 9 && !padding.length) fail('No demo profiles are available to fill this group.',500);
        const groupID = 'group:' + date + ':' + results.length;
        while (selected.length < 9) {
          const base = padding[(selected.length - 1) % padding.length], demo = copy(base);
          demo.PersonID = 'demo:' + date + ':' + results.length + ':' + selected.length;
          demo.IsDemo = true; demo.EligibleFrom = date;
          demo.Locker.LockerBoard.Items = demo.Locker.LockerBoard.Items.map((it,i) => ({...it,ID:demo.PersonID + ':placement:' + i}));
          this.putPerson(demo); selected.push(demo);
          const answer = latest.get(base.PersonID);
          if (answer) {
            const record = {...answer, PersonID:demo.PersonID}; latest.set(demo.PersonID,record);
            this.db.prepare('INSERT INTO answers VALUES(?,?,?)').run(demo.PersonID,record.QuestionID,JSON.stringify(record));
          }
        }
        const signals = new Map();
        for (const p of selected) {
          const answer = latest.get(p.PersonID); if (!answer) continue;
          const q = questions.get(answer.QuestionID), v = answer.Answer;
          const values = v.Type === 'SingleChoice' ? [v.ChoiceID] : v.Type === 'MultipleChoices' ? v.ChoiceIDs : [...new Set(words(v.Content))];
          for (const token of values) { const key = q.ID + '\0' + token; if (!signals.has(key)) signals.set(key,{q,token,count:0}); signals.get(key).count++; }
        }
        const signal = [...signals.values()].filter(x => x.count >= 2).sort((a,b) => b.count-a.count || b.q.QuizDay.localeCompare(a.q.QuizDay) || a.q.ID.localeCompare(b.q.ID) || a.token.localeCompare(b.token))[0];
        const label = signal && (signal.q.Choices.find(c => c.ID === signal.token)?.Label || signal.token);
        const group = { ID:groupID, Members:selected.map(p => p.PersonID), ActiveDay:date, QuestionID:scheduled.ID, MatchingInputs:selected.map(p => ({PersonID:p.PersonID,SourceQuestionID:latest.get(p.PersonID)?.QuestionID || null})), Theme:signal ? signal.q.Prompt : 'Daily neighbors', Reason:signal ? `${signal.count} neighbors ${signal.q.Type === 'ShortResponse' ? 'mentioned' : 'selected'} “${label}”.` : 'A new set of neighbors to get to know.' };
        this.db.prepare('INSERT INTO groups VALUES(?,?,?)').run(group.ID,date,JSON.stringify(group));
        for (const p of selected) this.db.prepare('INSERT INTO memberships VALUES(?,?,?)').run(date,p.PersonID,group.ID);
        results.push(group);
      }
      return results;
    });
  }
  state(id, date = this.day()) {
    this.person(id);
    const membership = this.db.prepare('SELECT group_id FROM memberships WHERE day=? AND person=?').get(date, id);
    const allGroups = this.rows('groups').filter(g => g.ID === membership?.group_id && g.ActiveDay === date && g.Members.includes(id));
    const conversations = this.db.prepare('SELECT data FROM conversations WHERE person1=? OR person2=?').all(id,id).map(r => JSON.parse(r.data));
    const related = new Set([id,...allGroups.flatMap(g => g.Members),...conversations.flatMap(c => [c.Person1,c.Person2])]);
    const people = this.rows('people').filter(p => related.has(p.PersonID));
    const placedMedia = new Set(people.flatMap(p => [p.Locker.LockerMeta.InnerBackground.MediaAssetID,...p.Locker.LockerBoard.Items.map(it => it.Asset.MediaAssetID)]));
    const assets = this.rows('assets').filter(a => !a.OwnerPersonID || a.OwnerPersonID === id || placedMedia.has(a.ID));
    const conversationIDs = new Set(conversations.map(c => c.ID));
    return { CurrentPersonID:id, ActiveDay:date, ...this.clock(date), DemoMode:this.demoMode, IsTemporary:this.temporary, People:people, PropertyDefinitions:this.rows('properties'), Questions:this.questions(), QuestionAnswers:this.rows('answers').filter(a => a.PersonID === id), MatchGroups:allGroups, Conversations:conversations, Messages:this.rows('messages').filter(m => conversationIDs.has(m.ConversationID)).sort((a,b) => a.CreatedAt.localeCompare(b.CreatedAt) || a.ID.localeCompare(b.ID)), MediaBucket:{BucketName:'local-sqlite',Assets:assets}, SystemAssets:this.rows('system_assets'), DirectoryPeople:[], Invitations:this.rows('invitations').filter(i => i.SenderPersonID === id) };
  }
  exportData() { return { People:this.rows('people'), PropertyDefinitions:this.rows('properties'), Questions:this.questions(), QuestionAnswers:this.rows('answers'), MatchGroups:this.rows('groups'), Conversations:this.rows('conversations'), Messages:this.rows('messages'), MediaBucket:{BucketName:'local-sqlite',Assets:this.rows('assets')}, SystemAssets:this.rows('system_assets'), DirectoryPeople:this.rows('directory'), Invitations:this.rows('invitations') }; }
}
module.exports = { Store, midnight, answerScore, metaScore };
