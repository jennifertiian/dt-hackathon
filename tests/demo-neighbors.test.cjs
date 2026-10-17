'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateVariants, generateMatchReason, seedFor, fallback } = require('../server/demo-neighbors.cjs');
test('Luna demo variants use only authorized preferences and typed answers with low reasoning', async () => {
  const seed = seedFor({ PersonID: 'private-id', PersonMeta: { name: 'Private Name', email: 'private@berkeley.edu', interests: ['hiking'], hobbies: ['drawing'] } },
    { ID: 'question:today', Prompt: 'Free time?', Type: 'ShortResponse', Choices: [] }, { Answer: { Type: 'ShortText', Content: 'hiking the Berkeley trails' } });
  let calls = 0;
  const generated = await generateVariants(seed, { apiKey: 'test-secret', fetchImpl: async (url, options) => {
    calls++; const body = JSON.parse(options.body);
    assert.equal(body.model, 'gpt-6-luna'); assert.deepEqual(body.reasoning, { effort: 'low' }); assert.equal(body.store, false);
    assert.equal(body.text.format.strict, true);
    assert.doesNotMatch(options.body, /Private Name|private@|private-id|test-secret/);
    const value = { Reason: 'A shared love of hiking Berkeley trails.', Variants: fallback(seed).map((v, i) => ({ ...v, Interests: ['drawing'], Hobbies: [], AnswerText: 'hiking the trails with friends ' + i })) };
    return { ok: true, text: async () => JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] }) };
  } });
  assert.equal(calls, 1); assert.equal(generated.source, 'luna'); assert.equal(generated.variants.length, 8);
  assert.equal(generated.reason, 'A shared love of hiking Berkeley trails.');
  assert.ok(generated.variants.every(v => v.Interests.includes('hiking') && v.AnswerText.length <= 200));
});
test('scheduled explanations use aggregate evidence only, with safe fallback', async () => {
  const group = { ID: 'private-group', Members: ['private-member'], Theme: 'Study spots', Reason: '4 neighbors selected “Doe Library”.' };
  const reason = await generateMatchReason(group, { apiKey: 'fake', fetchImpl: async (_, options) => {
    const body = JSON.parse(options.body); assert.equal(body.model, 'gpt-6-luna'); assert.equal(body.reasoning.effort, 'low');
    assert.doesNotMatch(body.input, /private-group|private-member/); assert.match(body.input, /4 neighbors/);
    return { ok: true, text: async () => JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ Reason: 'Several neighbors share your love of studying at Doe.' }) }] }] }) };
  } });
  assert.equal(reason, 'Several neighbors share your love of studying at Doe.');
  assert.equal(await generateMatchReason(group, { apiKey: '' }), null);
  assert.equal(await generateMatchReason(group, { apiKey: 'fake', fetchImpl: async () => { throw Error('private provider detail'); } }), null);
});
test('invalid output, provider failure, and missing credentials give valid similar examples', async () => {
  const seed = { Interests: ['hiking'], Hobbies: [], Question: null, Answer: { Type: 'ShortText', Content: 'hiking trails' } };
  for (const fetchImpl of [async () => { throw Error('secret provider body'); }, async () => ({ ok: true, text: async () => '{}' })]) {
    const result = await generateVariants(seed, { apiKey: 'fake', fetchImpl });
    assert.equal(result.source, 'fallback'); assert.equal(result.variants.length, 8);
    assert.ok(result.variants.every(v => v.Interests.includes('hiking') && v.AnswerText));
    assert.doesNotMatch(JSON.stringify(result), /secret provider body/);
  }
  const result = await generateVariants(seed, { apiKey: '', fetchImpl: () => { throw Error('must not call'); } });
  assert.equal(result.source, 'fallback');
});
