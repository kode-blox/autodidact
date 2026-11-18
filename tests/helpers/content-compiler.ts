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

import { frontmatter } from 'fumadocs-core/content/md/frontmatter';
import { compile, run } from '@mdx-js/mdx';
import { applyMdxPreset } from 'fumadocs-mdx/config';
import * as runtime from 'react/jsx-runtime';
import type { MDXContent } from 'mdx/types';
import type { StructuredData } from 'fumadocs-core/mdx-plugins/remark-structure';
import type { TOCItemType } from 'fumadocs-core/toc';
import { markdownOptions } from '@/lib/content/markdown';
import { courseSchema, moduleSchema, lessonSchema } from '@/lib/content/schemas';
import { validateCompiledDocuments, type CompiledDocument } from '@/lib/content/validation';

export interface AuthoredDocument {
  path: string;
  source: string;
}
interface CompiledMarkdown {
  body: MDXContent;
  toc: TOCItemType[];
  structuredData: StructuredData;
  links: string[];
}

/** Standalone authoring validation uses the same Fumadocs preset as the bundler. */
export async function compileMarkdown(
  body: string,
  context?: {
    path?: string;
    metadata?: Record<string, unknown>;
    addDependency?: (path: string) => void;
  },
): Promise<CompiledMarkdown> {
  const options = await applyMdxPreset(markdownOptions)('runtime');
  const result = await compile(
    {
      value: body,
      path: context?.path ?? 'lesson.md',
      data: {
        frontmatter: context?.metadata ?? {},
        ...(context?.addDependency ? { _compiler: { addDependency: context.addDependency } } : {}),
      },
    },
    { ...options, format: 'md' },
  );
  const compiledModule = await run(String(result), {
    ...runtime,
    baseUrl: import.meta.url,
  });
  return {
    body: compiledModule.default,
    toc: compiledModule.toc as TOCItemType[],
    structuredData: compiledModule.structuredData as StructuredData,
    links: (result.data.authoredLinks as string[]) ?? [],
  };
}

export async function validateDocuments(
  documents: AuthoredDocument[],
  assetPaths: string[] = [],
  publicUrls: string[] = [],
): Promise<CompiledDocument[]> {
  const parsed = documents.map((doc) => {
    const parsed = frontmatter(doc.source);
    const normalized = doc.path.replaceAll('\\', '/');
    const kind = normalized.endsWith('/course.md')
      ? 'courses'
      : normalized.endsWith('/module.md')
        ? 'modules'
        : 'lessons';
    const schema = kind === 'courses' ? courseSchema : kind === 'modules' ? moduleSchema : lessonSchema;
    return {
      ...doc,
      kind,
      data: schema.parse(parsed.data),
      text: parsed.content,
    };
  });
  const compiled = await Promise.all(
    parsed.map(async (doc) => ({
      path: doc.path,
      kind: doc.kind as CompiledDocument['kind'],
      data: doc.data,
      ...(await compileMarkdown(doc.text)),
    })),
  );
  return validateCompiledDocuments(compiled, assetPaths, publicUrls);
}
