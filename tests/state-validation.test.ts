import assert from 'node:assert/strict';
import test from 'node:test';
import { checkMutation, readJson } from '../server/http';
import { completion, note, resume, version } from '../server/state/validation';

test('state validation rejects coercion and oversized notes', () => {
  for (const value of ['true', 1, null]) assert.throws(() => completion({ completed: value }));
  assert.deepEqual(completion({ completed: false }), { completed: false });
  assert.throws(() => note({ text: 'x'.repeat(20_001) }));
  assert.equal(note({ text: 'x'.repeat(20_000) }).text.length, 20_000);
  for (const value of [-1, 1.5, '0', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => version(value));
  assert.equal(version(0), 0);
  assert.throws(() => resume({ lessonId: 'a' }));
  assert.deepEqual(resume({ lessonId: 'a', heading: null }), { lessonId: 'a', heading: null });
});

test('mutation checks enforce JSON and same origin', () => {
  const make = (headers: Record<string, string>) =>
    new Request('https://example.test/api/state', { method: 'PUT', headers });
  const previous = process.env.APP_ORIGIN;
  delete process.env.APP_ORIGIN;
  try {
    const headers = { origin: 'https://example.test', 'content-type': 'application/json; charset=utf-8' };
    assert.doesNotThrow(() => checkMutation(make(headers)));
    assert.throws(() => checkMutation(make({ ...headers, origin: 'https://elsewhere.test' })));
    assert.throws(() => checkMutation(make({ ...headers, 'sec-fetch-site': 'cross-site' })));
    assert.throws(() => checkMutation(make({ origin: headers.origin })));
    process.env.APP_ORIGIN = 'https://public.test';
    assert.throws(() => checkMutation(make(headers)));
    assert.doesNotThrow(() => checkMutation(make({ ...headers, origin: 'https://public.test' })));
  } finally {
    if (previous === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previous;
  }
});

test('JSON reading enforces actual byte limit and valid JSON', async () => {
  const request = (body: string) => new Request('https://example.test', { method: 'PUT', body });
  await assert.rejects(readJson(request('"éé"'), 5), { status: 413 });
  await assert.rejects(readJson(request('{')), { status: 400 });
  assert.deepEqual(await readJson(request('{"value":true}')), { value: true });
});
