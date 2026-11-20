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

import { z } from 'zod';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const identity = {
  icon: z.string().optional(),
  full: z.boolean().optional(),
  id: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z0-9_-]+$/, 'unsafe id'),
  title: z.string().refine((value) => value.trim().length > 0, 'title must be nonempty'),
};

const courseId = z
  .string()
  .min(1)
  .regex(/^[a-zA-Z0-9_-]+$/, 'unsafe course id');

export const courseSchema = z.object({
  ...identity,
  description: z.string().default(''),
  baseline: z.string().optional(),
  modules: z.array(z.string()),
  experiments: z
    .array(
      z.object({
        id: z.string().regex(/^[a-zA-Z0-9_-]+$/),
        title: z.string().min(1),
        file: z.string().regex(/^experiments\/[a-zA-Z0-9_-]+\.html$/, 'Use flat experiments/{filename}.html paths'),
      }),
    )
    .default([]),
});

export const moduleSchema = z.object({
  ...identity,
  course: courseId,
  lessons: z.array(z.string()),
});

export const lessonSchema = z.object({
  ...identity,
  course: courseId,
  description: z.string().default(''),
});

export function publicAssetUrls(root = path.join(process.cwd(), 'public')): string[] {
  const result: string[] = [];

  function collect(directory: string) {
    const stats = lstatSync(directory, { throwIfNoEntry: false });
    if (!stats) {
      return;
    }
    if (stats.isSymbolicLink()) {
      throw new Error(`Public asset symlinks are unsupported: ${directory}`);
    }

    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }
      throw error;
    }
    for (const entry of entries) {
      const full = path.join(directory, entry.name);

      if (entry.isSymbolicLink()) {
        throw new Error(`Public asset symlinks are unsupported: ${full}`);
      }

      if (entry.isDirectory()) {
        collect(full);
      } else if (entry.isFile()) {
        result.push('/' + path.relative(root, full).split(path.sep).map(encodeURIComponent).join('/'));
      }
    }
  }

  collect(root);
  return result;
}

/** Load supporting files from the same source root as the course collection. */
export function courseCollectionSchema(context: { path: string }, publicUrls: string[]) {
  return courseSchema.transform((data) => ({
    ...data,
    publicUrls,
    experiments: data.experiments.map((experiment) => ({
      ...experiment,
      html: experimentHtml(path.resolve(path.dirname(context.path), experiment.file)),
    })),
  }));
}

export function lessonCollectionSchema(publicUrls: string[]) {
  return lessonSchema.transform((data) => ({
    ...data,
    publicUrls,
  }));
}

export function moduleCollectionSchema(publicUrls: string[]) {
  return moduleSchema.transform((data) => ({
    ...data,
    publicUrls,
  }));
}

function experimentHtml(file: string) {
  const stats = lstatSync(file, { throwIfNoEntry: false });
  if (!stats) {
    // Course validation reports a missing experiment.
    return undefined;
  }
  if (stats.isSymbolicLink()) {
    throw new Error(`Experiment symlinks are unsupported: ${file}`);
  }

  try {
    return readFileSync(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }

    throw error;
  }
}
