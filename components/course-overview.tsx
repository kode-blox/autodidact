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

"use client";

import { useEffect, useState } from "react";
import type { CourseState } from "../lib/learner-types";
import { OverviewLessonLink } from "./reader-tools";

interface Props {
  courseId: string;
  publishedLessonIds: string[];
}

export default function CourseOverview({ courseId, publishedLessonIds }: Props) {
  const [result, setResult] = useState<{ courseId: string; state: CourseState | null }>();

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/courses/${encodeURIComponent(courseId)}/state`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const state = response.ok ? ((await response.json()) as CourseState) : null;

        if (!controller.signal.aborted) {
          setResult({ courseId, state });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setResult({ courseId, state: null });
        }
      });

    return () => controller.abort();
  }, [courseId]);

  const state = result?.courseId === courseId ? result.state : undefined;
  const resume = state?.resume.value;
  const resumeIsPublished = resume && publishedLessonIds.includes(resume.lessonId);

  return (
    <div className="mt-4 mb-8">
      {state === null && (
        <p role="status" className="text-[0.85rem] text-fd-muted-foreground">
          Saved progress is unavailable. You can still open a lesson below.
        </p>
      )}
      {state && (
        <p className="text-[0.85rem] text-fd-muted-foreground">
          {Object.values(state.completions).filter((r) => r.value.completed).length} lessons completed
        </p>
      )}
      {resumeIsPublished && (
        <OverviewLessonLink
          className="inline-block rounded-[0.4rem] bg-fd-primary px-4 py-[0.7rem] text-fd-primary-foreground"
          href={`/courses/${encodeURIComponent(courseId)}/${encodeURIComponent(resume.lessonId)}${resume.heading ? "#" + encodeURIComponent(resume.heading) : ""}`}
        >
          Continue reading →
        </OverviewLessonLink>
      )}
      {resume && !resumeIsPublished && (
        <p className="text-[0.85rem] text-fd-muted-foreground">
          Your last reading position is in a lesson that is no longer available. Choose a published lesson below.
        </p>
      )}
    </div>
  );
}
