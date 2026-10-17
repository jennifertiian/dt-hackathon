'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store, midnight, answerScore } = require('../server/store.cjs');
function setup(filename = ':memory:') {
  let instant = new Date('2026-10-17T20:00:00Z');
  const store = new Store({ filename, now: () => instant });
  return { store, setTime(value) { instant = new Date(value); } };
}
function publish(store,email='student@berkeley.edu') {
  const id = store.loginPerson(email), p = store.person(id);
  p.PersonMeta = { name:'Student', major:'CS', year:'2027', interests:['hiking'], hobbies:[] }; p.OnboardingStatus = 'live';
  store.savePerson(id,{Person:p}); return id;
}
test('SQLite persists people, publication and independent upload bank across reopen', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'homeroom-store-')), filename = path.join(dir,'test.sqlite');
  let { store } = setup(filename);
  const id = publish(store);
  store.saveMedia(id,{ID:'upload:1',OwnerPersonID:id,Kind:'Photo',StorageKey:'/media/upload1',MimeType:'image/png',Title:'photo',Description:'my photo'});
  store.close();
  store = setup(filename).store;
  assert.equal(store.loginPerson('STUDENT@BERKELEY.EDU'),id);
  assert.equal(store.person(id).EligibleFrom,'2026-10-18');
  assert.equal(store.state(id).MediaBucket.Assets.find(a => a.ID === 'upload:1').Title,'photo');
  store.close(); fs.rmSync(dir,{recursive:true,force:true});
});
test('incomplete users remain drafts, real newly published users wait until next midnight', () => {
  const { store } = setup();
  const draft = store.loginPerson('draft@berkeley.edu');
  const p = store.person(draft); p.OnboardingStatus = 'live';
  assert.throws(() => store.savePerson(draft,{Person:p}),/Add your name/);
  const live = publish(store);
  assert.deepEqual(store.runDay('2026-10-17'),[]);
  const groups = store.runDay('2026-10-18');
  assert.equal(groups.length,1); assert.equal(groups[0].Members.length,9);
  assert.ok(groups[0].Members.includes(live)); assert.ok(!groups[0].Members.includes(draft));
  assert.equal(groups[0].Members.filter(id => store.person(id).IsDemo).length,8);
  assert.equal(new Set(groups[0].Members).size,9);
  assert.deepEqual(store.runDay('2026-10-18'),groups);
  store.close();
});
test('matching covers every real eligible person once, with complete shared groups and demo fill', () => {
  const { store } = setup();
  const real = Array.from({length:11},(_,i) => publish(store,`student${i}@berkeley.edu`));
  const groups = store.runDay('2026-10-18'), all = groups.flatMap(g => g.Members);
  assert.equal(groups.length,2); assert.equal(new Set(all).size,18);
  for (const id of real) assert.equal(all.filter(x => x === id).length,1);
  for (const g of groups) {
    assert.equal(g.MatchingInputs.length,9); assert.equal(g.QuestionID,store.questionForDay('2026-10-17').ID);
    for (const id of g.Members.filter(id => !store.person(id).IsDemo)) assert.deepEqual(store.state(id,'2026-10-18').MatchGroups,[g]);
  }
  store.close();
});
test('matching snapshots only answers before cutoff and uses latest previous question', () => {
  const { store, setTime } = setup(), id = publish(store);
  const q = store.questionForDay();
  store.answer(id,q.ID,{Type:'SingleChoice',ChoiceID:q.Choices[0].ID});
  setTime('2026-10-18T20:00:00Z');
  const group = store.runDay()[0];
  assert.equal(group.MatchingInputs.find(i => i.PersonID === id).SourceQuestionID,q.ID);
  store.ensureQuestion('2026-10-18');
  const today = store.questionForDay();
  const answer = today.Type === 'ShortResponse' ? {Type:'ShortText',Content:'hiking'} : today.Type === 'Checkbox' ? {Type:'MultipleChoices',ChoiceIDs:[]} : {Type:'SingleChoice',ChoiceID:today.Choices[0].ID};
  store.answer(id,today.ID,answer);
  assert.deepEqual(store.runDay()[0],group);
  store.close();
});
test('recipient-only boolean opening and one conversation for either sending direction', () => {
  const { store, setTime } = setup(), a = publish(store,'a@berkeley.edu'), b = publish(store,'b@berkeley.edu');
  assert.throws(() => store.send(a,b,'hi'),/active locker neighbor/);
  setTime('2026-10-18T20:00:00Z'); store.runDay();
  const first = store.send(a,b,'hello'); assert.equal(first.Type,'locker_note');
  assert.throws(() => store.openMessage(a,first.ID),error => error.status === 403);
  store.openMessage(b,first.ID); store.openMessage(b,first.ID);
  const reply = store.send(b,a,'hey'), third = store.send(a,b,'how are you?');
  assert.equal(reply.Type,'direct_message'); assert.equal(third.ConversationID,first.ConversationID);
  const state = store.state(a); assert.equal(state.Conversations.length,1); assert.equal(state.Messages.length,3);
  assert.equal(state.Messages.find(m => m.ID === first.ID).IsOpened,true);
  assert.ok(state.Messages.every(m => !('ReadAt' in m)));
  setTime('2026-10-19T20:00:00Z'); store.runDay();
  store.send(a,b,'still here'); assert.equal(store.state(b).Messages.length,4);
  store.close();
});
test('state hides roster, unrelated conversations, unrelated profiles, answers and private uploads', () => {
  const { store, setTime } = setup(), a = publish(store,'a@berkeley.edu'), b = publish(store,'b@berkeley.edu'), outsider = store.loginPerson('outside@berkeley.edu');
  store.importDirectory([{id:'private',primaryEmail:'private@berkeley.edu',name:{fullName:'Private Member'}}]);
  store.saveMedia(b,{ID:'private-upload',OwnerPersonID:b,Kind:'Photo',StorageKey:'/media/private',MimeType:'image/png',Title:'secret',Description:'private bank'});
  setTime('2026-10-18T20:00:00Z'); store.runDay(); store.send(a,b,'hello');
  const state = store.state(outsider);
  assert.equal(state.People.length,1); assert.equal(state.People[0].PersonID,outsider);
  assert.equal(state.Conversations.length,0); assert.equal(state.Messages.length,0); assert.deepEqual(state.DirectoryPeople,[]);
  assert.ok(!store.state(a).MediaBucket.Assets.some(x => x.ID === 'private-upload'));
  assert.throws(() => store.saveMedia(a,{...store.media('private-upload'),OwnerPersonID:a}),error => error.status === 403);
  store.close();
});
test('typed answers reject mismatches, duplicates and choice IDs from other questions', () => {
  const { store } = setup(), id = publish(store), q = store.questionForDay();
  assert.throws(() => store.answer(id,q.ID,{Type:'ShortText',Content:'hi'}),/type/);
  assert.throws(() => store.answer(id,q.ID,{Type:'SingleChoice',ChoiceID:'wrong'}),/type/);
  const checkbox = store.saveQuestion({ID:'check',QuizDay:'2026-11-01',Prompt:'Select',Type:'Checkbox',Choices:[{ID:'a',Label:'A'},{ID:'b',Label:'B'}]});
  assert.throws(() => store.answer(id,checkbox.ID,{Type:'MultipleChoices',ChoiceIDs:['a','a']},checkbox.QuizDay),/type/);
  const record = store.answer(id,checkbox.ID,{Type:'MultipleChoices',ChoiceIDs:[]},checkbox.QuizDay);
  assert.deepEqual(record.Answer.ChoiceIDs,[]); assert.ok(record.AnsweredAt);
  assert.equal(answerScore(record,record),1);
  store.close();
});
test('question dates and IDs are unique, malformed dates rejected, onboarding rejects stolen placements', () => {
  const { store } = setup(), id = publish(store), other = publish(store,'other@berkeley.edu');
  const q = store.questionForDay();
  assert.throws(() => store.saveQuestion({...q,ID:'duplicate'}),error => error.status === 409);
  assert.throws(() => store.saveQuestion({...q,ID:'invalid',QuizDay:'2026-02-31'}),/Invalid question/);
  store.saveMedia(other,{ID:'stolen',OwnerPersonID:other,Kind:'Photo',StorageKey:'/media/stolen',MimeType:'image/png',Title:'photo',Description:'secret'});
  const p = store.person(id); p.Locker.LockerBoard.Items[0].Asset.MediaAssetID = 'stolen';
  assert.throws(() => store.savePerson(id,{Person:p}),/Invalid board/);
  const p2 = store.person(id); p2.PersonID = other;
  assert.throws(() => store.savePerson(id,{Person:p2}),error => error.status === 403);
  store.close();
});
test('Berkeley midnight cutoff handles daylight saving time transitions', () => {
  assert.equal(midnight('2026-03-08'),'2026-03-08T08:00:00.000Z');
  assert.equal(midnight('2026-03-09'),'2026-03-09T07:00:00.000Z');
  assert.equal(midnight('2026-11-01'),'2026-11-01T07:00:00.000Z');
  assert.equal(midnight('2026-11-02'),'2026-11-02T08:00:00.000Z');
});

