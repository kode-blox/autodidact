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
import { errorResponse, HttpError, json } from '@/server/http';
import { stateStore } from '@/server/state/store';

export async function GET(_request: Request, { params }: RouteContext<'/api/courses/[course]/state'>) {
  const { course: courseId } = await params;

  try {
    const course = getCourse(courseId);
    if (!course) {
      throw new HttpError(404, 'Course not found.');
    }

    const entries = await Promise.all(
      course.lessons.map(async (lesson) => {
        return [lesson.id, await stateStore.read(courseId, lesson.id, 'completion', { completed: false })] as const;
      }),
    );

    return json({
      completions: Object.fromEntries(entries),
      resume: await stateStore.read(courseId, '', 'resume', null),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
