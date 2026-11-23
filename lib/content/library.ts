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

import { getCatalog, getCourse, type CourseCatalog } from '@/lib/content/catalog';
import { source } from '@/lib/source';

export interface CoursePublication {
  catalog: CourseCatalog[];
  getCourse: typeof getCourse;
  source: typeof source;
}

const publicationKey = Symbol.for('autodidact.coursePublication');

export async function getCoursePublication(): Promise<CoursePublication> {
  const runtime = globalThis as typeof globalThis & {
    [publicationKey]?: CoursePublication;
  };

  return (runtime[publicationKey] ??= { catalog: getCatalog(), getCourse, source });
}
