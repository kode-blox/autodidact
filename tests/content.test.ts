import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDocuments, compileMarkdown } from './helpers/content-compiler';
import { createFromSource } from 'fumadocs-core/search/server';
import { loader } from 'fumadocs-core/source';
import type { StructuredData } from 'fumadocs-core/mdx-plugins/remark-structure';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

function searchFixture(
  course: string,
  lessons: { course: string; id: string; title: string; structuredData: StructuredData }[],
) {
  const source = loader({
    baseUrl: '/courses',
    source: {
      files: lessons.map((lesson) => ({
        type: 'page' as const,
        path: lesson.course + '/' + lesson.id + '.md',
        data: lesson,
      })),
    },
  });
  return createFromSource({ ...source, getPages: () => source.getPages().filter((page) => page.slugs[0] === course) });
}

function fixture(course = 'one') {
  return [
    {
      path: `/content/${course}/course.md`,
      source: `---\nid: ${course}\ntitle: Course\nmodules: ['05']\n---`,
    },
    {
      path: `/content/${course}/modules/gpu/module.md`,
      source: `---\nid: '05'\ncourse: ${course}\ntitle: Module\nlessons: ['05-01', '05-02']\n---`,
    },
    ...['05-01', '05-02'].map((id) => ({
      path: `/content/${course}/modules/gpu/lessons/${id}.md`,
      source: `---\nid: '${id}'\ncourse: ${course}\ntitle: Lesson\n---\n## Heading\nContent.`,
    })),
  ];
}
test('authored IDs are validated before loader deduplication and may repeat across courses', async () => {
  assert.equal((await validateDocuments([...fixture(), ...fixture('two')])).length, 8);
  await assert.rejects(
    () =>
      validateDocuments([
        ...fixture(),
        {
          ...fixture()[2],
          path: '/content/one/modules/gpu/lessons/duplicate.md',
        },
      ]),
    /Duplicate authored ID/,
  );
  const docs = fixture();
  docs[1].source = docs[1].source.replace("id: '05'", 'id: 5');
  await assert.rejects(() => validateDocuments(docs), /expected string/);
});
test('ordered membership rejects missing, orphan, and multiply assigned lessons', async () => {
  const docs = fixture();
  assert.equal((await validateDocuments(docs))[1].data.lessons![0], '05-01');
  await assert.rejects(() => validateDocuments(docs.slice(0, 3)), /missing lessons reference/);
  const orphan = fixture();
  orphan[1].source = orphan[1].source.replace(", '05-02'", '');
  await assert.rejects(() => validateDocuments(orphan), /orphan/);
  const duplicate = fixture();
  duplicate[1].source = duplicate[1].source.replace("'05-02'", "'05-01'");
  await assert.rejects(() => validateDocuments(duplicate), /invalid ordered lessons/);
});
test('links must point at published routes, real anchors, or public assets', async () => {
  for (const url of [
    'javascript:alert',
    '../../../../outside.png',
    'missing.png',
    '05-02.md',
    '/courses/one/missing',
    '/courses/two/05-02',
    '/courses/one/05-02#missing',
    '#missing',
    '#heading#missing',
    '/image.png',
  ]) {
    const docs = fixture();
    docs[2].source += `\n[bad](${url})`;
    await assert.rejects(() => validateDocuments(docs), /unsafe|missing|unsupported relative/);
  }
  const docs = fixture();
  docs[2].source += '\n[other](/courses/one/05-02#heading)\n[here](#heading)\n![asset](/images/example.png)';
  await assert.doesNotReject(() => validateDocuments(docs, [], ['/images/example.png']));
  const code = fixture();
  code[2].source += '\n```md\n[example](05-02.md)\n```';
  await assert.doesNotReject(() => validateDocuments(code));
  const reference = fixture();
  reference[2].source += '\n[other][ref]\n\n[ref]: /courses/one/05-02#missing';
  await assert.rejects(() => validateDocuments(reference), /missing published heading anchor/);
});
test('experiment declarations match flat bundled files and reject nested paths and dot segments', async () => {
  for (const file of ['experiments/nested/example.html', 'experiments/../experiments/example.html']) {
    const docs = fixture();
    docs[0].source = docs[0].source.replace(
      "modules: ['05']",
      `modules: ['05']\nexperiments: [{id: example, title: Example, file: '${file}'}]`,
    );
    await assert.rejects(() => validateDocuments(docs, [`/content/one/${file}`]), /experiments|flat/);
  }
  const docs = fixture();
  docs[0].source = docs[0].source.replace(
    "modules: ['05']",
    "modules: ['05']\nexperiments: [{id: example, title: Example, file: 'experiments/example.html'}]",
  );
  docs[2].source += '\n[experiment](/experiments/one/example)';
  await assert.doesNotReject(() => validateDocuments(docs, ['/content/one/experiments/example.html']));
});
test('Markdown preserves safe details, math, GFM and Mermaid while dropping active HTML', async () => {
  const chart = 'flowchart TD\n  A["Input & output"] --> B["Done"]';
  const compiled = await compileMarkdown(
    '<details open><summary>Hint</summary>Answer</details>\n\n<script>alert(1)</script>\n\n<img src="x" onerror="alert(1)">\n\n[bad](javascript:alert)\n\n$x^2$\n\n| A | B |\n| - | - |\n| a | b |\n\n```ts\nconst answer = 42;\n```\n\n```mermaid\n' +
      chart +
      '\n```',
  );
  const diagrams: string[] = [];
  const code = renderToStaticMarkup(
    createElement(compiled.body, {
      components: {
        Mermaid: ({ chart }: { chart: string }) => {
          diagrams.push(chart);
          return createElement('figure', { 'data-mermaid': true }, chart);
        },
      },
    }),
  );
  assert.match(code, /<details open/);
  assert.match(code, /<summary>Hint/);
  assert.match(code, /katex/);
  assert.match(code, /<table>/);
  assert.match(code, /language-ts/);
  assert.match(code, /<figure data-mermaid="true">/);
  assert.deepEqual(diagrams, [chart]);
  assert.doesNotMatch(code, /<script|onerror|javascript:/);
});

