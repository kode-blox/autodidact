/*
 * Copyright 2026 Sayak Mukhopadhyay
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { StateConflict } from '@/server/state/store';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export function checkMutation(request: Request): void {
  const contentType = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();

  if (contentType !== 'application/json') {
    throw new HttpError(415, 'Content-Type must be application/json.');
  }

  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new HttpError(403, 'Cross-site requests are forbidden.');
  }

  const origin = request.headers.get('origin');
  const configuredOrigin = process.env.AUTODIDACT_PUBLIC_URL;
  const expected = configuredOrigin ? new URL(configuredOrigin).origin : new URL(request.url).origin;

  if (!origin || origin !== expected) {
    throw new HttpError(403, 'Origin is not allowed.');
  }
}

export async function readJson(request: Request, maximumBytes = 100_000): Promise<unknown> {
  const reader = request.body?.getReader();

  if (!reader) {
    throw new HttpError(400, 'A JSON body is required.');
  }

  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      size += value.byteLength;
      if (size > maximumBytes) {
        await reader.cancel();
        throw new HttpError(413, 'Request body is too large.');
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new HttpError(400, 'Invalid JSON body.');
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof StateConflict) {
    return json({ error: error.message, current: error.current }, 409);
  }

  if (error instanceof HttpError) {
    return json({ error: error.message }, error.status);
  }

  return json({ error: 'Learner storage is unavailable. Please try again later.' }, 503);
}
