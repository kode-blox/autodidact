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

import { randomUUID } from 'node:crypto';
import { cache } from 'react';
import { llms } from 'fumadocs-core/source';
import type { Item, Node, Root } from 'fumadocs-core/page-tree';
import { appName, lessonUrl } from '@/lib/shared';
import { getCoursePublication, type CoursePublication } from '@/lib/content/library';

// Layout, metadata, and page rendering share one accepted revision per render.
export const getRenderPublication = cache(getCoursePublication);

const publicationTrees = new WeakMap<CoursePublication, Root>();

export function getPublicationTree(publication: CoursePublication): Root {
  const { source, catalog: courses } = publication;
  const cached = publicationTrees.get(publication);
  if (cached) return cached;

  const pages = new Map<string, Item>();
  function collect(nodes: Node[]) {
    for (const node of nodes) {
      if (node.type === 'page') {
        pages.set(node.url, node);
      } else if (node.type === 'folder') {
        if (node.index) {
          pages.set(node.index.url, node.index);
        }
        collect(node.children);
      }
    }
  }
  collect(source.getPageTree().children);
  // Native layout state keys off tree IDs. Reuse them until the compiled catalog is replaced.
  const treeId = `publication:${randomUUID()}`;
  const tree: Root = {
    $id: treeId,
    name: appName,
    children: courses.map((course) => {
      const overview = pages.get(source.getPage([course.id])!.url);
      return {
        type: 'folder',
        $id: `${treeId}:course:${course.id}`,
        root: true,
        name: course.title,
        description: course.description,
        defaultOpen: true,
        icon: overview?.icon,
        children: [
          ...(overview ? [{ ...overview, name: 'Course contents' }] : []),
          ...course.modules.map((module) => ({
            type: 'folder' as const,
            $id: `${treeId}:course:${course.id}:module:${module.id}`,
            name: module.title,
            defaultOpen: true,
            children: module.lessons.flatMap((lesson) => {
              const node = pages.get(lessonUrl(course.id, lesson.id));
              return node ? [node] : [];
            }),
          })),
        ],
      };
    }),
  };
  publicationTrees.set(publication, tree);
  return tree;
}

export function createDocsLlms(getPublication: () => CoursePublication | Promise<CoursePublication>) {
  return llms(
    async () => {
      const publication = await getPublication();
      const { source, catalog: courses } = publication;
      return {
        ...source,
        getPages: () =>
          courses.flatMap((course) => [
            source.getPage([course.id])!,
            ...course.lessons.map((lesson) => source.getPage([course.id, lesson.id])!),
          ]),
        getPageTree: () => getPublicationTree(publication),
      };
    },
    {
      renderPage: async (page) => {
        return `# ${page.data.title} (${page.url})\n\n${await page.data.getText('processed')}`;
      },
    },
  );
}

export const docsLlms = createDocsLlms(getCoursePublication);
