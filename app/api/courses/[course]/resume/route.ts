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

import { getCourse } from '@/lib/content/catalog';
import { source } from '@/lib/source';
import { checkMutation, errorResponse, json, readJson } from '@/server/http';
import { stateStore } from '@/server/state/store';
import * as validate from '@/server/state/validation';

export async function PUT(request: Request, { params }: RouteContext<'/api/courses/[course]/resume'>) {
  const { course: courseId } = await params;

  try {
    checkMutation(request);
    const course = getCourse(courseId);

    if (!course) {
      return json({ error: 'Course not found.' }, 404);
    }

    const body = validate.object(await readJson(request));
    const expected = validate.version(body.expectedVersion);
    const value = validate.resume(body.value);

    if (!course.lessons.some((lesson) => lesson.id === value.lessonId)) {
      return json({ error: 'Lesson not found.' }, 404);
    }

    const page = source.getPage([courseId, value.lessonId]);

    if (!page) {
      return json({ error: 'Lesson not found.' }, 404);
    }

    const { heading } = value;
    const { headings, contents } = page.data.structuredData;

    if (heading !== null && !headings.some(({ id }) => id === heading)) {
      // Earlier clients can use an empty heading for a lesson's introduction.
      const hasIntro =
        heading === '' &&
        contents
          .filter((entry) => !entry.heading)
          .map((entry) => entry.content)
          .join('\n').length > 0;
      if (!hasIntro) {
        return json({ error: 'Heading not found in lesson.' }, 400);
      }
    }

    return json(await stateStore.write(courseId, '', 'resume', expected, value, null));
  } catch (error) {
    return errorResponse(error);
  }
}
