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

import { loader } from 'fumadocs-core/source';
import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons';
import { docsRoute } from '@/lib/shared';
import { defineCollections } from 'fumadocs-mdx/macro';
import { courseCollectionSchema, moduleCollectionSchema, lessonCollectionSchema } from '@/lib/content/schemas';

export const courseDocuments = defineCollections({
  type: 'doc',
  dir: 'content/courses',
  files: ['**/course.md'],
  schema: courseCollectionSchema,
  postprocess: { includeProcessedMarkdown: true, valueToExport: ['authoredLinks'] },
});

export const moduleDocuments = defineCollections({
  type: 'doc',
  dir: 'content/courses',
  files: ['**/module.md'],
  schema: moduleCollectionSchema,
  postprocess: { valueToExport: ['authoredLinks'] },
});

export const lessonDocuments = defineCollections({
  type: 'doc',
  dir: 'content/courses',
  files: ['**/lessons/*.md'],
  schema: lessonCollectionSchema,
  postprocess: { includeProcessedMarkdown: true, valueToExport: ['authoredLinks'] },
});

/** Published URLs use permanent authored IDs, never source paths or titles. */
export const source = loader({
  baseUrl: docsRoute,
  source: {
    courses: courseDocuments.toFumadocsSource(),
    lessons: lessonDocuments.toFumadocsSource(),
  },
  plugins: [lucideIconsPlugin()],
  slugs: (file) => (file.type === 'courses' ? [file.data.id] : [file.data.course, file.data.id]),
});
