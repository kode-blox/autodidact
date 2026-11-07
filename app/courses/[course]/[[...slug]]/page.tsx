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

import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  MarkdownCopyButton,
  ViewOptionsPopover,
} from 'fumadocs-ui/layouts/docs/page';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { getMDXComponents } from '@/components/mdx';
import { source } from '@/lib/source';
import { getPageMetadata } from '@/lib/metadata';
import { getPageGitHubUrl, getPageMarkdownUrl, lessonUrl } from '@/lib/shared';
import { getCatalog, getCourse } from '@/lib/content/catalog';

export function generateStaticParams() {
  return getCatalog().flatMap((course) => [
    { course: course.id, slug: [] },
    ...course.lessons.map((lesson) => ({ course: course.id, slug: [lesson.id] })),
  ]);
}

async function getCoursePage({ params }: PageProps<'/courses/[course]/[[...slug]]'>) {
  const { course: courseId, slug = [] } = await params;

  if (slug.length > 1) {
    notFound();
  }

  const course = getCourse(courseId);
  const [lessonId] = slug;

  if (!course || (lessonId && !course.lessons.some((lesson) => lesson.id === lessonId))) {
    notFound();
  }

  const page = source.getPage([course.id, ...slug]);

  if (!page) {
    notFound();
  }

  return { course, lessonId, page };
}

export async function generateMetadata(props: PageProps<'/courses/[course]/[[...slug]]'>): Promise<Metadata> {
  const { page } = await getCoursePage(props);
  return getPageMetadata(page);
}

export default async function Page(props: PageProps<'/courses/[course]/[[...slug]]'>) {
  const { course, lessonId, page } = await getCoursePage(props);
  const markdownUrl = getPageMarkdownUrl(page).url;
  const Body = page.data.body;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full} footer={lessonId ? undefined : { enabled: false }}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription className="mb-0">{page.data.description}</DocsDescription>
      <div className="flex flex-row gap-2 items-center border-b pb-6">
        <MarkdownCopyButton markdownUrl={markdownUrl} />
        <ViewOptionsPopover markdownUrl={markdownUrl} githubUrl={getPageGitHubUrl(page)} />
      </div>
      <DocsBody>
        <Body
          components={getMDXComponents({
            a: createRelativeLink(source, page),
          })}
        />
        {!lessonId && (
          <>
            <p>Lessons are always available. Study in order or choose the topic you need.</p>
            {course.baseline && <p>Baseline: {course.baseline}</p>}
            {course.modules.map((module) => (
              <section key={module.id}>
                <h2>{module.title}</h2>
                <ol>
                  {module.lessons.map((lesson) => (
                    <li key={lesson.id}>
                      <Link href={lessonUrl(course.id, lesson.id)}>{lesson.title}</Link>
                      <p>{lesson.description}</p>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </>
        )}
      </DocsBody>
    </DocsPage>
  );
}
