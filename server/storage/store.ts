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

import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

export interface StoredDocument {
  value: unknown;
  etag: string;
}

export interface DocumentStore {
  read(key: string): Promise<StoredDocument | null>;
  write(key: string, value: unknown, expectedEtag: string | null): Promise<boolean>;
  check(): Promise<void>;
}

export interface StorageConfig {
  bucket: string;
  region: string;
  endpoint?: string;
  forcePathStyle: boolean;
}

export function storageConfig(env: Readonly<Record<string, string | undefined>> = process.env): StorageConfig {
  const bucket = env.AUTODIDACT_S3_BUCKET?.trim();
  const region = env.AUTODIDACT_S3_REGION?.trim();

  if (!bucket || !region) {
    throw new Error('AUTODIDACT_S3_BUCKET and AUTODIDACT_S3_REGION are required.');
  }

  const endpoint = env.AUTODIDACT_S3_ENDPOINT?.trim() || undefined;

  if (endpoint) {
    const url = new URL(endpoint);

    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error('AUTODIDACT_S3_ENDPOINT must be an HTTP(S) URL without credentials, query, or fragment.');
    }
  }

  const pathStyle = env.AUTODIDACT_S3_USE_PATH_STYLE;

  if (pathStyle !== undefined && pathStyle !== '' && pathStyle !== 'true' && pathStyle !== 'false') {
    throw new Error('AUTODIDACT_S3_USE_PATH_STYLE must be true or false.');
  }

  return {
    bucket,
    region,
    endpoint,
    forcePathStyle: pathStyle ? pathStyle === 'true' : !!endpoint,
  };
}

export const documentKey = (...segments: string[]): string =>
  `${segments.map((segment) => encodeURIComponent(segment)).join('/')}.json`;

function errorName(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'name' in error ? String(error.name) : undefined;
}

export class S3DocumentStore implements DocumentStore {
  private readonly client: Pick<S3Client, 'send'>;

  constructor(
    private readonly config: StorageConfig,

    client?: Pick<S3Client, 'send'>,
  ) {
    this.client =
      client ??
      new S3Client({
        region: config.region,
        endpoint: config.endpoint,
        forcePathStyle: config.forcePathStyle,
        // Optional SDK checksums are not supported by every S3-compatible service.
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      });
  }

  async read(key: string): Promise<StoredDocument | null> {
    let response;

    try {
      response = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: key }));
    } catch (error) {
      // Only a missing key represents absent state. Configuration, permission,
      // and service errors must never silently reset the learner's documents.
      if (errorName(error) === 'NoSuchKey') {
        return null;
      }

      throw error;
    }

    if (!response.Body || !response.ETag) {
      throw new Error('Stored document is missing its body or ETag.');
    }

    const text = await response.Body.transformToString();
    let parsed: unknown;

    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('Invalid stored document JSON.');
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Invalid stored document.');
    }

    const envelope = parsed as Record<string, unknown>;

    if (envelope.formatVersion !== 1 || !Object.hasOwn(envelope, 'value')) {
      throw new Error('Unsupported stored document format.');
    }

    return { value: envelope.value, etag: response.ETag };
  }

  async write(key: string, value: unknown, expectedEtag: string | null): Promise<boolean> {
    const etags = [expectedEtag];
    // Preserve standard HTTP quoting first. Hetzner/Ceph requires a bare ETag
    // on conditional PUT, so retry that spelling only after a rejected write.
    if (this.config.endpoint && expectedEtag?.startsWith('"') && expectedEtag.endsWith('"')) {
      etags.push(expectedEtag.slice(1, -1));
    }

    const body = JSON.stringify({ formatVersion: 1, value });

    for (const [index, etag] of etags.entries()) {
      try {
        await this.client.send(
          new PutObjectCommand({
            Bucket: this.config.bucket,
            Key: key,
            Body: body,
            ContentType: 'application/json',
            ...(etag === null ? { IfNoneMatch: '*' } : { IfMatch: etag }),
          }),
        );
        return true;
      } catch (error) {
        if (errorName(error) === 'PreconditionFailed') {
          if (index + 1 < etags.length) {
            continue;
          }

          return false;
        }
        if (errorName(error) === 'ConditionalRequestConflict') {
          return false;
        }

        throw error;
      }
    }
    return false;
  }

  async check(): Promise<void> {
    // Probe GetObject access to the configured bucket without changing data
    // or listing objects. Providers may require bucket-list permission to
    // distinguish a missing probe key from denied access. Writes are not tested.
    await this.read(documentKey('health'));
  }
}

let documents: DocumentStore | undefined;

export function getDocumentStore(): DocumentStore {
  return (documents ??= new S3DocumentStore(storageConfig()));
}
