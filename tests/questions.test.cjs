'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { MODEL, typeForDay, generateQuestion, generateQuestionResult, fallbackQuestion, ensureQuestions, localDay, nextDay } = require('../server/questions.cjs');

const day = '2026-10-17';
const valueFor = quizDay => ({ Prompt: 'What sounds fun today?', Type: typeForDay(quizDay), Choices: typeForDay(quizDay) === 'ShortResponse' ? [] : ['A walk', 'A book', 'A snack'] });
const success = value => ({ ok: true, text: async () => JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] }) });

test('Luna request fixes the model and low effort, contains no personal data, and maps canonical records', async () => {
  let body;
  const question = await generateQuestion(day, { apiKey: 'fake-secret', fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(options.headers.Authorization, 'Bearer fake-secret');
    assert.equal(options.redirect, 'error');
    body = JSON.parse(options.body);
    return success(valueFor(day));
  } });
  assert.equal(MODEL, 'gpt-6-luna');
  assert.equal(body.model, 'gpt-6-luna');
  assert.deepEqual(body.reasoning, { effort: 'low' });
  assert.equal(body.store, false);
  assert.ok(body.max_output_tokens <= 700);
  assert.deepEqual(body.text.format.schema.properties.Type.enum, [typeForDay(day)]);
  assert.equal(body.text.format.strict, true);
  assert.equal(body.input.includes('fake-secret'), false);
  assert.equal(question.ID, `question:${day}`);
  assert.equal(question.QuizDay, day);
  assert.deepEqual(question.Choices.map(c => c.ID), valueFor(day).Choices.map((_, i) => `choice:${day}:${i + 1}`));
});

test('all three question types rotate reproducibly, with type-correct deterministic fallbacks', () => {
  const seen = new Set();
  for (let i = 1; i <= 31; i++) {
    const quizDay = `2026-10-${String(i).padStart(2, '0')}`;
    const question = fallbackQuestion(quizDay);
    seen.add(question.Type);
    assert.deepEqual(question, fallbackQuestion(quizDay));
    assert.equal(question.Type, typeForDay(quizDay));
    assert.equal(question.Choices.length === 0, question.Type === 'ShortResponse');
  }
  assert.equal(seen.size, 3);
});

test('invalid structured answers, type substitution, and refusal are rejected', async () => {
  for (const invalid of [
    { ...valueFor(day), Type: 'NewType' },
    { ...valueFor(day), Prompt: '' },
    { ...valueFor(day), Choices: ['Same', ' same ', 'Third'] },
    { ...valueFor(day), Secret: 'unrequested field' }
  ]) {
    await assert.rejects(generateQuestion(day, { apiKey: 'fake', fetchImpl: async () => success(invalid) }), { code: 'invalid_output' });
  }
  await assert.rejects(generateQuestion(day, { apiKey: 'fake', fetchImpl: async () => ({ ok: true,
    text: async () => JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'No' }] }] }) }) }), { code: 'refusal' });
});

test('ShortResponse forbids choices and choice types require three through five distinct labels', async () => {
  for (let i = 1; i <= 31; i++) {
    const quizDay = `2026-10-${String(i).padStart(2, '0')}`;
    const value = valueFor(quizDay);
    value.Choices = value.Type === 'ShortResponse' ? ['Extra'] : ['Too', 'Few'];
    await assert.rejects(generateQuestion(quizDay, { apiKey: 'fake', fetchImpl: async () => success(value) }), { code: 'invalid_output' });
  }
});

test('safe failure classification never returns provider bodies or fetch error messages', async () => {
  for (const [status, code] of [[401, 'authentication'], [403, 'model_access'], [404, 'model_access'], [429, 'quota_or_rate_limit'], [500, 'provider_unavailable']]) {
    let called = 0;
    const result = await generateQuestionResult(day, { apiKey: 'fake-secret', fetchImpl: async () => {
      called++; return { ok: false, status, text: async () => 'fake-secret' };
    } });
    assert.equal(result.source, 'fallback');
    assert.equal(result.model, null);
    assert.equal(result.errorCode, code);
    assert.equal(called, 1); // No retry or model substitution.
    assert.equal(JSON.stringify(result).includes('fake-secret'), false);
  }
  const result = await generateQuestionResult(day, { apiKey: 'fake-secret', fetchImpl: async () => { throw new Error('fake-secret'); } });
  assert.equal(result.errorCode, 'network');
  assert.equal(JSON.stringify(result).includes('fake-secret'), false);
});

test('absent key produces a marked fallback without a network call', async () => {
  const result = await generateQuestionResult(day, { apiKey: '', fetchImpl: () => { throw Error('must not call'); } });
  assert.equal(result.source, 'fallback');
  assert.equal(result.errorCode, 'missing_key');
});

test('timeouts and incomplete responses produce safe errors', async () => {
  await assert.rejects(generateQuestion(day, { apiKey: 'fake', timeoutMs: 1, fetchImpl: (_, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  }) }), { code: 'timeout' });
  await assert.rejects(generateQuestion(day, { apiKey: 'fake', fetchImpl: async () => ({ ok: true, text: async () => JSON.stringify({ status: 'incomplete', output: [] }) }) }), { code: 'incomplete_response' });
});

test('dates use Los Angeles days, calendar arithmetic, and reject malformed seeds', async () => {
  assert.equal(localDay(new Date('2026-10-17T05:00:00Z')), '2026-10-16');
  assert.equal(nextDay('2026-12-31'), '2027-01-01');
  for (const bad of ['2026-02-30', '2026-1-2', 'arbitrary prompt']) {
    assert.throws(() => fallbackQuestion(bad), TypeError);
    await assert.rejects(generateQuestionResult(bad), TypeError);
  }
});

test('ensure persists each missing date once, skips existing dates, and stores source separately', async () => {
  const questions = new Map([[day, fallbackQuestion(day)]]);
  const sources = [];
  const store = { questionForDay: key => questions.get(key), saveQuestion: (question, source) => { questions.set(question.QuizDay, question); sources.push(source); } };
  const tomorrow = nextDay(day);
  const results = await ensureQuestions(store, { days: [day, tomorrow, tomorrow], apiKey: '' });
  assert.deepEqual(results.map(result => result.source), ['existing', 'fallback']);
  assert.deepEqual(sources, ['fallback']);
  assert.equal(questions.size, 2);
  await ensureQuestions(store, { days: [day, tomorrow], apiKey: '' });
  assert.equal(sources.length, 1);
});