test('unopened old notes remain visible and replyable without current shared membership', () => {
  const { store, setTime } = setup(), a = publish(store, 'old-a@berkeley.edu'), b = publish(store, 'old-b@berkeley.edu');
  setTime('2026-10-18T20:00:00Z'); store.runDay();
  const first = store.send(a, b, 'an older unopened note');
  setTime('2026-10-19T20:00:00Z'); // no group has been assigned on this date
  assert.equal(store.state(b).MatchGroups.length, 0);
  assert.ok(store.state(b).Messages.some(m => m.ID === first.ID && !m.IsOpened));
  store.openMessage(b, first.ID);
  const reply = store.send(b, a, 'x'.repeat(200));
  assert.equal(reply.ConversationID, first.ConversationID); assert.equal(reply.Type, 'direct_message');
  assert.equal(store.state(b).Conversations.length, 1); assert.equal(store.state(b).Messages.length, 2);
  assert.throws(() => store.send(b, a, 'x'.repeat(201)), /too long/); store.close();
});

test('server countdown follows the active simulated day and handles 23/25-hour days', () => {
  const { store, setTime } = setup();
  for (const [date, hours] of [['2026-03-08', 23], ['2026-11-01', 25]]) {
    setTime(midnight(date)); const clock = store.clock();
    assert.equal((Date.parse(clock.NextRefreshAt) - Date.parse(clock.ServerNow)) / 3600000, hours);
  }
  setTime('2026-10-17T20:00:00Z');
  const clock = store.clock('2026-11-01');
  assert.equal(clock.NextRefreshAt, '2026-11-02T08:00:00.000Z');
  assert.ok(Date.parse(clock.ServerNow) >= Date.parse(midnight('2026-11-01')));
  assert.ok(Date.parse(clock.ServerNow) < Date.parse(clock.NextRefreshAt)); store.close();
});

