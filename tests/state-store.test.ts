import assert from 'node:assert/strict';
import test from 'node:test';
import { S3Client } from '@aws-sdk/client-s3';
import { StateConflict, StateStore } from '@/server/state/store';
import { documentKey, S3DocumentStore, type DocumentStore } from '@/server/storage/store';
import type { Resource, NoteValue } from '@/lib/learner-types';
import { startS3Server } from '@/tests/helpers/s3-server';

function winner(results: PromiseSettledResult<Resource<NoteValue>>[]) {
  const successes = results.filter((result) => result.status === 'fulfilled');
  const failures = results.filter((result) => result.status === 'rejected');
  assert.equal(successes.length, 1);
  assert.equal(failures.length, 1);
  assert.ok(failures[0].reason instanceof StateConflict);
  assert.deepEqual(failures[0].reason.current, successes[0].value);
  return successes[0].value;
}

test('S3 learner documents preserve state across clients and reject competing note writes', async () => {
  const server = await startS3Server();
  const clients: S3Client[] = [];
  const open = () => {
    const client = new S3Client({
      endpoint: server.endpoint,
      region: 'test',
      forcePathStyle: true,
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
    clients.push(client);
    return new StateStore(
      new S3DocumentStore(
        { bucket: server.bucket, endpoint: server.endpoint, prefix: 'test/', region: 'test', forcePathStyle: true },
        client,
      ),
    );
  };
  const store = open();
  const secondTab = open();
  try {
    assert.deepEqual(await store.read('course', 'lesson', 'note', { text: '' }), {
      version: 0,
      value: { text: '' },
      updatedAt: null,
    });
    const first = winner(
      await Promise.allSettled([
        store.write('course', 'lesson', 'note', 0, { text: 'first' }, { text: '' }),
        secondTab.write('course', 'lesson', 'note', 0, { text: 'second' }, { text: '' }),
      ]),
    );
    assert.equal(first.version, 1);
    const updated = winner(
      await Promise.allSettled([
        store.write('course', 'lesson', 'note', 1, { text: 'third' }, { text: '' }),
        secondTab.write('course', 'lesson', 'note', 1, { text: 'fourth' }, { text: '' }),
      ]),
    );
    assert.equal(updated.version, 2);
    assert.deepEqual(await store.read('course', 'lesson', 'note', { text: '' }), updated);
    await assert.rejects(store.write('course', 'lesson', 'note', 0, { text: 'stale' }, { text: '' }), StateConflict);
    await assert.rejects(
      store.write('course', 'lesson', 'note', Number.MAX_SAFE_INTEGER, { text: 'overflow' }, { text: '' }),
      StateConflict,
    );
    const completion = await store.write(
      'course',
      'lesson',
      'completion',
      0,
      { completed: true },
      { completed: false },
    );
    const resume = await store.write(
      'course',
      '',
      'resume',
      0,
      { lessonId: 'lesson', heading: 'stable-heading' },
      null,
    );
    const other = await store.write('other-course', 'lesson', 'note', 0, { text: 'other' }, { text: '' });
    for (const client of clients) client.destroy();
    const restarted = open();
    assert.deepEqual(await restarted.read('course', 'lesson', 'note', { text: '' }), updated);
    assert.deepEqual(await restarted.read('course', 'lesson', 'completion', { completed: false }), completion);
    assert.deepEqual(await restarted.read('course', '', 'resume', null), resume);
    assert.deepEqual(await restarted.read('other-course', 'lesson', 'note', { text: '' }), other);
    assert.deepEqual(await restarted.read('missing-course', 'lesson', 'completion', { completed: false }), {
      version: 0,
      value: { completed: false },
      updatedAt: null,
    });
    await assert.rejects(
      restarted.write('course', '', 'resume', 0, { lessonId: 'different', heading: null }, null),
      StateConflict,
    );
    assert.deepEqual(server.errors, []);
  } finally {
    clients.forEach((client) => client.destroy());
    await server.close();
  }
});

test('completion is per lesson and repeated same-target actions do not create conflicts or versions', async () => {
  const objects = new Map<string, { value: unknown; etag: string }>();
  const documents: DocumentStore = {
    read: async (key) => structuredClone(objects.get(key) ?? null),
    write: async (key, value, expectedEtag) => {
      if ((objects.get(key)?.etag ?? null) !== expectedEtag) return false;
      objects.set(key, { value: structuredClone(value), etag: String(Number(expectedEtag ?? 0) + 1) });
      return true;
    },
    check: async () => {},
  };
  const store = new StateStore(documents);
  const fallback = { completed: false };
  assert.deepEqual(await store.write('course', 'lesson-a', 'completion', 0, fallback, fallback), {
    version: 0,
    value: fallback,
    updatedAt: null,
  });
  const [a, duplicate] = await Promise.all([
    store.write('course', 'lesson-a', 'completion', 0, { completed: true }, fallback),
    store.write('course', 'lesson-a', 'completion', 0, { completed: true }, fallback),
  ]);
  assert.deepEqual(duplicate, a);
  assert.equal(a.version, 1);
  assert.deepEqual(await store.write('course', 'lesson-a', 'completion', 0, { completed: true }, fallback), a);
  const b = await store.write('course', 'lesson-b', 'completion', 0, { completed: true }, fallback);
  assert.equal(b.version, 1);
  await assert.rejects(store.write('course', 'lesson-a', 'completion', 0, fallback, fallback), StateConflict);
  const undone = await store.write('course', 'lesson-a', 'completion', 1, fallback, fallback);
  assert.equal(undone.version, 2);
  assert.deepEqual(await store.read('course', 'lesson-b', 'completion', fallback), b);
});

test('malformed persisted learner state fails without overwriting it', async () => {
  const malformed = [
    null,
    [],
    {},
    { version: 0, value: { text: 'bad' }, updatedAt: new Date().toISOString() },
    { version: 1, value: { text: false }, updatedAt: new Date().toISOString() },
    { version: 1, value: { text: 'bad' }, updatedAt: 'invalid' },
  ];
  for (const value of malformed) {
    const documents: DocumentStore = {
      read: async () => ({ value, etag: 'etag' }),
      write: async () => {
        assert.fail('Corrupt state must not be overwritten.');
      },
      check: async () => {},
    };
    const store = new StateStore(documents);
    await assert.rejects(store.read('course', 'lesson', 'note', { text: '' }), /Invalid stored learner state/);
    await assert.rejects(
      store.write('course', 'lesson', 'note', 0, { text: 'replacement' }, { text: '' }),
      /Invalid stored learner state/,
    );
  }
  assert.equal(documentKey('courses', 'a/b', 'lessons', 'c', 'note'), 'courses/a%2Fb/lessons/c/note.json');
});
