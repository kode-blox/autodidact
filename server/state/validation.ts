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

import { MAX_NOTE_LENGTH, type CompletionValue, type NoteValue, type ResumeValue } from '@/lib/learner-types';
import { HttpError } from '@/server/http';

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'Expected a JSON object.');
  }

  return value as Record<string, unknown>;
}

export function version(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new HttpError(400, 'expectedVersion must be a nonnegative safe integer.');
  }

  return value;
}

export function completion(value: unknown): CompletionValue {
  const data = object(value);

  if (typeof data.completed !== 'boolean') {
    throw new HttpError(400, 'completed must be a boolean.');
  }

  return { completed: data.completed };
}

export function note(value: unknown): NoteValue {
  const data = object(value);

  if (typeof data.text !== 'string' || data.text.length > MAX_NOTE_LENGTH) {
    throw new HttpError(400, `text must be at most ${MAX_NOTE_LENGTH} characters.`);
  }

  return { text: data.text };
}

export function resume(value: unknown): ResumeValue {
  const data = object(value);

  if (
    typeof data.lessonId !== 'string' ||
    !data.lessonId ||
    !(data.heading === null || typeof data.heading === 'string')
  ) {
    throw new HttpError(400, 'Invalid resume position.');
  }

  return { lessonId: data.lessonId, heading: data.heading };
}
