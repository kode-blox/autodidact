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

import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createCourseCatalog, getCompiledDocuments, type CourseCatalog } from '@/lib/content/catalog';
import { compileCourseCollections, createRuntimeCollections, type CourseCollections } from '@/lib/content/runtime';
import { publicAssetFiles } from '@/lib/content/schemas';
import type { CompiledDocument } from '@/lib/content/validation';
import { createCourseSource } from '@/lib/source';

export interface CoursePublication {
  catalog: CourseCatalog[];
  getCourse(id: string): CourseCatalog | undefined;
  source: ReturnType<typeof createCourseSource>;
  externalEnabled: boolean;
  isExternal: boolean;
  assets: ReadonlyMap<string, Uint8Array<ArrayBuffer>>;
}

const pollIntervalMs = 5_000;
const libraryKey = Symbol.for('autodidact.courseLibrary');

export function isCourseReloadEnabled() {
  return Boolean(process.env.AUTODIDACT_EXTERNAL_COURSES_DIR);
}

async function snapshotAssets(documents: CompiledDocument[], files: Map<string, string>, appPublicUrls: Set<string>) {
  const assets = new Map<string, Uint8Array<ArrayBuffer>>();
  for (const document of documents) {
    if (document.kind === 'modules') continue;
    for (const link of document.links) {
      const url = link.split('#', 1)[0];
      const file = files.get(url);
      if (!file || assets.has(url)) continue;
      if (appPublicUrls.has(url)) {
        throw new Error('External asset URL also exists in the app public directory: ' + url);
      }
      // Serve the assets from the same publication as the course.
      assets.set(url, new Uint8Array(await readFile(file)));
    }
  }
  return assets;
}

export async function createCourseLibrary(appRoot: string, externalCoursesDir?: string) {
  const bundled = await createRuntimeCollections(appRoot);
  const appPublicUrls = new Set(bundled.publicUrls);
  const externalPath = externalCoursesDir ? path.resolve(externalCoursesDir) : undefined;

  function createPublication(
    collections: CourseCollections,
    catalog: CourseCatalog[],
    externalAssets?: CoursePublication['assets'],
  ): CoursePublication {
    return {
      catalog,
      getCourse: (id) => catalog.find((course) => course.id === id),
      source: createCourseSource(collections),
      externalEnabled: externalPath !== undefined,
      isExternal: externalAssets !== undefined,
      assets: externalAssets ?? new Map(),
    };
  }

  let publication = createPublication(bundled, createCourseCatalog(getCompiledDocuments(bundled)));
  let publishedRevision: string | undefined;
  let lastError: string | undefined;
  let pending: Promise<void> | undefined;

  async function refreshExternal(coursesDir: string) {
    const checkoutLink = path.dirname(coursesDir);
    try {
      // Resolve git-sync's checkout link once. Both trees must come from that worktree.
      const revision = await realpath(checkoutLink);
      const directory = path.join(revision, path.basename(coursesDir));
      if (!(await lstat(directory)).isDirectory()) {
        throw new Error('External courses must be a directory inside the resolved checkout: ' + directory);
      }
      if (revision === publishedRevision) return;

      const files = publicAssetFiles(path.join(revision, 'public'), 'course-assets');
      const external = await compileCourseCollections(directory, [...appPublicUrls, ...files.keys()]);
      const documents = getCompiledDocuments(external);
      const catalog = createCourseCatalog(documents);
      const assets = await snapshotAssets(documents, files, appPublicUrls);
      const candidate = createPublication(external, catalog, assets);

      // The sidecar may have moved on during compilation.
      if ((await realpath(checkoutLink)) === revision) {
        publication = candidate;
        publishedRevision = revision;
        lastError = undefined;
        return;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException | null)?.code !== 'ENOENT') {
        const reason = error instanceof Error ? error.message : String(error);
        if (reason !== lastError) {
          console.warn('External course reload failed.', reason);
          lastError = reason;
        }
      }
    }

    // The bundled publication is the startup fallback. Withdraw any active external revision.
    if (publishedRevision !== undefined) {
      const empty = { entries: [] };
      publication = createPublication({ courseDocuments: empty, moduleDocuments: empty, lessonDocuments: empty }, []);
      publishedRevision = undefined;
    }
  }

  return {
    getSnapshot: () => publication,
    refresh() {
      if (!externalPath) return Promise.resolve();
      return (pending ??= refreshExternal(externalPath).finally(() => {
        pending = undefined;
      }));
    },
  };
}

async function startCourseLibrary() {
  const library = await createCourseLibrary(process.cwd(), process.env.AUTODIDACT_EXTERNAL_COURSES_DIR);
  if (library.getSnapshot().externalEnabled) {
    const poll = async () => {
      await library.refresh();
      setTimeout(poll, pollIntervalMs).unref();
    };
    void poll();
  }
  return library;
}

export async function getCoursePublication(): Promise<CoursePublication> {
  // Instrumentation and the separate Next.js route bundles share the same library.
  const runtime = globalThis as typeof globalThis & {
    [libraryKey]?: ReturnType<typeof startCourseLibrary>;
  };

  const library = await (runtime[libraryKey] ??= startCourseLibrary());
  return library.getSnapshot();
}
