/* Frontend-only example records. No network, authentication, database, or delivery implementation. */
(function (root) {
  const DATE_FORMAT = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' });
  const day = (date = new Date()) => DATE_FORMAT.format(date);
  function shiftDay(value, delta) {
    const date = new Date(value + 'T12:00:00Z'); date.setUTCDate(date.getUTCDate() + delta);
    return date.toISOString().slice(0, 10);
  }
  function midnight(value) {
    let stamp = Date.parse(value + 'T00:00:00Z');
    const format = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    for (let i = 0; i < 3; i++) stamp += Date.parse(value + 'T00:00:00Z') - Date.parse(format.format(new Date(stamp)).replace(' ', 'T') + 'Z');
    return stamp;
  }
  const COLORS = { blue: '#7593d4', pink: '#e595ad', mint: '#82c4a8', butter: '#ecc66a', lavender: '#a996d8' };
  const clone = value => JSON.parse(JSON.stringify(value));
  function createDemo(people, assets, sizes, now = new Date(), avatarConfigurations = {}) {
    let serial = 0;
    const id = prefix => prefix + '-' + String(++serial).padStart(6, '0');
    const today = day(now);
    /** @type {import('./types').System} */
    const data = { People: [], PropertyDefinitions: [], Questions: [], QuestionAnswers: [], MatchGroups: [], Conversations: [], Messages: [], MediaBucket: { BucketName: 'demo-memory', Assets: [] }, SystemAssets: [], DirectoryPeople: [], Invitations: [] };
    const media = (key, owner = null, title = key, description = '', kind) => {
      const mid = owner ? 'media:' + owner + ':' + key : 'media:' + key;
      if (!data.MediaBucket.Assets.some(a => a.ID === mid)) data.MediaBucket.Assets.push({ ID: mid, OwnerPersonID: owner, Kind: kind || (key.startsWith('polaroid') ? 'Photo' : key.startsWith('sticker') ? 'Sticker' : key.startsWith('interior') ? 'Background' : 'Object2D'), StorageKey: key, MimeType: 'image/png', Title: title, Description: description });
      return mid;
    };
    const systemAsset = (key, kind) => {
      const sid = 'system:' + key;
      if (!data.SystemAssets.some(a => a.ID === sid)) data.SystemAssets.push({ ID: sid, Kind: kind, MediaAssetID: media(key, null, key, '', /Style$/.test(kind) ? 'SpritePart' : undefined) });
      return sid;
    };
    const avatar = sp => ({ EyesStyleID: systemAsset('eyes_' + sp.eyes, 'EyesStyle'), MouthStyleID: systemAsset('mouth_' + sp.mouth, 'MouthStyle'), HairStyleID: systemAsset('hair_' + sp.hairStyle, 'HairStyle'), SkinColor: sp.skin, HairColor: sp.hair, ShirtColor: sp.shirt, BackgroundColor: sp.bg, Blush: sp.blush });
    const defaultSprite = { eyes: 'dot', mouth: 'smile', hairStyle: 'long', skin: '#efc7a2', hair: '#2a2026', shirt: '#5a75bd', bg: '#e9dcc0', blush: false };
    const fieldKeys = ['name', 'pronouns', 'major', 'year', 'mbti', 'interests', 'classes', 'food', 'study', 'hobbies', 'artist', 'fun'];
    const listKeys = new Set(['interests', 'classes', 'hobbies']);
    fieldKeys.forEach(Key => data.PropertyDefinitions.push({ Key, ValueSchema: listKeys.has(Key) ? { Type: 'List', ItemSchema: { Type: 'Text' } } : { Type: 'Text' } }));
    function boardItem(key, x, y, title, description, owner = null) {
      if (key.startsWith('sticker')) systemAsset(key, 'Sticker');
      else if (!key.startsWith('polaroid')) systemAsset(key, 'Object2D');
      const size = sizes[key] || sizes[key.split('_')[0]] || [20, 24];
      return { ID: id('placement'), Asset: { MediaAssetID: media(key, owner, title, description) }, Title: title, Description: description, X: x, Y: y, Width: size[0], Height: size[1], Orientation: 0, FlipX: false, FrameStyleID: key.startsWith('polaroid') ? systemAsset('frame_small', 'PhotoFrame') : null };
    }
    systemAsset('music_cassette', 'Object2D');
    data.MediaBucket.Assets.find(a => a.ID === 'media:music_cassette').MimeType = 'image/svg+xml';
    people.forEach(p => {
      const meta = p.you ? {} : { name: p.name, major: p.line.split(' · ')[0], year: p.line.split(' · ')[1] || '’28', pronouns: 'they/them', mbti: p.pills[1]?.[0] || '?', interests: (p.facts.find(f => f[0] === 'likes')?.[1] || '').split(', '), classes: [], food: p.facts.find(f => f[0] === 'eats')?.[1] || '', study: p.facts.find(f => f[0] === 'studies')?.[1] || '', hobbies: [], artist: '', fun: p.facts.find(f => f[0] === 'also')?.[1] || '' };
      data.People.push({ PersonID: p.id, PersonMeta: meta, AvatarConfiguration: avatar(avatarConfigurations[p.id] || defaultSprite), OnboardingStatus: p.you ? 'draft' : 'live', IsDemo: !p.you, EligibleFrom: p.you ? null : '2000-01-01', Locker: { LockerBoard: { Items: p.items.map(i => { const it = boardItem(...i); if (i[0] === 'music_cassette' && p.song) it.SpotifyTrack = { ID: p.song.id, Title: p.song.title, Artist: p.song.artist }; return it; }) }, LockerMeta: { InnerBackground: { MediaAssetID: media('interior_' + p.id) }, OuterBackground: COLORS[p.skin], OuterStickers: p.stickers.map(([key, x, y]) => ({ SystemAssetID: systemAsset(key, 'Sticker'), X: x, Y: y, Width: sizes[key]?.[0] || 15, Height: sizes[key]?.[1] || 15 })) } } });
      data.DirectoryPeople.push({ ID: 'directory:' + p.id, PrimaryEmail: p.id + '@berkeley.edu', DisplayName: p.name, PersonID: p.id, Suspended: false });
    });
    data.DirectoryPeople.push({ ID: 'directory:unregistered', PrimaryEmail: 'unregistered@berkeley.edu', DisplayName: 'Unregistered example member', PersonID: null, Suspended: false });
    const quiz = (date, Prompt, Type, labels = []) => ({ ID: 'question:' + date, QuizDay: date, Prompt, Type, Choices: labels.map((Label, i) => ({ ID: 'choice:' + i, Label })) });
    data.Questions.push(quiz(today, 'free afternoon in berkeley. where are you?', 'MultipleChoice', ['watching the sunset at the marina', 'thrifting on telegraph', 'a café with a good book', 'hiking the fire trails', 'napping. obviously.']));
    const past = [
      ['favorite study spot?', 'MultipleChoice', ['Doe Library', 'Main Stacks', 'Moffitt']],
      ['ideal weekend: select all', 'Checkbox', ['farmers market', 'naps', 'hiking']],
      ['what’s on repeat this week?', 'ShortResponse', []],
      ['pick a dining hall', 'MultipleChoice', ['Crossroads', 'Foothill', 'Clark Kerr']],
      ['what do you do for fun?', 'ShortResponse', []],
      ['favorite snacks: select all', 'Checkbox', ['onigiri', 'boba', 'cookies']],
      ['north side or south side?', 'MultipleChoice', ['north side', 'south side']],
      ['your major in one emoji', 'ShortResponse', []],
    ];
    past.forEach(([prompt, type, labels], i) => {
      const q = quiz(shiftDay(today, -i - 1), prompt, type, labels); data.Questions.push(q);
      people.forEach(p => data.QuestionAnswers.push({ PersonID: p.id, QuestionID: q.ID, Answer: type === 'MultipleChoice' ? { Type: 'SingleChoice', ChoiceID: q.Choices[0].ID } : type === 'Checkbox' ? { Type: 'MultipleChoices', ChoiceIDs: q.Choices.slice(0, 2).map(c => c.ID) } : { Type: 'ShortText', Content: i === 2 ? 'city pop' : 'drawing and music' }, AnsweredAt: q.QuizDay + 'T20:00:00.000Z' }));
    });
    Object.keys(assets).forEach(key => {
      if (key.startsWith('eyes_')) systemAsset(key, 'EyesStyle');
      else if (key.startsWith('mouth_')) systemAsset(key, 'MouthStyle');
      else if (key.startsWith('hair_')) systemAsset(key, 'HairStyle');
      else if (key.startsWith('frame_')) systemAsset(key, 'PhotoFrame');
      else if (key.startsWith('sticker_')) systemAsset(key, 'Sticker');
      else if (key.startsWith('interior_')) systemAsset(key, 'LockerBackground');
      else if (key.startsWith('polaroid_')) media(key, null, key, '', 'Photo');
    });
    let demoDay = today;
    const currentPerson = () => data.People.find(p => p.PersonID === 'you');
    const questionForDay = () => data.Questions.find(q => q.QuizDay === demoDay);
    function validateQuestion(q, excludeID = null) {
      if (!q.Prompt.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(q.QuizDay) || Number.isNaN(Date.parse(q.QuizDay)) || new Date(q.QuizDay + 'T12:00:00Z').toISOString().slice(0, 10) !== q.QuizDay) throw Error('Add a prompt and valid quiz date.');
      if (!['MultipleChoice', 'Checkbox', 'ShortResponse'].includes(q.Type)) throw Error('Choose a supported question type.');
      if (!q.ID || data.Questions.some(x => x.ID === q.ID && x.ID !== excludeID)) throw Error('Questions need unique IDs.');
      if (data.Questions.some(x => x.QuizDay === q.QuizDay && x.ID !== excludeID)) throw Error('There is already a question for that day.');
      if (q.Type === 'ShortResponse' ? q.Choices.length !== 0 : q.Choices.length < 2) throw Error('Choice questions need at least two choices.');
      if (new Set(q.Choices.map(c => c.ID)).size !== q.Choices.length || q.Choices.some(c => !c.ID || !c.Label.trim())) throw Error('Choices need unique IDs and nonempty labels.');
    }
    function submitAnswer(personID, questionID, Answer) {
      if (!data.People.some(p => p.PersonID === personID)) throw Error('Unknown person.');
      const q = data.Questions.find(x => x.ID === questionID);
      if (!q || q.QuizDay !== demoDay) throw Error('Only today’s quiz can be answered.');
      const ids = new Set(q.Choices.map(c => c.ID));
      const valid = q.Type === 'MultipleChoice' ? Answer.Type === 'SingleChoice' && ids.has(Answer.ChoiceID) : q.Type === 'Checkbox' ? Answer.Type === 'MultipleChoices' && new Set(Answer.ChoiceIDs).size === Answer.ChoiceIDs.length && Answer.ChoiceIDs.every(c => ids.has(c)) : Answer.Type === 'ShortText' && !!Answer.Content.trim();
      if (!valid) throw Error('Answer does not match the question type.');
      const a = { PersonID: personID, QuestionID: questionID, Answer: clone(Answer), AnsweredAt: new Date().toISOString() };
      const old = data.QuestionAnswers.findIndex(x => x.PersonID === personID && x.QuestionID === questionID);
      if (old < 0) data.QuestionAnswers.push(a); else data.QuestionAnswers[old] = a;
      return a;
    }
    const answerLabel = (q, answer) => !answer ? 'not answered' : answer.Type === 'ShortText' ? answer.Content : q.Choices.filter(c => (answer.Type === 'SingleChoice' ? [answer.ChoiceID] : answer.ChoiceIDs).includes(c.ID)).map(c => c.Label).join(', ') || 'none selected';
    const conversationFor = (a, b) => data.Conversations.find(c => (c.Person1 === a && c.Person2 === b) || (c.Person1 === b && c.Person2 === a));
    function send(sender, recipient, content) {
      const text = content.trim();
      if (!text || sender === recipient || !data.People.some(p => p.PersonID === sender) || !data.People.some(p => p.PersonID === recipient)) throw Error('A message needs two different people and some text.');
      let conversation = conversationFor(sender, recipient);
      const type = conversation ? 'direct_message' : 'locker_note';
      if (text.length > 200) throw Error('Your message is too long.');
      const createdAt = new Date().toISOString();
      if (!conversation) { conversation = { ID: id('conversation'), Person1: sender, Person2: recipient, FirstMessageTimestamp: createdAt }; data.Conversations.push(conversation); }
      const message = { ID: id('message'), ConversationID: conversation.ID, Sender: sender, Recipient: recipient, Content: text, CreatedAt: createdAt, IsOpened: false, Type: type };
      data.Messages.push(message);
      if (sender === 'you' && data.People.find(p => p.PersonID === recipient)?.IsDemo) {
        const timer = root.setTimeout(() => {
          const replies = ['haha yes', 'omg okay when are you free?', 'this made my day', 'down! thursday works for me', 'let’s do it'];
          send(recipient, sender, replies[data.Messages.length % replies.length]); model.onChange?.();
        }, 1800); timer?.unref?.();
      }
      return message;
    }
    const unreadNotes = personID => data.Messages.filter(m => m.Type === 'locker_note' && m.Recipient === personID && !m.IsOpened);
    function markOpened(messageID, personID) {
      const m = data.Messages.find(x => x.ID === messageID);
      if (!m || m.Recipient !== personID) throw Error('Only the recipient can open this message.');
      m.IsOpened = true;
    }
    const thread = conversationID => data.Messages.filter(m => m.ConversationID === conversationID).sort((a, b) => a.CreatedAt.localeCompare(b.CreatedAt) || a.ID.localeCompare(b.ID));
    function seedMessages() {
      if (data.Conversations.length) return;
      ['haruto', 'sofia', 'kai', 'mei'].filter(pid => data.People.some(p => p.PersonID === pid)).forEach((pid, i) => send(pid, 'you', ['hey! want to grab Sliver after class thursday?', 'your sprite is so cute! do you play stardew?', 'fellow North Reading Room regular! come say hi.', 'your locker made me smile. portrait swap?'][i]));
    }
    function publish(profile, sprite, placements) {
      if (!profile.name.trim() || !profile.major.trim() || !profile.year || !(profile.interests.trim() || profile.hobbies.trim()) || !placements.length || !placements.some(it => it.title.trim() && it.desc.trim())) throw Error('Add your name, major, year, an interest or hobby, and at least one item with a title and description.');
      const p = currentPerson();
      fieldKeys.forEach(k => { const v = profile[k] || ''; p.PersonMeta[k] = listKeys.has(k) ? v.split(',').map(x => x.trim()).filter(Boolean) : v; });
      p.AvatarConfiguration = avatar(sprite);
      p.OnboardingStatus = 'live'; p.EligibleFrom = demoDay;
      p.Locker.LockerMeta = { InnerBackground: { MediaAssetID: media('interior_x_' + profile.skin + '_' + profile.paper) }, OuterBackground: COLORS[profile.skin], OuterStickers: [] };
      p.Locker.LockerBoard.Items = placements.map(it => {
        const sourceSize = sizes[it.base] || sizes[it.base?.split('_')[0]] || [20, 24];
        const photoSize = [[20, 24], [28, 33], [36, 42]][it.size || 0];
        const width = it.upload && it.kind === 'photo' ? photoSize[0] : (it.sourceWidth || sourceSize[0]) * it.scale;
        const height = it.upload && it.kind === 'photo' ? photoSize[1] : (it.sourceHeight || sourceSize[1]) * it.scale;
        return { ID: 'placement:you:' + it.id,
          Asset: { MediaAssetID: media(it.upload ? it.assetKey : it.base, it.upload ? 'you' : null, it.title, it.desc, it.kind === 'photo' ? 'Photo' : it.kind === 'sticker' ? 'Sticker' : 'Object2D') },
          ...(it.song ? { SpotifyTrack: { ID: it.song.id, Title: it.song.title, Artist: it.song.artist } } : {}),
          Title: it.title, Description: it.desc, X: it.cx - width / 2, Y: it.cy - height / 2, Width: width, Height: height,
          Orientation: it.rot, FlipX: it.flip,
          FrameStyleID: it.kind === 'photo' ? systemAsset('frame_' + ['small', 'medium', 'large'][it.size || 0], 'PhotoFrame') : null };
      });
      // Deliberately contrived cohort fixture, not a backend matching implementation.
      const members = data.People.filter(p => p.OnboardingStatus === 'live').map(p => p.PersonID);
      const previous = data.Questions.find(q => q.QuizDay === shiftDay(demoDay, -1));
      if (members.length === 9 && previous && !data.MatchGroups.some(g => g.ActiveDay === demoDay)) data.MatchGroups.push({ ID: 'group:' + demoDay, Members: members, ActiveDay: demoDay, Theme: previous.Prompt, QuestionID: previous.ID, MatchingInputs: members.map(PersonID => ({ PersonID, SourceQuestionID: data.QuestionAnswers.filter(a => a.PersonID === PersonID && a.Answer && data.Questions.find(q => q.ID === a.QuestionID).QuizDay < demoDay).sort((a, b) => b.QuestionID.localeCompare(a.QuestionID))[0]?.QuestionID || null })), Reason: demoDay === today ? '9 neighbors selected “Doe Library”.' : 'A new set of neighbors, using stored quiz answers.' });
      seedMessages();
    }
    const registerUpload = (key, title, description, kind) => media(key, 'you', title, description, kind === 'photo' ? 'Photo' : 'Sticker');
    const model = { data, day: () => demoDay, shiftDay, currentPerson, questionForDay, answerLabel, validateQuestion, submitAnswer, conversationFor, send, unreadNotes, markOpened, thread, publish, registerUpload,
      addQuestion(q) { validateQuestion(q); data.Questions.push(clone(q)); },
      previewDay(value) { if (!data.Questions.some(q => q.QuizDay === value)) throw Error('Add a question for that date first.'); demoDay = value; },
      activeGroup() { return data.MatchGroups.find(g => g.ActiveDay === demoDay && g.Members.includes('you')); },
      invite(email) { if (!/^[^@\s]+@berkeley\.edu$/.test(email)) throw Error('Use a @berkeley.edu email.'); const entry = { ID: id('invite'), SenderPersonID: 'you', RecipientEmail: email, CreatedAt: new Date().toISOString() }; data.Invitations.push(entry); return entry; },
    };
    return model;
  }
  root.HomeroomDemo = { createDemo, day, shiftDay, midnight };
  if (typeof module !== 'undefined') module.exports = root.HomeroomDemo;
})(globalThis);
