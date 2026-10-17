'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSpotifySearch, normalizeTracks } = require('../server/spotify.cjs');
const track = { id: '46rPcSaUj5jHxX60xWmsMD', name: 'From The Start', artists: [{ profile: { name: 'Laufey' } }], albumOfTrack: { coverArt: { sources: [{ url: 'https://i.scdn.co/image/example' }] } } };
const response = (value, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => value });
const complete = { status: 'COMPLETED', provider_response: { http_status: 200 }, output: { tracksV2: [track] } };
test('Spotify normalization handles both provider schemas and rejects unsafe/duplicate track data', () => {
  const normalized = normalizeTracks({ tracksV2: [track, track, { ...track, id: '../../bad' }] });
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].artist, 'Laufey');
  assert.equal(normalized[0].url, 'https://open.spotify.com/track/' + track.id);
  assert.equal(normalizeTracks({ tracks: { items: [{ ...track, albumOfTrack: { coverArt: { sources: [{ url: 'http://evil.test/image' }] } } }] } })[0].artwork, '');
  assert.throws(() => normalizeTracks({ success: false }), /couldn't finish/);
  assert.throws(() => normalizeTracks({ tracks: 'unexpected' }), /unexpected response/);
});
test('Glasser search inspects once, polls runs, shares pending work and caches identical queries', async () => {
  const calls = [];
  const search = createSpotifySearch('test-only-key', { sleep: async () => {}, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/inspect')) return response({ endpoint_version: 4 });
    if (url.endsWith('/v1/runs')) return response({ id: 'run-1', status: 'RUNNING' });
    return response(complete);
  } });
  const [first, second] = await Promise.all([search('Laufey'), search('laufey')]);
  assert.deepEqual(first, second);
  assert.equal(calls.length, 3);
  assert.equal(JSON.parse(calls[1].options.body).endpoint_version, 4);
  assert.equal(calls[1].options.headers.Authorization, 'Bearer test-only-key');
  assert.equal(calls[1].options.redirect, 'error');
  await search('LAUFEY'); assert.equal(calls.length, 3);
  assert.deepEqual(Object.keys(first), ['tracks']);
});
test('an uncertain paid search retries with the same idempotency key', async () => {
  const keys = [];
  const search = createSpotifySearch('test-only-key', { fetchImpl: async (url, options) => {
    if (url.endsWith('/inspect')) return response({ endpoint_version: 1 });
    keys.push(options.headers['Idempotency-Key']);
    if (keys.length === 1) throw Error('uncertain request');
    return response(complete);
  } });
  await search('Laufey');
  assert.equal(keys.length, 2); assert.ok(keys[0]); assert.equal(keys[0], keys[1]);
});
test('missing keys and provider failures produce safe errors without leaking upstream responses', async () => {
  let called = false;
  await assert.rejects(createSpotifySearch('', { fetchImpl: async () => { called = true; } })('Laufey'), e => e.status === 503);
  assert.equal(called, false);
  for (const status of [401, 402, 429, 500]) {
    const search = createSpotifySearch('test-only-key', { fetchImpl: async () => response({ secret: 'DO-NOT-EXPOSE' }, status) });
    await assert.rejects(search('Laufey'), e => !e.message.includes('DO-NOT-EXPOSE') && e.status === (status === 429 ? 429 : status === 500 ? 502 : 503));
  }
});
