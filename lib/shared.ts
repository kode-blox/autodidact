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

import { createGetUrl } from 'fumadocs-core/source';

export const appName = 'AutoDidact';
export const docsRoute = '/courses';
export const docsImageRoute = '/og/courses';
export const docsContentRoute = '/llms.mdx/courses';

export function lessonUrl(courseId: string, lessonId: string) {
  return `${docsRoute}/${encodeURIComponent(courseId)}/${encodeURIComponent(lessonId)}`;
}

// fill this with your actual GitHub info, for example:
export const gitConfig = {
  user: 'kode-blox',
  repo: 'autodidact',
  branch: 'main',
};

const getContentUrl = createGetUrl(docsContentRoute);

export function getPageMarkdownUrl(page: { slugs: string[]; locale?: string }) {
  const segments = [...page.slugs, 'content.md'];

  return { segments, url: getContentUrl(segments, page.locale) };
}

const getImageUrl = createGetUrl(docsImageRoute);

export function getPageImageUrl(page: { slugs: string[]; locale?: string }) {
  const segments = [...page.slugs, 'image.png'];

  return { segments, url: getImageUrl(segments, page.locale) };
}

/** The edit link follows the authored file, while public URLs use stable IDs. */
export function getPageGitHubUrl(page: { path: string }) {
  const authoredPath = ['content', 'courses', ...page.path.split('/')].map(encodeURIComponent).join('/');
  return `https://github.com/${gitConfig.user}/${gitConfig.repo}/blob/${gitConfig.branch}/${authoredPath}`;
}
