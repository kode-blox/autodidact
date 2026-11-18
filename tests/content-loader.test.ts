import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { compileMarkdown, validateDocuments } from '@/tests/helpers/content-compiler';
import { courseCollectionSchema, publicAssetUrls } from '@/lib/content/schemas';
import { validateCompiledDocuments } from '@/lib/content/validation';

function fixture(directory = '/content/one') {
  return [
    {
      path: `${directory}/course.md`,
      source: '---\nid: one\ntitle: Course\nmodules: [first]\n---',
    },
    {
      path: `${directory}/module.md`,
      source: '---\nid: first\ncourse: one\ntitle: Module\nlessons: [intro]\n---',
    },
    {
      path: `${directory}/lessons/intro.md`,
      source: '---\nid: intro\ncourse: one\ntitle: Lesson\n---\n## Heading\nText',
    },
  ];
}

test('a complete validated batch preserves authored identity when source folders move', async () => {
  const before = await validateDocuments(fixture());
  const moved = await validateDocuments(fixture('/content/renamed'));
  assert.deepEqual(
    moved.map((doc) => [doc.kind, doc.data, doc.structuredData.headings]),
    before.map((doc) => [doc.kind, doc.data, doc.structuredData.headings]),
  );
  assert.notDeepEqual(
    moved.map((doc) => doc.path),
    before.map((doc) => doc.path),
  );
  const published = JSON.stringify(before.map((doc) => [doc.data, doc.structuredData.headings]));
  const invalid = fixture();
  invalid[2].source += '\n[broken](#missing)';
  await assert.rejects(() => validateDocuments(invalid), /missing published heading/);
  assert.equal(JSON.stringify(before.map((doc) => [doc.data, doc.structuredData.headings])), published);
  for (const id of [' one ', '../one']) {
    const unsafe = fixture();
    unsafe[0].source = unsafe[0].source.replace('id: one', `id: '${id}'`);
    await assert.rejects(() => validateDocuments(unsafe), /unsafe id/);
  }
});

test('Fumadocs compilation tracks declared experiments and referenced public files, including missing files', async () => {
  const dependencies: string[] = [];
  await compileMarkdown(
    '[asset](/images/published.svg)\n\n<img src="/images/raw.svg">\n\n[lesson](/courses/one/intro)',
    {
      path: '/content/one/course.md',
      metadata: { experiments: [{ file: 'experiments/example.html' }] },
      addDependency: (file) => dependencies.push(file),
    },
  );
  assert.deepEqual(
    new Set(dependencies),
    new Set([
      path.resolve('/content/one/experiments/example.html'),
      path.resolve(process.cwd(), 'public/images/published.svg'),
      path.resolve(process.cwd(), 'public/images/raw.svg'),
    ]),
  );
});

test('experiment bytes are compiled into metadata and public asset removal cannot use stale course metadata', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'autodidact-content-'));
  try {
    await mkdir(path.join(root, 'experiments'));
    await mkdir(path.join(root, 'public'));
    const experiment = path.join(root, 'experiments/example.html');
    const asset = path.join(root, 'public/image.svg');
    await writeFile(experiment, '<p>First experiment</p>');
    await writeFile(asset, '<svg/>');
    const context = {
      path: path.join(root, 'course.md'),
      source: 'Course source',
    };
    const data = {
      id: 'one',
      title: 'Course',
      modules: ['first'],
      experiments: [{ id: 'example', title: 'Example', file: 'experiments/example.html' }],
    };
    const first = courseCollectionSchema(context).parse(data);
    assert.equal(first.experiments[0].html, '<p>First experiment</p>');
    await writeFile(experiment, '<p>Updated experiment</p>');
    assert.equal(courseCollectionSchema(context).parse(data).experiments[0].html, '<p>Updated experiment</p>');
    await rename(asset, path.join(root, 'public/renamed.svg'));
    assert.deepEqual(publicAssetUrls(path.join(root, 'public')), ['/renamed.svg']);
    const documents = await validateDocuments(fixture());
    documents[0].data.publicUrls = ['/image.svg'];
    documents[2].data.publicUrls = [];
    documents[2].links = ['/image.svg'];
    assert.throws(() => validateCompiledDocuments(documents), /unsafe link/);
    await rm(experiment);
    const missing = courseCollectionSchema(context).parse(data);
    assert.equal(missing.experiments[0].html, undefined);
    documents[0].data.experiments = missing.experiments;
    assert.throws(() => validateCompiledDocuments(documents), /missing or unsafe experiment/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
