const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync('index.html', 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 30));
function start(hash = '#hallway') {
  const errors = [];
  const dom = new JSDOM(html, {
    url: 'https://homeroom.test/' + hash, runScripts: 'dangerously', pretendToBeVisual: true,
    virtualConsole: new VirtualConsole().on('jsdomError', error => errors.push(error)),
    beforeParse(w) {
      w.matchMedia = () => ({ matches: true });
      // Canvas raster output is unchanged art; these tests exercise product flows and records.
      w.HTMLCanvasElement.prototype.getContext = function () {
        return new Proxy({ getImageData: (x, y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }), drawImage() {} }, { get: (object, key) => object[key] || (() => {}) });
      };
      w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
      w.HTMLElement.prototype.animate = () => ({});
      w.Image = class {
        constructor() { this.width = this.naturalWidth = 20; this.height = this.naturalHeight = 24; }
        set src(value) { this._src = value; queueMicrotask(() => this.onload?.()); }
        get src() { return this._src; }
      };
      const timeout = w.setTimeout.bind(w); w.setTimeout = (fn, ms, ...args) => timeout(fn, ms >= 1500 ? ms : Math.min(ms, 10), ...args);
    },
  });
  const { document } = dom.window;
  const get = selector => document.querySelector(selector);
  const clickText = (scope, text) => {
    const button = [...get(scope).querySelectorAll('button')].find(b => b.textContent.trim() === text);
    assert.ok(button, `Missing button: ${text}`); button.click();
  };
  function fill(selector, value) { const input = get(selector); assert.ok(input, selector); input.value = value; input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); input.dispatchEvent(new dom.window.Event('change', { bubbles: true })); }
  return { dom, get, fill, clickText, errors, end() { assert.deepEqual(errors.map(e => e.message), []); dom.window.close(); } };
}
test('artwork stays proportional and centered on white across viewport sizes', () => {
  const f = start(''); try {
    const w = f.dom.window;
    const bodyStyle = w.getComputedStyle(w.document.body);
    assert.equal(bodyStyle.margin, '0px');
    assert.equal(bodyStyle.backgroundColor, 'rgb(255, 255, 255)');
    assert.equal(w.getComputedStyle(f.get('#fit')).position, 'fixed');
    assert.equal(w.getComputedStyle(f.get('#fit')).inset, '0px');
    for (const [width, height] of [[1440, 900], [1920, 1080], [390, 844], [844, 390]]) {
      w.innerWidth = width; w.innerHeight = height;
      w.dispatchEvent(new w.Event('resize'));
      const stage = f.get('#stage');
      const transform = stage.style.transform.match(/^scale\(([\d.]+)\)$/);
      assert.ok(transform, 'both axes use one proportional scale');
      const scale = Number(transform[1]);
      assert.equal(scale, Math.min(width / 480, height / 270));
      assert.ok(480 * scale <= width + 0.001);
      assert.ok(270 * scale <= height + 0.001);
      assert.ok(Math.abs(parseFloat(stage.style.left) + 240 * scale - width / 2) < 0.001);
      assert.ok(Math.abs(parseFloat(stage.style.top) + 135 * scale - height / 2) < 0.001);
    }
  } finally { f.end(); }
});
test('locker bank drag preview follows the pointer with a centered stage', async () => {
  const f = start(); try {
    await tick(); f.clickText('#quizModal', 'later'); f.get('#btnEdit').click(); await tick();
    f.get('#stage').getBoundingClientRect = () => ({ left: 0, top: 45, width: 1440, height: 810 });
    const thumbnail = f.get('#editor .drag');
    assert.ok(thumbnail);
    const image = thumbnail.querySelector('img');
    thumbnail.dispatchEvent(new f.dom.window.MouseEvent('pointerdown', { bubbles: true, clientX: 600, clientY: 400 }));
    const ghost = f.get('#editor .ghost');
    assert.ok(ghost);
    assert.ok(Math.abs(parseFloat(ghost.style.left) + image.width / 2 - 200) < 0.001);
    assert.ok(Math.abs(parseFloat(ghost.style.top) + image.height / 2 - (400 - 45) / 3) < 0.001);
  } finally { f.end(); }
});
test('hallway and single-choice quiz have no likes, hybrid response, or fabricated count', async () => {
  const f = start(); try {
    await tick(); assert.equal(f.dom.window.document.querySelectorAll('.locker').length, 9);
    assert.equal(f.get('#quizModal textarea'), null); assert.equal(f.get('#quizModal input'), null);
    f.get('#quizModal .qopt').click(); f.clickText('#quizModal', 'submit'); await tick();
    assert.match(f.get('#quizModal').textContent, /midnight Berkeley time/);
    assert.doesNotMatch(f.get('#quizModal').textContent, /people said|7am/);
    f.clickText('#quizModal', 'back to hallway →');
    f.get('.locker').click(); assert.ok(f.get('#noteBtn')); assert.equal(f.get('#likeBtn'), null);
  } finally { f.end(); }
});
test('new sent note immediately becomes a sender-accessible conversation and reuses the thread', async () => {
  const f = start(); try {
    await tick(); f.clickText('#quizModal', 'later');
    f.get('.locker[aria-label="Peek inside Priya Raman\'s locker"]').click(); f.get('#noteBtn').click();
    f.fill('#noteText', 'love your fern!'); f.clickText('#noteBtns', 'send'); await tick();
    assert.equal(f.get('#noteLayer'), null); assert.equal(f.get('#noteBtn').textContent, 'open DM');
    f.get('#noteBtn').click(); await tick();
    assert.equal(f.get('#noteLayer'), null); assert.match(f.get('#mailBody').textContent, /love your fern!/);
    f.fill('#dmInput', 'want to study?'); f.get('.dmform').dispatchEvent(new f.dom.window.Event('submit', { bubbles: true, cancelable: true })); await tick();
    assert.equal(f.dom.window.document.querySelectorAll('.bubble').length, 2);
    f.clickText('#mailBody', '← all DMs');
    assert.equal([...f.dom.window.document.querySelectorAll('#mailBody .mail b')].filter(n => n.textContent.includes('Priya')).length, 1);
  } finally { f.end(); }
});
test('opening received notes in either view removes the same unread note without deleting its DM', async () => {
  const f = start(); try {
    await tick(); f.clickText('#quizModal', 'later'); assert.equal(f.get('#mailBadge').textContent, '4');
    f.get('.locker[aria-label="Your locker"]').click(); f.clickText('#stackBtns', 'read (4 new)'); await tick();
    assert.equal(f.get('#mailBadge').textContent, '3');
    const noteText = f.get('#oneNote .body').textContent; f.clickText('#stackBtns', 'reply in DMs'); await tick();
    assert.match(f.get('#mailBody').textContent, new RegExp(noteText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(f.get('#mailBody').textContent, /opened/);
    f.clickText('#mailBody', '← all DMs'); f.get('#mailBody .mail.unread .go').click(); await tick();
    assert.equal(f.get('#mailBadge').textContent, '2'); assert.equal(f.dom.window.document.querySelectorAll('#mailBody .bubble').length, 1);
  } finally { f.end(); }
});
test('checkbox and short-response renderers work without a public admin panel', async () => {
  const f = start(); try {
    await tick(); f.clickText('#quizModal', 'later'); assert.equal(f.get('#btnAdmin'), null);
    const check = { ID: 'checkbox', QuizDay: '2030-01-01', Prompt: 'weekend plans?', Type: 'Checkbox', Choices: [{ ID: 'a', Label: 'hiking' }, { ID: 'b', Label: 'reading' }] };
    f.dom.window.eval(`appModel.addQuestion(${JSON.stringify(check)}); appModel.previewDay('2030-01-01'); openQuiz();`);
    assert.equal(f.dom.window.document.querySelectorAll('#quizModal [role=checkbox]').length, 2);
    f.get('#quizModal .qopt').click(); f.dom.window.document.querySelectorAll('#quizModal .qopt')[1].click();
    f.clickText('#quizModal', 'submit'); await tick(); assert.match(f.get('#quizModal .stat').textContent, /hiking, reading/);
    f.clickText('#quizModal', 'back to hallway →');
    const short = { ID: 'short', QuizDay: '2030-01-02', Prompt: 'favorite song?', Type: 'ShortResponse', Choices: [] };
    f.dom.window.eval(`appModel.addQuestion(${JSON.stringify(short)}); appModel.previewDay('2030-01-02'); openQuiz();`);
    assert.ok(f.get('#quizModal textarea')); assert.equal(f.get('#quizModal .qopt'), null);
    f.fill('#quizModal textarea', 'city pop'); f.clickText('#quizModal', 'submit'); await tick(); assert.match(f.get('#quizModal .stat').textContent, /city pop/);
  } finally { f.end(); }
});
test('onboarding blocks an incomplete profile and admits a complete locker', async () => {
  const f = start(''); try {
    assert.equal(f.dom.window.document.querySelectorAll('.locker').length, 0);
    assert.match(f.get('#login').textContent, /sign in with Google/);
    assert.match(f.get('#login').textContent, /complete mock mode/);
    assert.doesNotMatch(f.get('#login').textContent, /directory|magic link/);
    f.fill('#login input', 'demo@berkeley.edu'); f.clickText('#login', 'enter mock mode →'); await tick();
    f.fill('#editor .namein', 'Demo Bear'); f.clickText('#edBar', 'next →');
    f.clickText('#edBar', 'next →'); f.clickText('#edBar', 'make it live');
    assert.ok(f.get('#editor')); assert.match(f.get('#toast').textContent, /major/);
    f.clickText('#edBar', '← back'); f.clickText('#edBar', '← back');
    f.clickText('#edRight', 'fill example'); f.clickText('#edBar', 'next →'); f.clickText('#edBar', 'next →'); f.clickText('#edBar', 'make it live');
    await tick(); assert.equal(f.get('#editor'), null); assert.equal(f.dom.window.document.querySelectorAll('.locker').length, 9);
  } finally { f.end(); }
});

test('live redraws preserve a DM draft and repeated submits send only once', async () => {
  const f = start(); try {
    await tick(); f.clickText('#quizModal', 'later'); f.get('#btnMail').click(); f.get('#mailBody .go').click(); await tick();
    f.fill('#dmInput', 'my unsent message'); f.get('#dmInput').focus();
    f.dom.window.eval('renderMail()'); assert.equal(f.get('#dmInput').value, 'my unsent message'); assert.equal(f.dom.window.document.activeElement, f.get('#dmInput'));
    const form = f.get('.dmform');
    form.dispatchEvent(new f.dom.window.Event('submit', { bubbles: true, cancelable: true }));
    form.dispatchEvent(new f.dom.window.Event('submit', { bubbles: true, cancelable: true }));
    await tick(); assert.equal(f.dom.window.document.querySelectorAll('#mailBody .bubble').length, 2); assert.equal(f.get('#dmInput').value, '');
  } finally { f.end(); }
});

test('today’s typed answer can be revised without duplicating history', async () => {
  const f = start(); try {
    await tick(); f.get('#quizModal .qopt').click(); f.clickText('#quizModal', 'submit'); await tick();
    f.clickText('#quizModal', 'revise today’s answer');
    assert.equal(f.get('#quizModal input'), null);
    const options = f.get('#quizModal').querySelectorAll('.qopt'); options[1].click(); f.clickText('#quizModal', 'submit'); await tick();
    const records = f.dom.window.eval('appModel.data.QuestionAnswers.filter(a => a.PersonID === myID() && a.QuestionID === appModel.questionForDay().ID)');
    assert.equal(records.length, 1); assert.equal(records[0].Answer.Type, 'SingleChoice');
    assert.equal(records[0].Answer.ChoiceID, options[1].dataset.choice);
    assert.ok(f.get('#mittens')); assert.equal(f.get('#btnDM'), null); assert.match(f.get('#cdTime').textContent, /^\d\d:\d\d:\d\d$/);
  } finally { f.end(); }
});

test('matched by remains visible across locker hovers and updates from group records', async () => {
  const f = start(); try {
    await tick(); f.clickText('#quizModal', 'later');
    assert.equal(f.get('#matchedBy').hidden, false); assert.match(f.get('#matchedBy b').textContent, /matched by/);
    f.dom.window.eval('appModel.activeGroup().Reason = "A shared love of hiking Berkeley trails."; renderGrid();');
    assert.equal(f.get('#matchReason').textContent, 'A shared love of hiking Berkeley trails.');
    f.get('.locker').dispatchEvent(new f.dom.window.Event('mouseenter'));
    assert.equal(f.get('#matchReason').textContent, 'A shared love of hiking Berkeley trails.');
  } finally { f.end(); }
});
