const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDemo, day, shiftDay } = require('../src/demo-model.js');
const template = fs.readFileSync('src/index.template.html', 'utf8');
const example = template.slice(template.indexOf('const SIZES ='), template.indexOf('let appModel ='));
function setup() {
  const fixtures = JSON.parse(JSON.stringify(vm.runInNewContext(`(function(){${example}; return { people: PEOPLE, sizes: SIZES }; })()`)));
  const model = createDemo(fixtures.people, {}, fixtures.sizes, new Date('2026-10-17T22:00:00Z'));
  const profile = { name: 'Claire Su', major: 'EECS', year: '’28', interests: 'pixel art, matcha', hobbies: '', pronouns: 'she/her', classes: 'CS 61C, DATA 8', skin: 'blue', paper: 'floral', doorSticker: 'sticker_heart' };
  const sprite = { eyes: 'dot', mouth: 'smile', hairStyle: 'bun', skin: '#efc7a2', hair: '#2a2026', shirt: '#fffaf0', bg: '#fff1b8', blush: false };
  const placements = [{ id: 1, base: 'plant', kind: 'object', scale: 1, rot: 15, flip: true, cx: 90, cy: 90, title: 'my fern', desc: 'from my garden' }];
  return { model, profile, sprite, placements, publish() { model.publish(profile, sprite, placements); } };
}
test('onboarding gates matches; complete records contain a nine-person cohort', () => {
  const f = setup(), m = f.model;
  assert.equal(m.currentPerson().OnboardingStatus, 'draft'); assert.equal(m.activeGroup(), undefined);
  assert.throws(() => m.publish({ ...f.profile, name: '' }, f.sprite, f.placements));
  assert.throws(() => m.publish(f.profile, f.sprite, []));
  assert.throws(() => m.publish({ ...f.profile, interests: '' }, f.sprite, f.placements));
  f.publish(); f.publish();
  assert.equal(m.currentPerson().OnboardingStatus, 'live');
  assert.equal(m.data.MatchGroups.length, 1);
  const group = m.activeGroup(); assert.equal(new Set(group.Members).size, 9); assert.equal(group.MatchingInputs.length, 9);
  assert.equal(m.data.Questions.find(q => q.ID === group.QuestionID).QuizDay, '2026-10-16');
  assert.ok(group.Members.every(id => m.data.People.find(p => p.PersonID === id).OnboardingStatus === 'live'));
  assert.ok(group.MatchingInputs.every(i => m.data.QuestionAnswers.some(a => a.PersonID === i.PersonID && a.QuestionID === i.SourceQuestionID)));
  assert.equal(m.currentPerson().AvatarConfiguration.Blush, false);
  assert.equal(m.currentPerson().Locker.LockerMeta.OuterStickers.length, 0);
  assert.deepEqual(m.currentPerson().PersonMeta.classes, ['CS 61C', 'DATA 8']);
});
test('each quiz enforces its single answer type, including empty checkbox submissions', () => {
  const { model: m } = setup(); const q = m.questionForDay();
  assert.throws(() => m.submitAnswer('you', q.ID, { Type: 'ShortText', Content: 'other' }));
  assert.throws(() => m.submitAnswer('you', q.ID, { Type: 'SingleChoice', ChoiceID: 'unknown' }));
  m.submitAnswer('you', q.ID, { Type: 'SingleChoice', ChoiceID: q.Choices[0].ID });
  m.submitAnswer('you', q.ID, { Type: 'SingleChoice', ChoiceID: q.Choices[1].ID });
  assert.equal(m.data.QuestionAnswers.filter(a => a.PersonID === 'you' && a.QuestionID === q.ID).length, 1);
  const checkbox = { ID: 'checkbox', QuizDay: '2026-10-18', Prompt: 'Select activities', Type: 'Checkbox', Choices: [{ ID: 'a', Label: 'hike' }, { ID: 'b', Label: 'read' }] };
  m.addQuestion(checkbox); m.previewDay(checkbox.QuizDay);
  assert.throws(() => m.submitAnswer('you', checkbox.ID, { Type: 'MultipleChoices', ChoiceIDs: ['a', 'a'] }));
  const empty = m.submitAnswer('you', checkbox.ID, { Type: 'MultipleChoices', ChoiceIDs: [] });
  assert.ok(empty.AnsweredAt); assert.deepEqual(empty.Answer.ChoiceIDs, []); assert.equal(m.answerLabel(checkbox, empty.Answer), 'none selected');
  const short = { ID: 'short', QuizDay: '2026-10-19', Prompt: 'Tell us something', Type: 'ShortResponse', Choices: [] };
  m.addQuestion(short); m.previewDay(short.QuizDay);
  assert.throws(() => m.submitAnswer('you', short.ID, { Type: 'ShortText', Content: '  ' }));
  assert.equal(m.submitAnswer('you', short.ID, { Type: 'ShortText', Content: 'city pop' }).Answer.Content, 'city pop');
});
test('admin questions have unique dates, valid choice records and supported types', () => {
  const { model: m } = setup();
  assert.throws(() => m.addQuestion({ ...m.questionForDay(), ID: 'duplicate-day' }));
  assert.throws(() => m.addQuestion({ ...m.questionForDay(), ID: 'bad-date', QuizDay: '2026-02-30' }));
  assert.throws(() => m.addQuestion({ ...m.questionForDay(), ID: 'bad-type', QuizDay: '2026-10-18', Type: 'unknown' }));
  assert.throws(() => m.addQuestion({ ID: 'bad-choices', QuizDay: '2026-10-18', Prompt: 'test', Type: 'MultipleChoice', Choices: [] }));
});
test('messages reuse one conversation in both directions; opening never deletes history', () => {
  const f = setup(); f.publish(); const m = f.model;
  const first = m.send('you', 'priya', 'hi!'); const reply = m.send('priya', 'you', 'hello');
  assert.equal(first.Type, 'locker_note'); assert.equal(reply.Type, 'direct_message');
  assert.equal(first.ConversationID, reply.ConversationID);
  assert.equal(m.conversationFor('priya', 'you').ID, first.ConversationID);
  assert.throws(() => m.markOpened(first.ID, 'you'));
  m.markOpened(first.ID, 'priya'); m.markOpened(first.ID, 'priya');
  assert.equal(first.IsOpened, true); assert.equal('ReadAt' in first, false);
  assert.equal(m.unreadNotes('priya').length, 0); assert.equal(m.thread(first.ConversationID).length, 2);
  assert.ok(m.unreadNotes('you').every(x => x.Recipient === 'you' && x.Type === 'locker_note' && !x.IsOpened));
  assert.throws(() => m.send('you', 'you', 'hi'));
  assert.equal(m.send('you', 'priya', 'x'.repeat(200)).Content.length, 200);
  assert.throws(() => m.send('you', 'priya', 'x'.repeat(201)));
});
test('placed copies own descriptions and retain geometry; upload bank includes unplaced assets', () => {
  const f = setup(); f.placements.push({ ...f.placements[0], id: 2, title: 'second fern', desc: 'another story' }); f.publish();
  const m = f.model, items = m.currentPerson().Locker.LockerBoard.Items;
  assert.equal(items[0].Asset.MediaAssetID, items[1].Asset.MediaAssetID);
  assert.notEqual(items[0].ID, items[1].ID); assert.notEqual(items[0].Description, items[1].Description);
  assert.equal(items[0].Orientation, 15); assert.equal(items[0].FlipX, true); assert.equal(items[0].Width, 16);
  const unplacedID = m.registerUpload('up-example', 'beach', 'summer', 'photo');
  assert.ok(m.data.MediaBucket.Assets.some(a => a.ID === unplacedID && a.OwnerPersonID === 'you'));
  assert.ok(!items.some(i => i.Asset.MediaAssetID === unplacedID));
  const media = new Set(m.data.MediaBucket.Assets.map(a => a.ID)), system = new Set(m.data.SystemAssets.map(a => a.ID));
  for (const person of m.data.People) {
    assert.ok(media.has(person.Locker.LockerMeta.InnerBackground.MediaAssetID));
    for (const item of person.Locker.LockerBoard.Items) { assert.ok(media.has(item.Asset.MediaAssetID)); assert.ok(item.Width > 0 && item.Height > 0); if (item.FrameStyleID) assert.ok(system.has(item.FrameStyleID)); }
    for (const key of ['EyesStyleID', 'MouthStyleID', 'HairStyleID']) assert.ok(system.has(person.AvatarConfiguration[key]));
  }
  assert.ok(m.data.SystemAssets.every(a => media.has(a.MediaAssetID)));
});
test('invitations and directory membership do not enroll people in matches', () => {
  const { model: m } = setup(); const n = m.data.People.length;
  assert.ok(m.data.DirectoryPeople.some(p => p.PersonID === null));
  m.invite('friend@berkeley.edu'); assert.equal(m.data.People.length, n); assert.equal(m.data.MatchGroups.length, 0);
  assert.equal(m.data.Invitations[0].RecipientEmail, 'friend@berkeley.edu');
});
test('Berkeley calendar dates handle midnight and DST boundaries', () => {
  assert.equal(day(new Date('2026-10-18T06:59:59Z')), '2026-10-17');
  assert.equal(day(new Date('2026-10-18T07:00:00Z')), '2026-10-18');
  assert.equal(shiftDay('2026-11-01', 1), '2026-11-02');
  assert.equal(shiftDay('2026-03-08', -1), '2026-03-07');
});
