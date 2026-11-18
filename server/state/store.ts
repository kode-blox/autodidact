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

import {
  MAX_NOTE_LENGTH,
  type CompletionValue,
  type NoteValue,
  type Resource,
  type ResumeValue,
} from '@/lib/learner-types';
import { documentKey, getDocumentStore, type DocumentStore } from '@/server/storage/store';

export type ResourceKind = 'completion' | 'note' | 'resume';

type Value = CompletionValue | NoteValue | ResumeValue | null;

export const emptyResource = <T>(value: T): Resource<T> => ({ version: 0, value, updatedAt: null });

export class StateConflict extends Error {
  constructor(public readonly current: Resource<Value>) {
    super('State has changed; reload before saving.');
  }
}

function resource<T extends Value>(value: unknown, kind: ResourceKind): Resource<T> {
  const fail = () => {
    throw new Error('Invalid stored learner state.');
  };

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fail();
  }

  const data = value as Record<string, unknown>;

  if (
    !Number.isSafeInteger(data.version) ||
    (data.version as number) < 1 ||
    typeof data.updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(data.updatedAt))
  ) {
    return fail();
  }

  const payload = data.value;

  if (kind === 'resume' && payload === null) {
    return data as unknown as Resource<T>;
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return fail();
  }

  const fields = payload as Record<string, unknown>;

  if (kind === 'completion' && typeof fields.completed !== 'boolean') {
    return fail();
  }

  if (kind === 'note' && (typeof fields.text !== 'string' || fields.text.length > MAX_NOTE_LENGTH)) {
    return fail();
  }

  if (
    kind === 'resume' &&
    (typeof fields.lessonId !== 'string' ||
      !fields.lessonId ||
      !(fields.heading === null || typeof fields.heading === 'string'))
  ) {
    return fail();
  }

  return data as unknown as Resource<T>;
}

function keyFor(courseId: string, scopeId: string, kind: ResourceKind): string {
  return kind === 'resume'
    ? documentKey('courses', courseId, 'resume')
    : documentKey('courses', courseId, 'lessons', scopeId, kind);
}

export class StateStore {
  constructor(private readonly documents: DocumentStore | (() => DocumentStore) = getDocumentStore) {}

  private storage() {
    return typeof this.documents === 'function' ? this.documents() : this.documents;
  }

  async read<T extends Value>(
    courseId: string,
    scopeId: string,
    kind: ResourceKind,
    fallback: T,
  ): Promise<Resource<T>> {
    const stored = await this.storage().read(keyFor(courseId, scopeId, kind));

    return stored ? resource<T>(stored.value, kind) : emptyResource(fallback);
  }

  async write<T extends Value>(
    courseId: string,
    scopeId: string,
    kind: ResourceKind,
    expectedVersion: number,
    value: T,
    fallback: T,
  ): Promise<Resource<T>> {
    const documents = this.storage();
    const key = keyFor(courseId, scopeId, kind);
    const stored = await documents.read(key);
    const current = stored ? resource<T>(stored.value, kind) : emptyResource(fallback);
    // Repeating completion is already satisfied, including from an older tab.
    // Notes and resume deliberately retain strict revision checks.

    if (
      kind === 'completion' &&
      (current.value as CompletionValue).completed === (value as CompletionValue).completed
    ) {
      return current;
    }

    if (
      !Number.isSafeInteger(expectedVersion) ||
      expectedVersion < 0 ||
      expectedVersion === Number.MAX_SAFE_INTEGER ||
      current.version !== expectedVersion
    ) {
      throw new StateConflict(current);
    }

    const next: Resource<T> = { version: expectedVersion + 1, value, updatedAt: new Date().toISOString() };

    if (!(await documents.write(key, next, stored?.etag ?? null))) {
      const latest = await this.read(courseId, scopeId, kind, fallback);

      if (
        kind === 'completion' &&
        (latest.value as CompletionValue).completed === (value as CompletionValue).completed
      ) {
        return latest;
      }

      throw new StateConflict(latest);
    }

    return next;
  }
}

export const stateStore = new StateStore();
