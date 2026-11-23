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

import Link from 'next/link';
import { getRenderPublication } from '@/lib/content/publication';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const { catalog: courses, externalEnabled } = await getRenderPublication();
  return (
    <div className="m-auto w-full max-w-[900px] px-6 py-16">
      <p className="text-[0.8rem] tracking-[0.12em] text-fd-muted-foreground uppercase">Your learning library</p>
      <h1 className="mt-4 mb-8 text-[clamp(2.5rem,5vw,4rem)] leading-[1.15]">Make room for understanding.</h1>
      <p className="text-[1.2rem] leading-[1.7] text-fd-muted-foreground">
        Choose a course. Read at your own pace, keep notes, and return to where you left off.
      </p>
      <div>
        {courses.length === 0 && (
          <p className="mt-8 text-fd-muted-foreground">
            {externalEnabled
              ? 'No courses are available. Check the configured course checkout.'
              : 'Your library is empty. Add courses to the configured library folder and restart AutoDidact.'}
          </p>
        )}
        {courses.map((course) => (
          <Link
            className="mt-8 block border-y border-fd-border py-8"
            key={course.id}
            href={'/courses/' + encodeURIComponent(course.id)}
          >
            <h2 className="mb-3 text-[1.5rem]">{course.title}</h2>
            <p className="my-3 text-fd-muted-foreground">{course.description}</p>
            <span>{course.lessons.length} lessons · Open course →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