test('native Mermaid components retain their source and order inside nested Markdown and details', async () => {
  const compiled = await compileMarkdown(
    'Before.\n\n> Quote before.\n>\n> ```mermaid\n> flowchart TD\n> Q --> R\n> ```\n>\n> Quote after.\n\n- List before.\n\n  ```mermaid\n  flowchart TD\n  L --> M\n  ```\n\n  List after.\n\n<details open>\n<summary>Hint</summary>\n\n```mermaid\nflowchart TD\nD --> E\n```\n\n</details>\n\nAfter.',
  );
  const diagrams: string[] = [];
  const html = renderToStaticMarkup(
    createElement(compiled.body, {
      components: {
        Mermaid: ({ chart }: { chart: string }) => {
          const index = diagrams.push(chart) - 1;
          return createElement('div', { 'data-diagram': index }, chart);
        },
      },
    }),
  );
  assert.deepEqual(diagrams, ['flowchart TD\nQ --> R', 'flowchart TD\nL --> M', 'flowchart TD\nD --> E']);
  assert.match(
    html,
    /<blockquote>[\s\S]*Quote before\.[\s\S]*data-diagram="0"[\s\S]*Quote after\.[\s\S]*<\/blockquote>/,
  );
  assert.match(html, /<li>[\s\S]*List before\.[\s\S]*data-diagram="1"[\s\S]*List after\.[\s\S]*<\/li>/);
  assert.match(html, /<details open[\s\S]*<summary>Hint<\/summary>[\s\S]*data-diagram="2"[\s\S]*<\/details>/);
  assert.ok(html.indexOf('Before.') < html.indexOf('data-diagram="0"'));
  assert.ok(html.indexOf('data-diagram="2"') < html.indexOf('After.'));
});

