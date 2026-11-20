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

import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { frontmatter } from 'fumadocs-core/content/md/frontmatter';
import { defineCollections } from 'fumadocs-mdx/config';
import { dynamic, type LazyEntry } from 'fumadocs-mdx/runtime/dynamic';
import { markdownOptions } from '@/lib/content/markdown';
import {
  courseCollectionSchema,
  moduleCollectionSchema,
  lessonCollectionSchema,
  publicAssetUrls,
} from '@/lib/content/schemas';

const collectionsKey = Symbol.for('autodidact.courseCollections');

export function loadCourseCollections() {
  // The Next.js instrumentation and route bundles share one startup snapshot.
  const runtime = globalThis as typeof globalThis & {
    [collectionsKey]?: ReturnType<typeof createRuntimeCollections>;
  };

  return (runtime[collectionsKey] ??= createRuntimeCollections(process.cwd()));
}

/** Compile the course files visible when the server starts. */
export async function createRuntimeCollections(root: string) {
  const appRoot = path.resolve(root);
  const directory = path.join(appRoot, 'content', 'courses');

  for (const folder of [appRoot, path.join(appRoot, 'content'), directory]) {
    if (lstatSync(folder, { throwIfNoEntry: false })?.isSymbolicLink()) {
      throw new Error(`Course symlinks are unsupported: ${folder}`);
    }
  }

  const publicUrls = publicAssetUrls(path.join(appRoot, 'public'));
  const moduleParser = moduleCollectionSchema(publicUrls);
  const lessonParser = lessonCollectionSchema(publicUrls);
  const courses: LazyEntry[] = [];
  const modules: LazyEntry[] = [];
  const lessons: LazyEntry[] = [];

  function collect(folder: string) {
    let children;

    try {
      children = readdirSync(folder, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT' && folder === directory) {
        return;
      }
      throw error;
    }

    for (const item of children.sort((a, b) => a.name.localeCompare(b.name))) {
      const filename = path.join(folder, item.name);

      if (item.isSymbolicLink()) {
        throw new Error(`Course symlinks are unsupported: ${filename}`);
      }

      if (item.isDirectory()) {
        collect(filename);
        continue;
      }

      if (!item.isFile() || !item.name.endsWith('.md')) {
        continue;
      }

      const info = { path: path.relative(directory, filename).split(path.sep).join('/'), fullPath: filename };
      const source = readFileSync(filename, 'utf8');
      const data = frontmatter(source).data;

      if (item.name === 'course.md') {
        courses.push({ info, data: courseCollectionSchema({ path: filename }, publicUrls).parse(data) });
      } else if (item.name === 'module.md') {
        modules.push({ info, data: moduleParser.parse(data) });
      } else if (path.basename(folder) === 'lessons') {
        lessons.push({ info, data: lessonParser.parse(data) });
      }
    }
  }

  collect(directory);
  const compiler = await dynamic(
    {
      default: { mdxOptions: markdownOptions },
      courses: defineCollections({
        type: 'doc',
        dir: directory,
        schema: (context) => courseCollectionSchema(context, publicUrls),
        postprocess: { includeProcessedMarkdown: true, valueToExport: ['authoredLinks'] },
      }),
      modules: defineCollections({
        type: 'doc',
        dir: directory,
        schema: moduleParser,
      }),
      lessons: defineCollections({
        type: 'doc',
        dir: directory,
        schema: lessonParser,
        postprocess: { includeProcessedMarkdown: true, valueToExport: ['authoredLinks'] },
      }),
    },
    { environment: 'next' },
  );

  // Preserve the compiled collection shapes used by navigation, validation and search.
  const [courseEntries, moduleEntries, lessonEntries] = await Promise.all([
    compiler
      .doc('courses', directory, courses)
      .then((entries) => Promise.all(entries.map(async (entry) => ({ ...entry, ...(await entry.load()) })))),
    compiler
      .doc('modules', directory, modules)
      .then((entries) => Promise.all(entries.map(async (entry) => ({ ...entry, ...(await entry.load()) })))),
    compiler
      .doc('lessons', directory, lessons)
      .then((entries) => Promise.all(entries.map(async (entry) => ({ ...entry, ...(await entry.load()) })))),
  ]);

  return {
    courseDocuments: { entries: courseEntries },
    moduleDocuments: { entries: moduleEntries },
    lessonDocuments: { entries: lessonEntries },
  };
}
