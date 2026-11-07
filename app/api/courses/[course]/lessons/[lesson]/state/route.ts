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
import { checkMutation, errorResponse, HttpError, json, readJson } from '@/server/http';
import { stateStore } from '@/server/state/store';
import * as validate from '@/server/state/validation';

function requireLesson(courseId: string, lessonId: string) {
  const course = getCourse(courseId);

  if (!course) {
    throw new HttpError(404, 'Course not found.');
  }

  if (!course.lessons.some((lesson) => lesson.id === lessonId)) {
    throw new HttpError(404, 'Lesson not found.');
  }
}

export async function GET(_request: Request, { params }: RouteContext<'/api/courses/[course]/lessons/[lesson]/state'>) {
  const { course: courseId, lesson: lessonId } = await params;

  try {
    requireLesson(courseId, lessonId);
    const [completion, note, resume] = await Promise.all([
      stateStore.read(courseId, lessonId, 'completion', { completed: false }),
      stateStore.read(courseId, lessonId, 'note', { text: '' }),
      stateStore.read(courseId, '', 'resume', null),
    ]);

    return json({ completion, note, resume });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request, { params }: RouteContext<'/api/courses/[course]/lessons/[lesson]/state'>) {
  const { course: courseId, lesson: lessonId } = await params;

  try {
    checkMutation(request);
    requireLesson(courseId, lessonId);
    const body = validate.object(await readJson(request));
    const expected = validate.version(body.expectedVersion);

    if (body.kind === 'completion') {
      return json(
        await stateStore.write(courseId, lessonId, 'completion', expected, validate.completion(body.value), {
          completed: false,
        }),
      );
    }

    if (body.kind === 'note') {
      return json(
        await stateStore.write(courseId, lessonId, 'note', expected, validate.note(body.value), { text: '' }),
      );
    }

    return json({ error: 'kind must be completion or note.' }, 400);
  } catch (error) {
    return errorResponse(error);
  }
}