test('authored HTML and comments cannot impersonate generated Mermaid components', async () => {
  const compiled = await compileMarkdown(
    '<!--compiler:0-->\n<!--compiler:1-->\n<!--compiler:2-->\n\n<Mermaid chart="forged" />\n\n<Other chart="forged"></Other>\n\n<script>\n\n```mermaid\nflowchart TD\nHidden --> Script\n```\n\n</script>\n\n<img src="x" onerror="alert(1)">\n\n```mermaid\nflowchart TD\nReal --> Diagram\n```',
  );
  const diagrams: string[] = [];
  const unexpected = () => {
    assert.fail('Authored HTML must not invoke an MDX component');
  };
  const html = renderToStaticMarkup(
    createElement(compiled.body, {
      components: {
        Other: unexpected,
        Mermaid: ({ chart }: { chart: string }) => {
          diagrams.push(chart);
          return createElement('figure', null, chart);
        },
      },
    }),
  );
  assert.deepEqual(diagrams, ['flowchart TD\nReal --> Diagram']);
  assert.match(html, /<figure>/);
  assert.doesNotMatch(html, /<!--|<script|onerror|forged|Hidden|compiler:/);
});
test('compiled heading IDs match rendered anchors and search results', async () => {
  const { body, structuredData } = await compileMarkdown(
    'Intro\n\n## Hello `GPU`\nDispatch textures.\n\n## Hello `GPU`\nFences.',
  );
  assert.deepEqual(
    structuredData.headings.map((heading) => heading.id),
    ['hello-gpu', 'hello-gpu-1'],
  );
  const html = renderToStaticMarkup(createElement(body));
  assert.match(html, /id="hello-gpu"/);
  assert.match(html, /id="hello-gpu-1"/);
  const search = searchFixture('one', [{ course: 'one', id: '05-01', title: 'Lesson', structuredData }]);
  assert.ok((await search.search('Fences')).some((result) => result.url === '/courses/one/05-01#hello-gpu-1'));
});
test('native Fumadocs indexes do not mix equal lesson IDs across courses', async () => {
  const one = fixture('one');
  one[2].source += '\nNeutrinos.';
  const two = fixture('two');
  two[2].source += '\nQuasars.';
  const parsed = await validateDocuments([...one, ...two]);
  const lessons = parsed
    .filter((doc) => doc.kind === 'lessons')
    .map((doc) => ({
      course: doc.data.course!,
      id: doc.data.id,
      title: doc.data.title,
      structuredData: doc.structuredData,
    }));
  const first = searchFixture('one', lessons);
  const second = searchFixture('two', lessons);
  assert.ok((await first.search('neutrinos')).some((result) => result.url === '/courses/one/05-01#heading'));
  assert.deepEqual(await first.search('quasars'), []);
  const secondResults = await second.search('quasars');
  assert.ok(secondResults.length > 0);
  assert.ok(secondResults.every((result) => result.url.startsWith('/courses/two/')));
  assert.deepEqual(await second.search('neutrinos'), []);
});

test('relative Markdown links resolve only to published documents in the same course', async () => {
  const docs = fixture();
  docs[3].path = '/content/one/modules/gpu/lessons/renamed-file.md';
  docs[2].source += '\n[renamed](./renamed-file.md#heading)\n[overview](../../../course.md)';
  await assert.doesNotReject(() => validateDocuments(docs));
  docs[2].source += '\n[bad anchor](./renamed-file.md#missing)';
  await assert.rejects(() => validateDocuments(docs), /missing published heading/);
  for (const href of [
    '../module.md',
    './missing.md',
    './renamed-file.md#missing',
    './bad%ZZ.md',
    '../../../../two/course.md',
  ]) {
    const invalid = [...fixture(), ...fixture('two')];
    invalid[2].source += `\n[bad](${href})`;
    await assert.rejects(() => validateDocuments(invalid), /relative|missing/);
  }
});
