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

import { docsLlms } from '@/lib/content/publication';
import { getCoursePublication } from '@/lib/content/library';
import { notFound } from 'next/navigation';

export async function GET(_request: Request, { params }: RouteContext<'/llms.mdx/courses/[[...slug]]'>) {
  const publication = await getCoursePublication();

  const { slug } = await params;
  const page = publication.source.getPage(slug?.slice(0, -1));
  if (!page || slug?.at(-1) !== 'content.md') {
    notFound();
  }

  return new Response(await docsLlms.page(page), {
    headers: {
      'Content-Type': 'text/markdown',
    },
  });
}
