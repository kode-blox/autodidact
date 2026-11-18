import assert from 'node:assert/strict';
import test from 'node:test';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { documentKey, S3DocumentStore, storageConfig, type StorageConfig } from '@/server/storage/store';
import { startS3Server } from '@/tests/helpers/s3-server';

const config: StorageConfig = {
  bucket: 'test',
  region: 'test-region',
  prefix: 'autodidact/',
  forcePathStyle: true,
  endpoint: 'http://localhost:9000',
};
function transport(send: (command: unknown) => Promise<unknown>): Pick<S3Client, 'send'> {
  return { send } as unknown as Pick<S3Client, 'send'>;
}
const failure = (name: string) => Object.assign(new Error(name), { name });

test('S3 configuration has explicit required fields and portable defaults', () => {
  assert.throws(() => storageConfig({}), /S3_BUCKET and S3_REGION/);
  assert.deepEqual(storageConfig({ S3_BUCKET: 'bucket', S3_REGION: 'region' }), {
    bucket: 'bucket',
    region: 'region',
    endpoint: undefined,
    prefix: 'autodidact/',
    forcePathStyle: false,
  });
  const custom = storageConfig({
    S3_BUCKET: 'bucket',
    S3_REGION: 'region',
    S3_ENDPOINT: 'https://fsn1.your-objectstorage.com',
    S3_PREFIX: 'study',
    S3_FORCE_PATH_STYLE: 'false',
  });
  assert.equal(custom.prefix, 'study/');
  assert.equal(custom.forcePathStyle, false);
  assert.equal(
    storageConfig({ S3_BUCKET: 'bucket', S3_REGION: 'region', S3_ENDPOINT: 'http://localhost:9000', S3_PREFIX: '' })
      .forcePathStyle,
    true,
  );
  assert.throws(
    () => storageConfig({ S3_BUCKET: 'bucket', S3_REGION: 'region', S3_FORCE_PATH_STYLE: 'yes' }),
    /true or false/,
  );
  assert.throws(
    () => storageConfig({ S3_BUCKET: 'bucket', S3_REGION: 'region', S3_ENDPOINT: 'https://user:secret@example.test' }),
    /without credentials/,
  );
  assert.notEqual(documentKey('course/a', 'b'), documentKey('course', 'a/b'));
  assert.notEqual(documentKey('a%2Fb'), documentKey('a/b'));
});

test('only missing keys become empty state; bucket, permission and service failures propagate', async () => {
  for (const name of ['NoSuchKey', 'NoSuchBucket', 'AccessDenied', 'ServiceUnavailable']) {
    const storage = new S3DocumentStore(
      config,
      transport(async () => {
        throw failure(name);
      }),
    );
    if (name === 'NoSuchKey') {
      assert.equal(await storage.read('note.json'), null);
      await storage.check();
    } else {
      await assert.rejects(storage.read('note.json'), { name });
      await assert.rejects(storage.check(), { name });
    }
  }
});

test('corrupt, unsupported, and incomplete stored documents fail instead of resetting', async () => {
  for (const body of ['{', 'null', '[]', '{}', '{"formatVersion":2,"value":{}}', '{"formatVersion":1}']) {
    const storage = new S3DocumentStore(
      config,
      transport(async () => ({ ETag: 'etag', Body: { transformToString: async () => body } })),
    );
    await assert.rejects(storage.read('note.json'));
  }
  const noEtag = new S3DocumentStore(
    config,
    transport(async () => ({ Body: { transformToString: async () => '{"formatVersion":1,"value":{}}' } })),
  );
  await assert.rejects(noEtag.read('note.json'), /ETag/);
});