test('personalized sample notes arrive on cadence, cap at four unopened and retain the per-day budget', () => {
  const { store, setTime } = setup(); store.demoMode = true;
  try {
    const id = publish(store), date = store.day(), seed = store.demoSeed(id, date);
    const variants = require('../server/demo-neighbors.cjs').fallback(seed);
    store.ensureDemoGroup(id, date, variants);
    assert.equal(store.deliverSampleNote(id, date, 30000), null);
    setTime('2026-10-17T20:00:29Z'); assert.equal(store.deliverSampleNote(id, date, 30000), null);
    for (let i = 1; i <= 4; i++) {
      setTime(new Date(Date.parse('2026-10-17T20:00:00Z') + i * 30000).toISOString());
      const note = store.deliverSampleNote(id, date, 30000); assert.ok(note); assert.equal(note.Type, 'locker_note'); assert.match(note.Content, /hiking/);
      assert.equal(store.deliverSampleNote(id, date, 30000), null);
    }
    setTime('2026-10-17T21:00:00Z'); assert.equal(store.deliverSampleNote(id, date, 30000), null);
    const notes = store.state(id, date).Messages; assert.equal(notes.length, 4);
    store.openMessage(id, notes[0].ID); assert.equal(store.deliverSampleNote(id, date, 30000), null);
    const tomorrow = '2026-10-18'; store.ensureDemoGroup(id, tomorrow, require('../server/demo-neighbors.cjs').fallback(store.demoSeed(id, tomorrow)));
    store.deliverSampleNote(id, tomorrow, 30000); setTime('2026-10-17T21:00:30Z'); assert.ok(store.deliverSampleNote(id, tomorrow, 30000));
    setTime('2026-10-17T21:01:00Z'); assert.equal(store.deliverSampleNote(id, tomorrow, 30000), null);
    assert.equal(store.state(id, tomorrow).Messages.filter(m => m.Type === 'locker_note' && !m.IsOpened).length, 4);
  } finally { store.close(); }
});

