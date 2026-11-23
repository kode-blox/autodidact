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
import type { Metadata } from 'next';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { getMDXComponents } from '@/components/mdx';
import { getPageMetadata } from '@/lib/metadata';
import { getPageGitHubUrl, getPageMarkdownUrl, lessonUrl } from '@/lib/shared';
import { getRenderPublication } from '@/lib/content/publication';
import CourseOverview from '@/components/course-overview';
import ReaderTools, { OverviewLessonLink } from '@/components/reader-tools';

async function getCoursePage({ params }: PageProps<'/courses/[course]/[[...slug]]'>) {
  const { course: courseId, slug = [] } = await params;

  if (slug.length > 1) {
    notFound();
  }

  const publication = await getRenderPublication();
  const { source } = publication;
  const course = publication.getCourse(courseId);
  const [lessonId] = slug;

  if (!course || (lessonId && !course.lessons.some((lesson) => lesson.id === lessonId))) {
    notFound();
  }

  const page = source.getPage([course.id, ...slug]);

  if (!page) {
    notFound();
  }

  return { publication, course, lessonId, page };
}

export async function generateMetadata(props: PageProps<'/courses/[course]/[[...slug]]'>): Promise<Metadata> {
  const { page } = await getCoursePage(props);
  return getPageMetadata(page);
}

export default async function Page(props: PageProps<'/courses/[course]/[[...slug]]'>) {
  const { publication, course, lessonId, page } = await getCoursePage(props);
  const markdownUrl = getPageMarkdownUrl(page).url;
  const Body = page.data.body;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full} footer={lessonId ? undefined : { enabled: false }}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription className="mb-0">{page.data.description}</DocsDescription>
      <div className="flex flex-row gap-2 items-center border-b pb-6">
        <MarkdownCopyButton markdownUrl={markdownUrl} />
        <ViewOptionsPopover
          markdownUrl={markdownUrl}
          githubUrl={process.env.NODE_ENV === 'development' ? getPageGitHubUrl(page) : undefined}
        />
      </div>
      {lessonId ? (
        <ReaderTools
          key={course.id + '/' + lessonId}
          courseId={course.id}
          lessonId={lessonId}
          lessonIds={course.lessons.map((lesson) => lesson.id)}
          headingIds={page.data.structuredData.headings.map((heading) => heading.id)}
          experiments={course.experiments.map((experiment) => ({
            id: experiment.id,
            title: experiment.title,
          }))}
        />
      ) : (
        <CourseOverview courseId={course.id} publishedLessonIds={course.lessons.map((lesson) => lesson.id)} />
      )}
      <DocsBody
        data-lesson-prose={lessonId ? true : undefined}
        className={lessonId ? 'text-[1.08rem] leading-[1.8] wrap-anywhere [&_:is(h2,h3,h4)]:scroll-mt-24' : undefined}
      >
        <Body
          components={getMDXComponents({
            a: createRelativeLink(publication.source, page),
          })}
        />
        {!lessonId && (
          <>
            <p>Lessons are always available. Study in order or choose the topic you need.</p>
            {course.baseline && <p className="text-[0.85rem] text-fd-muted-foreground">Baseline: {course.baseline}</p>}
            {course.modules.map((module) => (
              <section key={module.id}>
                <h2>{module.title}</h2>
                <ol>
                  {module.lessons.map((lesson) => (
                    <li key={lesson.id}>
                      <OverviewLessonLink href={lessonUrl(course.id, lesson.id)}>{lesson.title}</OverviewLessonLink>
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
