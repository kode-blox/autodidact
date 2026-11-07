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

import path from 'node:path';
import type { StructuredData } from 'fumadocs-core/mdx-plugins/remark-structure';
import { lessonUrl } from '../shared';

export interface DocumentData {
  id: string;
  title: string;
  course?: string;
  description?: string;
  baseline?: string;
  modules?: string[];
  lessons?: string[];
  experiments?: { id: string; title: string; file: string; html?: string }[];
  publicUrls?: string[];
}
export interface CompiledDocument {
  path: string;
  kind: 'courses' | 'modules' | 'lessons';
  data: DocumentData;
  links: string[];
  structuredData: StructuredData;
}

/** Validate the complete publication before making a catalog available. */
export function validateCompiledDocuments(
  documents: CompiledDocument[],
  assetPaths: string[] = [],
  publicUrls: string[] = [],
): CompiledDocument[] {
  const keys = new Set<string>();

  for (const doc of documents) {
    const key = `${doc.kind}/${doc.kind === 'courses' ? '' : doc.data.course + '/'}${doc.data.id}`;

    if (keys.has(key)) {
      throw new Error(`Duplicate authored ID: ${key}`);
    }

    keys.add(key);
  }

  const membership = new Map<CompiledDocument, number>();

  for (const parent of documents.filter((doc) => doc.kind !== 'lessons')) {
    const field = parent.kind === 'courses' ? 'modules' : 'lessons';
    const refs = parent.data[field];

    if (!refs || new Set(refs).size !== refs.length) {
      throw new Error(`${parent.path}: invalid ordered ${field}`);
    }

    for (const id of refs) {
      const course = parent.kind === 'courses' ? parent.data.id : parent.data.course;

      const child = documents.find((doc) => {
        return doc.kind === field && doc.data.course === course && doc.data.id === id;
      });

      if (!child) {
        throw new Error(`${parent.path}: missing ${field} reference ${id}`);
      }

      membership.set(child, (membership.get(child) ?? 0) + 1);
    }
  }

  for (const doc of documents.filter((doc) => doc.kind !== 'courses')) {
    if (membership.get(doc) !== 1) {
      throw new Error(`${doc.path}: orphan or duplicate membership`);
    }
  }

  const files = new Set(assetPaths.map((file) => path.resolve(file)));

  for (const course of documents.filter((doc) => doc.kind === 'courses')) {
    const seen = new Set<string>();

    for (const experiment of course.data.experiments ?? []) {
      if (seen.has(experiment.id)) {
        throw new Error(`${course.path}: invalid or duplicate experiment`);
      }

      seen.add(experiment.id);
      const target = path.resolve(path.dirname(course.path), experiment.file);

      if (
        !/^experiments\/[a-zA-Z0-9_-]+\.html$/.test(experiment.file) ||
        (experiment.html === undefined && !files.has(target))
      ) {
        throw new Error(
          `${course.path}: missing or unsafe experiment ${experiment.file}; use experiments/{filename}.html without nested directories or dot segments`,
        );
      }
    }
  }

  for (const doc of documents) {
    const courseId = doc.data.course ?? doc.data.id;
    const course = documents.find((other) => other.kind === 'courses' && other.data.id === courseId)!;

    const experimentLinks = new Set(
      (course.data.experiments ?? []).map((experiment) => `/experiments/${courseId}/${experiment.id}`),
    );

    const lessons = new Map(
      documents
        .filter(
          (other) =>
            (other.kind === 'lessons' && other.data.course === courseId) ||
            (other.kind === 'courses' && other.data.id === courseId),
        )
        .map((other) => [
          other.kind === 'courses' ? `/courses/${encodeURIComponent(courseId)}` : lessonUrl(courseId, other.data.id),
          other,
        ]),
    );

    const allowedAssets = new Set([...publicUrls, ...(doc.data.publicUrls ?? [])]);

    for (const url of doc.links) {
      if (/^(https?:|mailto:)/i.test(url)) {
        continue;
      }

      const hash = url.indexOf('#');
      const route = hash < 0 ? url : url.slice(0, hash);
      const fragment = hash < 0 ? '' : url.slice(hash + 1);

      let target = route ? lessons.get(route) : doc.kind !== 'modules' ? doc : undefined;

      if (route.startsWith('./') || route.startsWith('../')) {
        let decoded: string;
        try {
          decoded = decodeURI(route);
        } catch {
          throw new Error(`${doc.path}: invalid encoded relative link ${url}`);
        }

        if (!decoded.includes('\\')) {
          const resolved = path.resolve(path.dirname(doc.path), decoded);
          target = documents.find(
            (other) =>
              other.kind !== 'modules' &&
              (other.data.course ?? other.data.id) === courseId &&
              path.resolve(other.path) === resolved,
          );
        }
      }

      if (target && (route || url.startsWith('#'))) {
        let anchor: string;
        try {
          anchor = decodeURIComponent(fragment);
        } catch {
          throw new Error(`${doc.path}: invalid encoded anchor ${url}`);
        }

        if (anchor && !target.structuredData.headings.some((heading) => heading.id === anchor)) {
          throw new Error(`${doc.path}: missing published heading anchor ${url}`);
        }

        continue;
      }

      if (experimentLinks.has(url) || allowedAssets.has(route)) {
        continue;
      }

      if (/^[a-z][\w+.-]*:/i.test(url) || url.startsWith('//') || url.startsWith('/')) {
        throw new Error(`${doc.path}: unsafe link ${url}`);
      }

      throw new Error(
        `${doc.path}: unsupported relative content URL ${url}. Use /courses/${courseId}[/{lesson-id}][#heading], ./ or ../ paths to published course/lesson Markdown in this course, /experiments/${courseId}/{experiment-id}, or a root-relative file from public/. Other source-tree files are not published.`,
      );
    }
  }
  return documents;
}
