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

import { source } from '@/lib/source';
import { createFromSource } from 'fumadocs-core/search/server';
import { getCourse, type CourseCatalog } from '@/lib/content/catalog';

const searches = new WeakMap<CourseCatalog, ReturnType<typeof createFromSource>>();

function getSearch(course: CourseCatalog) {
  const cached = searches.get(course);

  if (cached) {
    return cached;
  }

  const search = createFromSource(
    {
      ...source,
      getPages: () => course.lessons.map((lesson) => source.getPage([course.id, lesson.id])!),
      // Course search links directly to lessons without navigation breadcrumbs.
      getPageTree: () => ({ name: '', children: [] }),
    },
    {
      buildIndex: (page) => ({
        id: page.slugs.join('/'),
        title: page.data.title,
        description: page.data.description ?? '',
        url: page.url,
        structuredData: page.data.structuredData,
      }),
    },
  );

  searches.set(course, search);
  return search;
}

export async function GET(request: Request, { params }: RouteContext<'/api/courses/[course]/search'>) {
  const { course: courseId } = await params;
  const course = getCourse(courseId);

  if (!course) {
    return Response.json({ error: 'Course not found.' }, { status: 404 });
  }

  const url = new URL(request.url);
  const query = url.searchParams.get('query') ?? url.searchParams.get('q') ?? '';

  if (query.length > 500) {
    return Response.json({ error: 'Query is too long.' }, { status: 400 });
  }

  const results = query.trim() ? await getSearch(course).search(query, { limit: 20 }) : [];

  return Response.json(results, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
