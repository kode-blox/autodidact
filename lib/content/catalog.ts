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

import type { CourseCollections } from '@/lib/content/runtime';
import { validateCompiledDocuments, type CompiledDocument } from '@/lib/content/validation';

export interface Experiment {
  id: string;
  title: string;
  html: string;
}

export interface LessonCatalog {
  id: string;
  courseId: string;
  title: string;
  description: string;
}

export interface ModuleCatalog {
  id: string;
  title: string;
  lessons: LessonCatalog[];
}

export interface CourseCatalog {
  id: string;
  title: string;
  description: string;
  baseline?: string;
  modules: ModuleCatalog[];
  lessons: LessonCatalog[];
  experiments: Experiment[];
}

export function getCompiledDocuments({ courseDocuments, moduleDocuments, lessonDocuments }: CourseCollections) {
  return [
    ...courseDocuments.entries.map((entry) => ({
      kind: 'courses' as const,
      entry,
    })),
    ...moduleDocuments.entries.map((entry) => ({
      kind: 'modules' as const,
      entry,
    })),
    ...lessonDocuments.entries.map((entry) => ({
      kind: 'lessons' as const,
      entry,
    })),
  ].map(({ kind, entry }) => ({
    kind,
    path: entry.info.fullPath,
    data: entry,
    structuredData: entry.structuredData,
    links: Array.isArray(entry._exports.authoredLinks) ? (entry._exports.authoredLinks as string[]) : [],
  })) satisfies CompiledDocument[];
}

export function createCourseCatalog(documents: CompiledDocument[]): CourseCatalog[] {
  validateCompiledDocuments(documents);
  return documents
    .filter((doc) => doc.kind === 'courses')
    .map((course) => {
      const modules = course.data.modules!.map((moduleId) => {
        const authoredModule = documents.find(
          (doc) => doc.kind === 'modules' && doc.data.course === course.data.id && doc.data.id === moduleId,
        )!;
        const lessons = authoredModule.data.lessons!.map((lessonId) => {
          const lesson = documents.find(
            (doc) => doc.kind === 'lessons' && doc.data.course === course.data.id && doc.data.id === lessonId,
          )!;

          return {
            id: lesson.data.id,
            courseId: course.data.id,
            title: lesson.data.title,
            description: lesson.data.description ?? '',
          } satisfies LessonCatalog;
        });

        return { id: moduleId, title: authoredModule.data.title, lessons };
      });
      const lessons = modules.flatMap((module) => module.lessons);

      return {
        id: course.data.id,
        title: course.data.title,
        description: course.data.description ?? '',
        baseline: course.data.baseline,
        modules,
        lessons,
        experiments: (course.data.experiments ?? []).map((experiment) => ({
          id: experiment.id,
          title: experiment.title,
          html: experiment.html!,
        })),
      };
    });
}
