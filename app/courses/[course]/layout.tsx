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

import type { DefaultSearchDialogProps } from 'fumadocs-ui/components/dialog/search-default';
import { SearchProvider } from 'fumadocs-ui/contexts/search';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { notFound } from 'next/navigation';
import { getCatalog, getCourse } from '@/lib/content/catalog';
import { baseOptions } from '@/lib/layout.shared';
import { getPublicationTree } from '@/lib/content/publication';

export default async function Layout({ children, params }: LayoutProps<'/courses/[course]'>) {
  const { course: id } = await params;

  const course = getCourse(id);
  if (!course) {
    notFound();
  }

  return (
    <SearchProvider<DefaultSearchDialogProps>
      options={{ api: '/api/courses/' + encodeURIComponent(course.id) + '/search', delayMs: 250 }}
    >
      <DocsLayout tree={getPublicationTree(getCatalog())} {...baseOptions()}>
        {children}
      </DocsLayout>
    </SearchProvider>
  );
}
