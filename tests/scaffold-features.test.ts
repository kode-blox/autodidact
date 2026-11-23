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

import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import { loader, type Source } from 'fumadocs-core/source';
import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import proxy from '@/proxy';
import { getPageGitHubUrl, getPageImageUrl, getPageMarkdownUrl } from '@/lib/shared';
import { lessonSchema } from '@/lib/content/schemas';
import { metadataOrigin } from '@/lib/metadata';

test('Markdown negotiation keeps HTML and Markdown cache representations distinct', () => {
  const url = 'http://localhost/courses/one/intro';
  const html = proxy(new NextRequest(url, { headers: { Accept: 'text/html' } }));
  assert.equal(html.headers.get('x-middleware-rewrite'), null);
  const markdown = proxy(new NextRequest(url, { headers: { Accept: 'text/markdown' } }));
  assert.equal(markdown.headers.get('x-middleware-rewrite'), 'http://localhost/llms.mdx/courses/one/intro/content.md');
  assert.equal(markdown.headers.get('vary'), 'Accept');
  const suffix = proxy(new NextRequest(url + '.md'));
  assert.equal(suffix.headers.get('x-middleware-rewrite'), markdown.headers.get('x-middleware-rewrite'));
  const overview = proxy(new NextRequest('http://localhost/courses/one.md'));
  assert.equal(overview.headers.get('x-middleware-rewrite'), 'http://localhost/llms.mdx/courses/one/content.md');
  const api = proxy(
    new NextRequest('http://localhost/api/courses/one/state', { headers: { Accept: 'text/markdown' } }),
  );
  assert.equal(api.headers.get('x-middleware-rewrite'), null);
});

test('public image/Markdown URLs use IDs while GitHub links follow authored paths', () => {
  const page = { slugs: ['one', 'permanent-id'], path: 'source folder/lessons/renamed.md' };
  assert.equal(getPageMarkdownUrl(page).url, '/llms.mdx/courses/one/permanent-id/content.md');
  assert.equal(getPageImageUrl(page).url, '/og/courses/one/permanent-id/image.png');
  assert.equal(
    getPageGitHubUrl(page),
    'https://github.com/kode-blox/autodidact/blob/main/content/courses/source%20folder/lessons/renamed.md',
  );
});

test('the external asset route rejects malformed URL escapes before matching filenames', (context) => {
  const original = process.env.AUTODIDACT_EXTERNAL_COURSES_DIR;
  context.after(() => {
    if (original === undefined) delete process.env.AUTODIDACT_EXTERNAL_COURSES_DIR;
    else process.env.AUTODIDACT_EXTERNAL_COURSES_DIR = original;
  });
  process.env.AUTODIDACT_EXTERNAL_COURSES_DIR = '/fixtures/current/courses';

  assert.equal(proxy(new NextRequest('http://localhost/course-assets/notes%zz.txt')).status, 400);
  const valid = proxy(new NextRequest('http://localhost/course-assets/notes%20100%25.txt'));
  assert.equal(valid.headers.get('x-middleware-next'), '1');
});

test('native relative links and authored icons survive permanent-ID slugs', () => {
  const data = lessonSchema.parse({
    id: 'permanent-id',
    course: 'one',
    title: 'Renamed',
    icon: 'BookOpen',
    full: true,
  });
  assert.equal(data.full, true);
  const fixtureSource: Source<{
    pageData: { id: string; course: string; title: string; icon?: string };
    metaData: Record<string, never>;
  }> = {
    files: [
      { type: 'page', path: 'one/lessons/intro.md', data: { id: 'intro', course: 'one', title: 'Intro' } },
      { type: 'page', path: 'one/lessons/renamed.md', data },
    ],
  };
  const source = loader({
    baseUrl: '/courses',
    source: fixtureSource,
    slugs: (file) => [file.data.course, file.data.id],
    plugins: [lucideIconsPlugin()],
  });
  const page = source.getPage(['one', 'intro'])!;
  const RelativeLink = createRelativeLink(source, page, (props) => createElement('a', props));
  const html = renderToStaticMarkup(createElement(RelativeLink, { href: './renamed.md#heading' }, 'Next'));
  assert.match(html, /href="\/courses\/one\/permanent-id#heading"/);
  const nodes = source.getPageTree().children;
  function renderedIcons(items: typeof nodes): string {
    return items
      .map((node) =>
        node.type === 'folder'
          ? (node.index?.icon ? renderToStaticMarkup(node.index.icon) : '') + renderedIcons(node.children)
          : node.icon
            ? renderToStaticMarkup(node.icon)
            : '',
      )
      .join('');
  }
  assert.match(renderedIcons(nodes), /lucide-book-open/);
});

test('Open Graph origin follows runtime configuration or the current proxy request', () => {
  const request = new Headers({
    host: 'internal:8080',
    'x-forwarded-host': 'reader.example.test, gateway',
    'x-forwarded-proto': 'https, http',
  });
  assert.equal(metadataOrigin(request, 'https://configured.example.test').origin, 'https://configured.example.test');
  assert.equal(metadataOrigin(request, '').origin, 'https://reader.example.test');
  assert.equal(metadataOrigin(new Headers({ host: '127.0.0.1:4343' }), '').origin, 'http://127.0.0.1:4343');
});
