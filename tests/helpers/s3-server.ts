import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';

/** Small HTTP fixture for the S3 operations used by the application, not a storage emulator. */
export async function startS3Server(bucket = 'autodidact-test') {
  const objects = new Map<string, { body: Buffer; etag: string }>();
  const errors: unknown[] = [];
  const requests: { method: string; key: string; ifMatch?: string; ifNoneMatch?: string }[] = [];
  const server = createServer(async (request, response) => {
    const fail = (status: number, code: string) => {
      response.writeHead(status, { 'Content-Type': 'application/xml' });
      response.end(`<Error><Code>${code}</Code><Message>${code}</Message></Error>`);
    };
    try {
      assert.match(request.headers.authorization ?? '', /^AWS4-HMAC-SHA256 /);
      const pathname = new URL(request.url!, 'http://s3.test').pathname;
      if (!pathname.startsWith(`/${bucket}/`)) return fail(404, 'NoSuchBucket');
      const key = decodeURIComponent(pathname.slice(bucket.length + 2));
      requests.push({
        method: request.method!,
        key,
        ifMatch: request.headers['if-match'],
        ifNoneMatch: request.headers['if-none-match'],
      });
      if (request.method === 'GET' || request.method === 'HEAD') {
        const object = objects.get(key);
        if (!object) return fail(404, 'NoSuchKey');
        response.writeHead(200, {
          'Content-Type': 'application/json',
          'Content-Length': object.body.length,
          ETag: `"${object.etag}"`,
        });
        return response.end(request.method === 'HEAD' ? undefined : object.body);
      }
      assert.equal(request.method, 'PUT', 'Unexpected S3 operation.');
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks);
      const previous = objects.get(key);
      if (request.headers['if-none-match'] === '*' && previous) return fail(412, 'PreconditionFailed');
      // Hetzner's conditional PUT compares the bare ETag, although GET returns quotes.
      if (request.headers['if-match'] !== undefined && request.headers['if-match'] !== previous?.etag)
        return fail(412, 'PreconditionFailed');
      const etag = createHash('md5').update(body).digest('hex');
      objects.set(key, { body, etag });
      response.writeHead(200, { ETag: `"${etag}"` });
      response.end();
    } catch (error) {
      errors.push(error);
      if (!response.headersSent) fail(500, 'InternalError');
      else response.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return {
    bucket,
    endpoint: `http://127.0.0.1:${address.port}`,
    objects,
    errors,
    requests,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    },
  };
}