test('Spotify cassette persists full titles and transforms, validates track data, and removes on locker save', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'homeroom-song-')), filename = path.join(dir, 'db.sqlite');
  let { store } = setup(filename);
  try {
    const id = publish(store), person = store.person(id);
    const song = { ID: 'song-placement', Asset: { MediaAssetID: 'media:music_cassette' }, SpotifyTrack: { ID: '6fwW6uPloanwDx78kBvH0N', Title: 'Spring (The Valley Comes Alive)', Artist: 'ConcernedApe' }, Title: 'Spring (The Valley Comes', Description: 'My study soundtrack', X: 44, Y: 110, Width: 56, Height: 36, Orientation: 30, FlipX: true, FrameStyleID: null };
    person.Locker.LockerBoard.Items.push(song); store.savePerson(id, { Person: person });
    store.close(); store = setup(filename).store;
    const saved = store.person(id); assert.deepEqual(saved.Locker.LockerBoard.Items.at(-1), song);
    for (const invalid of [
      { ...song, SpotifyTrack: { ...song.SpotifyTrack, ID: '../../bad' } },
      { ...song, SpotifyTrack: { ...song.SpotifyTrack, URL: 'https://evil.test' } },
      { ...song, Description: 'x'.repeat(121) },
      { ...song, Asset: { MediaAssetID: 'media:plant' } },
    ]) {
      const candidate = structuredClone(saved); candidate.Locker.LockerBoard.Items[candidate.Locker.LockerBoard.Items.length - 1] = invalid;
      assert.throws(() => store.savePerson(id, { Person: candidate }), /Spotify|cassette/);
    }
    const duplicate = structuredClone(saved); duplicate.Locker.LockerBoard.Items.push({ ...song, ID: 'second-song' });
    assert.throws(() => store.savePerson(id, { Person: duplicate }), /Spotify cassette/);
    saved.Locker.LockerBoard.Items = saved.Locker.LockerBoard.Items.filter(it => !it.SpotifyTrack); store.savePerson(id, { Person: saved });
    assert.equal(store.person(id).Locker.LockerBoard.Items.some(it => it.SpotifyTrack), false);
  } finally { store.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('song catalog migration adds presets to old fictional lockers and preserves real lockers and custom stories', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'homeroom-song-migration-')), filename = path.join(dir, 'db.sqlite');
  let { store } = setup(filename);
  try {
    const id = publish(store), original = store.person(id);
    const fictional = store.person('mei'); fictional.Locker.LockerBoard.Items = fictional.Locker.LockerBoard.Items.filter(it => !it.SpotifyTrack);
    fictional.Locker.LockerBoard.Items[0].Description = 'Existing story stays'; store.putPerson(fictional);
    store.close(); store = setup(filename).store;
    assert.deepEqual(store.person(id), original);
    assert.equal(store.person('mei').Locker.LockerBoard.Items[0].Description, 'Existing story stays');
    assert.equal(store.person('mei').Locker.LockerBoard.Items.filter(it => it.SpotifyTrack).length, 1);
    store.close(); store = setup(filename).store;
    assert.equal(store.person('mei').Locker.LockerBoard.Items.filter(it => it.SpotifyTrack).length, 1);
  } finally { store.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
