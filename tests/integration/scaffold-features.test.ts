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
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const nextCli = fileURLToPath(import.meta.resolve('next/dist/bin/next'));

test(
  'bundled walkthrough retains navigation, search, Markdown exports, controls, and Open Graph images',
  { timeout: 60_000 },
  async () => {
    // Next.js uses localhost as its canonical loopback hostname for rewrites.
    const bindHostname = 'localhost';
    const port = '4343';
    const origin = `http://localhost:${port}`;
    const child = spawn(process.execPath, [nextCli, 'start', '--hostname', bindHostname], {
      env: {
        ...process.env,
        HOSTNAME: bindHostname,
        PORT: port,
        AUTODIDACT_METRICS_PORT: '4344',
        AUTODIDACT_PUBLIC_URL: 'https://reader.example.test',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let output = '';
    child.stdout?.on('data', (chunk) => {
      output += String(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      output += String(chunk);
    });
    try {
      let ready = false;
      for (let i = 0; i < 200; i++) {
        if (child.exitCode !== null) throw new Error(output);
        try {
          if ((await fetch(origin + '/llms.txt')).status === 200) {
            ready = true;
            break;
          }
        } catch {
          /* Starting. */
        }
        await delay(100);
      }
      assert.ok(ready, output);
      const homeResponse = await fetch(origin);
      assert.equal(homeResponse.status, 200);
      const home = await homeResponse.text();
      assert.deepEqual(
        [...home.matchAll(/<a\b[^>]*\bhref="(\/courses\/[^"/]+)"/g)].map((match) => match[1]),
        ['/courses/getting-started'],
      );
      assert.match(home, /Getting Started with AutoDidact/);
      const indexResponse = await fetch(origin + '/llms.txt');
      assert.match(indexResponse.headers.get('content-type')!, /text\/plain/);
      const index = await indexResponse.text();
      assert.match(index, /\/courses\/getting-started\/navigate-and-search/);
      assert.ok(
        index.indexOf('/courses/getting-started/navigate-and-search') <
          index.indexOf('/courses/getting-started/track-your-progress'),
      );
      const full = await (await fetch(origin + '/llms-full.txt')).text();
      assert.match(full, /Getting Started with AutoDidact/);
      const navigationLesson = full.indexOf('# Navigate and search');
      const progressLesson = full.indexOf('# Track your progress');
      assert.ok(navigationLesson >= 0 && progressLesson > navigationLesson, 'Expected lessons in authored order');
      assert.doesNotMatch(full, /"note":\s*\{|"resume":\s*\{/);
      const searchResponse = await fetch(origin + '/api/courses/getting-started/search?query=resume%20reading');
      assert.equal(searchResponse.status, 200);
      const searchResults = (await searchResponse.json()) as { url: string }[];
      assert.ok(
        searchResults.some((result) => result.url === '/courses/getting-started/track-your-progress#resume-reading'),
        'Expected a searchable lesson heading',
      );
      assert.ok(searchResults.every((result) => result.url.startsWith('/courses/getting-started/')));
      const favicon = await fetch(origin + '/favicon.svg');
      assert.equal(favicon.status, 200);
      assert.match(favicon.headers.get('content-type') ?? '', /image\/svg\+xml/);
      await favicon.arrayBuffer();
      for (const suffix of ['getting-started', 'getting-started/navigate-and-search']) {
        const documentUrl = origin + '/courses/' + suffix;
        const htmlResponse = await fetch(documentUrl, { headers: { Accept: 'text/html' } });
        assert.equal(htmlResponse.status, 200);
        assert.match(htmlResponse.headers.get('content-type')!, /text\/html/);
        const html = await htmlResponse.text();
        assert.match(html, /Using the reader/);
        assert.ok(html.includes('href="/courses/getting-started/navigate-and-search"'));
        assert.ok(html.includes('href="/courses/getting-started/track-your-progress"'));
        if (suffix === 'getting-started') {
          assert.ok(html.indexOf('>Navigate and search</a>') < html.indexOf('>Track your progress</a>'));
        }
        assert.match(html, /Copy Markdown/);
        assert.match(html, /property="og:image"/);
        assert.ok(html.includes(`content="https://reader.example.test/og/courses/${suffix}/image.png"`));
        assert.match(html, new RegExp('/og/courses/' + suffix + '/image\\.png'));
        const scriptPath = html.match(/<script\b[^>]*\bsrc="(\/_next\/static\/[^" ]+)"/)?.[1];
        assert.ok(scriptPath, 'Expected a Next.js script in the rendered HTML');
        const script = await fetch(origin + scriptPath);
        assert.equal(script.status, 200, scriptPath);
        assert.match(script.headers.get('content-type') ?? '', /javascript/);
        await script.arrayBuffer();
        const direct = await fetch(origin + '/llms.mdx/courses/' + suffix + '/content.md');
        assert.equal(direct.status, 200);
        assert.match(direct.headers.get('content-type')!, /text\/markdown/);
        const markdown = await direct.text();
        assert.match(markdown, /^# /);
        const negotiated = await fetch(documentUrl, { headers: { Accept: 'text/markdown' } });
        assert.equal(negotiated.status, 200);
        assert.match(negotiated.headers.get('vary') ?? '', /(?:^|,)\s*accept\s*(?:,|$)/i);
        assert.equal(await negotiated.text(), markdown);
        assert.equal(await (await fetch(documentUrl + '.md')).text(), markdown);
        const image = await fetch(origin + '/og/courses/' + suffix + '/image.png');
        assert.equal(image.status, 200);
        assert.match(image.headers.get('content-type')!, /image\/png/);
        assert.deepEqual(
          new Uint8Array(await image.arrayBuffer()).slice(0, 8),
          new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
        );
      }
      for (const route of [
        '/courses/missing',
        '/courses/ue584',
        '/courses/rust',
        '/experiments/ue584/compute-dispatch',
        '/courses/getting-started/missing',
        '/courses/getting-started/navigate-and-search/extra',
        '/courses/getting-started/missing.md',
        '/courses/missing.md',
        '/llms.mdx/courses/getting-started/navigate-and-search/wrong.md',
        '/og/courses/getting-started/missing/image.png',
      ]) {
        assert.equal((await fetch(origin + route)).status, 404, route);
      }
    } finally {
      if (child.exitCode === null)
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
          timer.unref();
          child.once('exit', () => {
            clearTimeout(timer);
            resolve();
          });
          child.kill();
        });
    }
  },
);
