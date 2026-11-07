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

import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { fromHtml } from 'hast-util-from-html';
import { visit } from 'unist-util-visit';
import type { Root as MarkdownRoot } from 'mdast';
import type { Root as HtmlRoot } from 'hast';
import type { MDXPresetOptions } from 'fumadocs-mdx/config';
import path from 'node:path';

/** Capture authored URLs before sanitization can remove unsafe or broken links. */
function authoredLinks() {
  return (tree: MarkdownRoot, file: { path?: string; data: Record<string, unknown> }) => {
    const links: string[] = [];

    visit(tree, (node) => {
      if (node.type === 'link' || node.type === 'image' || node.type === 'definition') {
        links.push(node.url);
      }

      if (node.type === 'html') {
        visit(fromHtml(node.value, { fragment: true }), 'element', (element) => {
          for (const key of ['href', 'src']) {
            const value = element.properties[key];

            if (typeof value === 'string') {
              links.push(value);
            }
          }
        });
      }
    });

    file.data.authoredLinks = links;
    // Fumadocs exposes the bundler dependency hook to plugins (also used by
    // remarkInclude). Register even missing files so fixing them recovers dev.
    const compiler = file.data._compiler as { addDependency(path: string): void } | undefined;

    if (compiler) {
      const metadata = file.data.frontmatter as { experiments?: { file: string }[] } | undefined;

      for (const experiment of metadata?.experiments ?? []) {
        compiler.addDependency(path.resolve(path.dirname(file.path!), experiment.file));
      }

      for (const link of links) {
        const route = link.split('#', 1)[0];

        if (
          route.startsWith('/') &&
          !route.startsWith('//') &&
          !route.startsWith('/courses/') &&
          !route.startsWith('/experiments/')
        ) {
          let decoded: string;

          try {
            decoded = decodeURIComponent(route);
          } catch {
            continue;
          } // The publication validator reports malformed URLs.
          const root = path.resolve(process.cwd(), 'public');
          const target = path.resolve(root, '.' + decoded);

          if (!path.relative(root, target).startsWith('..' + path.sep)) {
            compiler.addDependency(target);
          }
        }
      }
    }
  };
}

/** Compiler exports are trusted; authored Markdown cannot introduce ESM nodes. */
function sanitizeAuthoredHtml() {
  const sanitize = rehypeSanitize({
    ...defaultSchema,
    clobberPrefix: '',
    tagNames: [...defaultSchema.tagNames!, 'details', 'summary'],
    attributes: {
      ...defaultSchema.attributes,
      details: ['open'],
      code: [...(defaultSchema.attributes?.code ?? []), ['className', /^language-./, 'math-inline', 'math-display']],
    },
  });

  return (tree: HtmlRoot) => {
    // Fumadocs exports its heading/structured data as non-HAST compiler nodes.
    // Keep those outside the authored HTML policy rather than stripping them.
    const compilerNodes = tree.children.filter((node) => {
      return (node as { type: string }).type === 'mdxjsEsm';
    });

    const authored = {
      ...tree,
      children: tree.children.filter((node) => {
        return (node as { type: string }).type !== 'mdxjsEsm';
      }),
    };

    const safe = sanitize(authored) as HtmlRoot;
    tree.children = [...compilerNodes, ...safe.children];
  };
}

/** Extend the Fumadocs preset; its GFM, heading, TOC and code plugins stay enabled. */
export const markdownOptions: MDXPresetOptions = {
  remarkImageOptions: { useImport: false, external: false, onError: 'ignore' },
  remarkPlugins: [remarkMath, authoredLinks],

  rehypeCodeOptions: {
    themes: { light: 'github-light', dark: 'github-dark' },
    addLanguageClass: true,
  },

  // Process and sanitize authored HTML before trusted KaTeX/Shiki markup.
  rehypePlugins: (defaults) => [
    [rehypeRaw, { passThrough: ['mdxjsEsm'] }],
    sanitizeAuthoredHtml,
    rehypeKatex,
    ...defaults,
  ],
};