test('conditional failures are conflicts and infrastructure failures are errors', async () => {
  for (const name of ['PreconditionFailed', 'ConditionalRequestConflict', 'AccessDenied', 'ServiceUnavailable']) {
    const storage = new S3DocumentStore(
      config,
      transport(async () => {
        throw failure(name);
      }),
    );
    if (name === 'PreconditionFailed' || name === 'ConditionalRequestConflict')
      assert.equal(await storage.write('note.json', {}, 'etag'), false);
    else await assert.rejects(storage.write('note.json', {}, 'etag'), { name });
  }
});

test('writes use the loaded ETag and explicit conditional creation', async () => {
  for (const endpoint of [undefined, config.endpoint]) {
    const commands: PutObjectCommand[] = [];
    const storage = new S3DocumentStore(
      { ...config, endpoint },
      transport(async (command) => {
        assert.ok(command instanceof PutObjectCommand);
        commands.push(command);
        return {};
      }),
    );
    assert.equal(await storage.write('note.json', { text: 'first' }, null), true);
    assert.equal(await storage.write('note.json', { text: 'second' }, '"original"'), true);
    assert.equal(commands[0].input.IfNoneMatch, '*');
    assert.equal(commands[0].input.IfMatch, undefined);
    assert.equal(commands[1].input.IfMatch, '"original"');
    assert.equal(commands[1].input.IfNoneMatch, undefined);
    assert.equal(commands[1].input.Key, 'autodidact/note.json');
    assert.deepEqual(JSON.parse(commands[1].input.Body as string), { formatVersion: 1, value: { text: 'second' } });
  }
  let readKey: string | undefined;
  await new S3DocumentStore(
    config,
    transport(async (command) => {
      assert.ok(command instanceof GetObjectCommand);
      readKey = command.input.Key;
      throw failure('NoSuchKey');
    }),
  ).check();
  assert.equal(readKey, 'autodidact/health.json');
});

test('custom endpoints retry bare ETags only after a rejected quoted conditional update', async () => {
  for (const acceptBare of [true, false]) {
    const commands: PutObjectCommand[] = [];
    const storage = new S3DocumentStore(
      config,
      transport(async (command) => {
        assert.ok(command instanceof PutObjectCommand);
        commands.push(command);
        if (!acceptBare || command.input.IfMatch === '"original"') throw failure('PreconditionFailed');
        return {};
      }),
    );
    assert.equal(await storage.write('note.json', { text: 'new' }, '"original"'), acceptBare);
    assert.deepEqual(
      commands.map((command) => command.input.IfMatch),
      ['"original"', 'original'],
    );
    assert.equal(commands[0].input.Body, commands[1].input.Body);
  }
  let calls = 0;
  const aws = new S3DocumentStore(
    { ...config, endpoint: undefined },
    transport(async () => {
      calls++;
      throw failure('PreconditionFailed');
    }),
  );
  assert.equal(await aws.write('note.json', {}, '"original"'), false);
  assert.equal(calls, 1);
});

test('real SDK preserves conditional HTTP writes and reads document envelopes', async () => {
  const server = await startS3Server();
  const client = new S3Client({
    endpoint: server.endpoint,
    region: 'test',
    forcePathStyle: true,
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  const storage = new S3DocumentStore({ ...config, endpoint: server.endpoint, bucket: server.bucket }, client);
  try {
    await storage.check();
    assert.equal(await storage.read('note.json'), null);
    assert.equal(await storage.write('note.json', { text: 'first' }, null), true);
    const original = await storage.read('note.json');
    assert.ok(original);
    assert.deepEqual(original.value, { text: 'first' });
    assert.equal(await storage.write('note.json', { text: 'duplicate create' }, null), false);
    assert.equal(await storage.write('note.json', { text: 'second' }, original.etag), true);
    assert.equal(await storage.write('note.json', { text: 'stale' }, original.etag), false);
    assert.deepEqual((await storage.read('note.json'))?.value, { text: 'second' });
    assert.deepEqual(server.errors, []);
    assert.ok(server.requests.every((request) => !request.key.startsWith('autodidact/autodidact/')));
  } finally {
    client.destroy();
    await server.close();
  }
});
