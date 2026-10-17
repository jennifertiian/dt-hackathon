/* Same-origin SQLite API adapter. Secrets and private roster records never enter this module. */
(function (root) {
  class RemoteModel {
    constructor(memory) {
      this.data = memory.data; this.answerLabel = memory.answerLabel; this.shiftDay = memory.shiftDay;
      this.personID = null; this.mockToken = null; this.uploadRecords = new Map(); this.onChange = null; this.stream = null; this.queue = Promise.resolve();
    }
    async request(path, method = 'GET', payload, signal) {
      const response = await fetch(path, { method, credentials: 'same-origin', headers: { ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }), ...(this.mockToken ? { 'X-Homeroom-Mock': this.mockToken } : {}) }, body: payload === undefined ? undefined : JSON.stringify(payload), ...(signal ? { signal } : {}) });
      const result = await response.json(); if (!response.ok) { const error = new Error(result.error || 'The request failed.'); error.status = response.status; throw error; } return result;
    }
    async replace(state) { this.data = state; this.receivedAt = Date.now(); this.personID = state.CurrentPersonID; if (this.onChange) await this.onChange(state); return state; }
    perform(work) { const operation = this.queue.catch(() => {}).then(work); this.queue = operation; return operation; }
    async refresh() { return this.perform(async () => this.replace(await this.request('/api/state'))); }
    async login(email) { await this.perform(async () => this.replace(await this.request('/api/auth/demo', 'POST', { Email: email }))); this.subscribe(); }
    async loginMock(email) { await this.perform(async () => { const opened = await this.request('/api/auth/mock', 'POST', { Email: email }); this.mockToken = opened.Token; await this.replace(opened.State); }); this.subscribe(); }
    async logout() { await this.perform(() => this.request('/api/auth/logout', 'POST', {})); this.stream?.close(); this.mockToken = null; }
    releaseMock() { if (!this.mockToken) return; this.stream?.close(); fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'X-Homeroom-Mock': this.mockToken }, keepalive: true }).catch(() => {}); this.mockToken = null; }
    async advanceDay() { return this.perform(async () => this.replace(await this.request('/api/demo/advance', 'POST', {}))); }
    async restore() { await this.refresh(); this.subscribe(); }
    async resetDemo() { await this.perform(() => this.request('/api/demo/reset', 'POST', {})); this.stream?.close(); }
    subscribe() {
      if (this.stream) this.stream.close();
      if (this.mockToken) {
        let stopped = false, controller, retry;
        const connect = async () => {
          controller = new AbortController();
          try {
            const response = await fetch('/api/events', { headers: { 'X-Homeroom-Mock': this.mockToken }, signal: controller.signal });
            if (!response.ok) return;
            const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '';
            while (!stopped) {
              const part = await reader.read(); if (part.done) break;
              buffer += decoder.decode(part.value, { stream: true });
              let end; while ((end = buffer.indexOf('\n\n')) >= 0) { const event = buffer.slice(0, end); buffer = buffer.slice(end + 2); if (/event: (ready|state)/.test(event)) this.refresh().catch(() => {}); }
            }
          } catch { /* Reconnect while this in-memory mock is still active. */ }
          if (!stopped) retry = setTimeout(connect, 3000);
        };
        this.stream = { close() { stopped = true; controller?.abort(); clearTimeout(retry); } }; connect(); return;
      }
      this.stream = new EventSource('/api/events');
      this.stream.addEventListener('state', () => this.refresh().catch(() => {}));
      this.stream.addEventListener('ready', () => this.refresh().catch(() => {}));
    }
    currentPerson() { return this.data.People.find(p => p.PersonID === this.personID); }
    day() { return this.data.ActiveDay; }
    questionForDay() { return this.data.Questions.find(q => q.QuizDay === this.day()); }
    activeGroup() { return this.data.MatchGroups.find(g => g.ActiveDay === this.day() && g.Members.includes(this.personID)); }
    conversationFor(a, b) { return this.data.Conversations.find(c => (c.Person1 === a && c.Person2 === b) || (c.Person1 === b && c.Person2 === a)); }
    thread(id) { return this.data.Messages.filter(m => m.ConversationID === id).sort((a, b) => a.CreatedAt.localeCompare(b.CreatedAt) || a.ID.localeCompare(b.ID)); }
    unreadNotes(personID) { return this.data.Messages.filter(m => m.Type === 'locker_note' && m.Recipient === personID && !m.IsOpened); }
    async submitAnswer(personID, questionID, answer) { return this.perform(async () => this.replace(await this.request('/api/answers', 'POST', { QuestionID: questionID, Answer: answer }))); }
    async send(sender, recipient, content) { return this.perform(async () => { const message = await this.request('/api/messages', 'POST', { Recipient: recipient, Content: content }); try { await this.replace(await this.request('/api/state')); } catch { if (!this.data.Messages.some(m => m.ID === message.ID)) this.data.Messages.push(message); if (!this.data.Conversations.some(c => c.ID === message.ConversationID)) { const participants = [message.Sender, message.Recipient].sort(); this.data.Conversations.push({ ID: message.ConversationID, Person1: participants[0], Person2: participants[1], FirstMessageTimestamp: message.CreatedAt }); } } return message; }); }
    async markOpened(messageID) {
      return this.perform(async () => { const item = this.data.Messages.find(m => m.ID === messageID); if (item?.IsOpened) return;
      await this.replace(await this.request('/api/messages/open', 'POST', { MessageID: messageID })); });
    }
    async searchSpotify(query, signal) { return this.request('/api/spotify/search', 'POST', { query }, signal); }
    async invite(email) { return this.request('/api/invitations', 'POST', { Email: email }); }
    async registerUpload(key, title, description, kind, source) {
      const [c, x] = canvas(Math.max(1, Math.round((source.naturalWidth || source.width) * Math.min(1, 1024 / Math.max(source.naturalWidth || source.width, source.naturalHeight || source.height)))), Math.max(1, Math.round((source.naturalHeight || source.height) * Math.min(1, 1024 / Math.max(source.naturalWidth || source.width, source.naturalHeight || source.height)))));
      x.imageSmoothingEnabled = true; x.drawImage(source, 0, 0, c.width, c.height);
      return this.perform(async () => { const asset = await this.request('/api/uploads', 'POST', { DataURL: c.toDataURL('image/png'), Title: title, Description: description, Kind: kind === 'photo' ? 'Photo' : 'Sticker' });
      this.uploadRecords.set(key, asset); try { await this.replace(await this.request('/api/state')); } catch {} return asset; });
    }
    async publish(profile, sprite, placements) {
      const person = JSON.parse(JSON.stringify(this.currentPerson()));
      person.PersonMeta = {};
      for (const key of ['name', 'pronouns', 'major', 'year', 'mbti', 'interests', 'classes', 'food', 'study', 'hobbies', 'artist', 'fun']) person.PersonMeta[key] = ['interests', 'classes', 'hobbies'].includes(key) ? (profile[key] || '').split(',').map(x => x.trim()).filter(Boolean) : profile[key] || '';
      person.OnboardingStatus = 'live';
      person.AvatarConfiguration = { EyesStyleID: 'system:eyes_' + sprite.eyes, MouthStyleID: 'system:mouth_' + sprite.mouth, HairStyleID: 'system:hair_' + sprite.hairStyle, SkinColor: sprite.skin, HairColor: sprite.hair, ShirtColor: sprite.shirt, BackgroundColor: sprite.bg, Blush: sprite.blush };
      person.Locker.LockerMeta = { InnerBackground: { MediaAssetID: 'media:interior_x_' + profile.skin + '_' + profile.paper }, OuterBackground: LOCKER_COLORS[profile.skin], OuterStickers: [] };
      person.Locker.LockerBoard.Items = placements.map(it => {
        const sourceSize = it.base ? sz(it.base) : [it.sourceWidth, it.sourceHeight];
        const photoSize = [[20, 24], [28, 33], [36, 42]][it.size || 0];
        const width = it.upload && it.kind === 'photo' ? photoSize[0] : (it.sourceWidth || sourceSize[0]) * it.scale;
        const height = it.upload && it.kind === 'photo' ? photoSize[1] : (it.sourceHeight || sourceSize[1]) * it.scale;
        const mediaID = it.upload ? this.uploadRecords.get(it.assetKey)?.ID || it.mediaID : 'media:' + it.base;
        if (!mediaID) throw Error('Wait for your upload to finish, then save again.');
        it.persistedID ||= 'placement:' + crypto.randomUUID();
        return { ID: it.persistedID, Asset: { MediaAssetID: mediaID }, ...(it.song ? { SpotifyTrack: { ID: it.song.id, Title: it.song.title, Artist: it.song.artist } } : {}), Title: it.title || '', Description: it.desc || '', X: it.cx - width / 2, Y: it.cy - height / 2, Width: width, Height: height, Orientation: it.rot, FlipX: !!it.flip, FrameStyleID: it.kind === 'photo' ? 'system:frame_' + ['small', 'medium', 'large'][it.size || 0] : null };
      });
      return this.perform(async () => this.replace(await this.request('/api/me', 'PUT', { Person: person })));
    }
  }
  root.HomeroomRemote = { RemoteModel };
})(globalThis);
