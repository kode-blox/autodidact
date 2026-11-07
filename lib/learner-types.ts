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

export const MAX_NOTE_LENGTH = 20_000;

export interface Resource<T> {
  version: number;
  value: T;
  updatedAt: string | null;
}

export interface CompletionValue {
  completed: boolean;
}

export interface NoteValue {
  text: string;
}

export interface ResumeValue {
  lessonId: string;
  heading: string | null;
}

export interface LessonState {
  completion: Resource<CompletionValue>;
  note: Resource<NoteValue>;
  resume: Resource<ResumeValue | null>;
}

export interface CourseState {
  completions: Record<string, Resource<CompletionValue>>;
  resume: Resource<ResumeValue | null>;
}
