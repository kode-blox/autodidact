import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createFromSource } from 'fumadocs-core/search/server';
import { createCourseLibrary, type CoursePublication } from '@/lib/content/library';
import { createDocsLlms, getPublicationTree } from '@/lib/content/publication';

const assetName = 'notes 100% λ.txt';
const assetUrl = '/course-assets/unreal-engine/' + encodeURIComponent(assetName);

async function course(root: string, id: string, revision: string, external = false) {
  const directory = path.join(root, external ? 'courses' : 'content/courses', id);
  await mkdir(path.join(directory, 'modules', 'gpu', 'lessons'), { recursive: true });
  await writeFile(
    path.join(directory, 'course.md'),
    `---\nid: ${id}\ntitle: Course ${revision}\nmodules: ['05']\nexperiments:\n  - id: compute-dispatch\n    title: Compute dispatch\n    file: experiments/compute-dispatch.html\n---\nCourse ${revision}.`,
  );
  await writeFile(
    path.join(directory, 'modules/gpu/module.md'),
    `---\nid: '05'\ncourse: ${id}\ntitle: GPU\nlessons: ['05-02']\n---`,
  );
  await writeFile(
    path.join(directory, 'modules/gpu/lessons/dispatch.md'),
    `---\nid: '05-02'\ncourse: ${id}\ntitle: Lesson ${revision}\n---\n## Revision ${revision}\n\nSearchable ${revision}.\n\n` +
      (external ? `[Notes](${assetUrl})\n\n` : '') +
      `[Experiment](/experiments/${id}/compute-dispatch)`,
  );
  await mkdir(path.join(directory, 'experiments'), { recursive: true });
  await writeFile(path.join(directory, 'experiments/compute-dispatch.html'), `<h1>Experiment ${revision}</h1>`);
  if (external) {
    const assets = path.join(root, 'public/course-assets/unreal-engine');
    await mkdir(assets, { recursive: true });
    await writeFile(path.join(assets, assetName), `Download ${revision}`);
    await writeFile(path.join(assets, 'unreferenced.txt'), 'Private unreferenced file');
    await writeFile(path.join(root, 'secret.txt'), 'Private repository file');
  }
  return directory;
}

async function fixture(context: TestContext) {
  const root = await mkdtemp(path.join(tmpdir(), 'autodidact-external-'));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const app = path.join(root, 'app');
  await course(app, 'getting-started', 'bundled');
  const current = path.join(root, 'current');
  async function point(revision: string) {
    await rm(current, { force: true });
    try {
      await symlink(path.join(root, revision), current, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') {
        context.skip('Directory links are unavailable.');
        return false;
      }
      throw error;
    }
    return true;
  }
  return { root, app, current, external: path.join(current, 'courses'), point };
}

async function activeFixture(context: TestContext) {
  const files = await fixture(context);
  const revisionA = path.join(files.root, 'revision-a');
  await course(revisionA, 'ue584', 'alpha', true);
  if (!(await files.point('revision-a'))) return;
  const library = await createCourseLibrary(files.app, files.external);
  await library.refresh();
  assert.equal(library.getSnapshot().getCourse('ue584')?.title, 'Course alpha');
  return { ...files, library, revisionA };
}

function assertEmptyPublication(publication: CoursePublication) {
  assert.deepEqual(publication.catalog, []);
  assert.deepEqual(publication.source.getPages(), []);
  assert.equal(publication.assets.size, 0);
}

test('a valid external checkout replaces the bundled fallback after an initially missing checkout', async (context) => {
  const files = await fixture(context);
  const library = await createCourseLibrary(files.app, files.external);
  await library.refresh();
  const bundled = library.getSnapshot();
  assert.deepEqual(
    bundled.catalog.map((entry) => entry.id),
    ['getting-started'],
  );
  assert.equal(bundled.externalEnabled, true);
  assert.equal(bundled.isExternal, false);

  await course(path.join(files.root, 'revision-a'), 'ue584', 'alpha', true);
  if (!(await files.point('revision-a'))) return;
  await library.refresh();
  const accepted = library.getSnapshot();
  assert.deepEqual(
    accepted.catalog.map((entry) => entry.id),
    ['ue584'],
  );
  assert.equal(accepted.getCourse('ue584')?.title, 'Course alpha');
  assert.equal(accepted.getCourse('getting-started'), undefined);
  assert.equal(accepted.source.getPage(['getting-started']), undefined);
  assert.equal(accepted.isExternal, true);
  await library.refresh();
  assert.equal(library.getSnapshot(), accepted);
  assert.equal(library.getSnapshot().getCourse('getting-started'), undefined);
});

test('invalid or missing revisions withdraw external courses and can recover at the same path', async (context) => {
  const files = await activeFixture(context);
  if (!files) return;
  const { library } = files;

  const broken = await course(path.join(files.root, 'revision-b'), 'ue584', 'beta', true);
  const moduleFile = path.join(broken, 'modules/gpu/module.md');
  await writeFile(moduleFile, "---\nid: '05'\ncourse: ue584\ntitle: Broken\nlessons: ['missing']\n---");
  if (!(await files.point('revision-b'))) return;
  await library.refresh();
  const unavailable = library.getSnapshot();
  assertEmptyPublication(unavailable);
  await library.refresh();
  assert.equal(library.getSnapshot(), unavailable);

  await course(path.join(files.root, 'revision-b'), 'ue584', 'beta', true);
  await library.refresh();
  assert.equal(library.getSnapshot().getCourse('ue584')?.title, 'Course beta');
  await rm(files.current, { force: true });
  await library.refresh();
  assertEmptyPublication(library.getSnapshot());
  if (!(await files.point('revision-b'))) return;
  await library.refresh();
  assert.equal(library.getSnapshot().getCourse('ue584')?.title, 'Course beta');
});

test('an unavailable checkout withdraws its Markdown, experiments and downloads after pruning', async (context) => {
  const files = await activeFixture(context);
  if (!files) return;
  const { library, revisionA } = files;
  const accepted = library.getSnapshot();
  assert.equal(Buffer.from(accepted.assets.get(assetUrl)!).toString(), 'Download alpha');
  assert.equal(accepted.assets.has('/course-assets/unreal-engine/unreferenced.txt'), false);
  assert.equal(accepted.assets.has('/secret.txt'), false);
  assert.equal(accepted.getCourse('ue584')?.experiments[0].html, '<h1>Experiment alpha</h1>');

  await mkdir(path.join(files.root, 'revision-b'), { recursive: true });
  if (!(await files.point('revision-b'))) return;
  await rm(revisionA, { recursive: true });
  await library.refresh();
  assertEmptyPublication(library.getSnapshot());
  assert.equal(library.getSnapshot().getCourse('ue584'), undefined);

  await course(path.join(files.root, 'revision-c'), 'ue584', 'gamma', true);
  if (!(await files.point('revision-c'))) return;
  await Promise.all([library.refresh(), library.refresh(), library.refresh()]);
  const replacement = library.getSnapshot();
  assert.equal(replacement.getCourse('ue584')?.title, 'Course gamma');
  assert.equal(Buffer.from(replacement.assets.get(assetUrl)!).toString(), 'Download gamma');
  assert.match(await replacement.source.getPage(['ue584', '05-02'])!.data.getText('processed'), /Searchable gamma/);
});

test('external duplicate course identities reject the whole candidate', async (context) => {
  const files = await activeFixture(context);
  if (!files) return;
  const { library } = files;
  const revisionB = path.join(files.root, 'revision-b');
  await course(revisionB, 'ue584', 'beta', true);
  const duplicate = path.join(revisionB, 'courses', 'duplicate');
  await mkdir(duplicate);
  await writeFile(path.join(duplicate, 'course.md'), '---\nid: ue584\ntitle: Duplicate\nmodules: []\n---');
  if (!(await files.point('revision-b'))) return;
  await library.refresh();
  assertEmptyPublication(library.getSnapshot());
});

test('a missing referenced asset rejects a candidate until the same revision can be read completely', async (context) => {
  const files = await activeFixture(context);
  if (!files) return;
  const { library } = files;
  const revisionB = path.join(files.root, 'revision-b');
  await course(revisionB, 'ue584', 'beta', true);
  const asset = path.join(revisionB, 'public/course-assets/unreal-engine', assetName);
  await rm(asset);
  if (!(await files.point('revision-b'))) return;
  await library.refresh();
  assertEmptyPublication(library.getSnapshot());
  await writeFile(asset, 'Download beta');
  await library.refresh();
  assert.equal(library.getSnapshot().getCourse('ue584')?.title, 'Course beta');
  assert.equal(Buffer.from(library.getSnapshot().assets.get(assetUrl)!).toString(), 'Download beta');
});

test('an explicitly empty external library leaves the active catalog empty', async (context) => {
  const files = await activeFixture(context);
  if (!files) return;
  const { library } = files;
  await mkdir(path.join(files.root, 'revision-b/courses'), { recursive: true });
  if (!(await files.point('revision-b'))) return;
  await library.refresh();
  assertEmptyPublication(library.getSnapshot());
  await rm(files.current, { force: true });
  await library.refresh();
  assertEmptyPublication(library.getSnapshot());
});

test('a symlink inside the external asset tree cannot publish files from outside the checkout', async (context) => {
  const files = await activeFixture(context);
  if (!files) return;
  const { library } = files;
  const revisionB = path.join(files.root, 'revision-b');
  await course(revisionB, 'ue584', 'beta', true);
  const outside = path.join(files.root, 'outside');
  await mkdir(outside);
  await writeFile(path.join(outside, 'private.txt'), 'Private outside file');
  const assetLink = path.join(revisionB, 'public/course-assets/unreal-engine/outside');
  try {
    await symlink(outside, assetLink, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EPERM') {
      return context.skip('Directory links are unavailable.');
    }
    throw error;
  }
  if (!(await files.point('revision-b'))) return;
  await library.refresh();
  assertEmptyPublication(library.getSnapshot());
});

test('configuration off compiles only bundled courses', async (context) => {
  const files = await fixture(context);
  await course(path.join(files.root, 'revision-a'), 'ue584', 'alpha', true);
  const library = await createCourseLibrary(files.app);
  assert.equal(library.getSnapshot().externalEnabled, false);
  assert.deepEqual(
    library.getSnapshot().catalog.map((entry) => entry.id),
    ['getting-started'],
  );
  const accepted = library.getSnapshot();
  await library.refresh();
  assert.equal(library.getSnapshot(), accepted);
});

test('an ordinary external directory recovers from missing and invalid input without directory-link support', async (context) => {
  const files = await fixture(context);
  const checkout = path.join(files.root, 'checkout');
  const coursesDir = path.join(checkout, 'courses');
  const library = await createCourseLibrary(files.app, coursesDir);
  const search = createFromSource(async () => library.getSnapshot().source);
  const markdown = createDocsLlms(library.getSnapshot);
  const bundled = library.getSnapshot();
  await library.refresh();
  assert.equal(library.getSnapshot(), bundled);
  assert.match(await markdown.index(), /\/courses\/getting-started/);
  assert.ok((await search.search('bundled')).length > 0);

  const directory = await course(checkout, 'ue584', 'alpha', true);
  const moduleFile = path.join(directory, 'modules/gpu/module.md');
  await writeFile(moduleFile, "---\nid: '05'\ncourse: ue584\ntitle: Broken\nlessons: ['missing']\n---");
  await library.refresh();
  assert.equal(library.getSnapshot(), bundled);
  await course(checkout, 'ue584', 'alpha', true);
  await Promise.all([library.refresh(), library.refresh(), library.refresh()]);

  const accepted = library.getSnapshot();
  assert.equal(accepted.getCourse('ue584')?.title, 'Course alpha');
  assert.equal(accepted.getCourse('getting-started'), undefined);
  assert.deepEqual(
    getPublicationTree(accepted).children.map((node) => node.name),
    ['Course alpha'],
  );
  assert.equal(accepted.source.getPage(['getting-started', '05-02']), undefined);
  assert.ok((await search.search('alpha')).some((result) => result.url.startsWith('/courses/ue584')));
  assert.deepEqual(await search.search('bundled'), []);
  const index = await markdown.index();
  assert.match(index, /\/courses\/ue584/);
  assert.doesNotMatch(index, /getting-started/);
  const full = await markdown.full();
  assert.match(full, /Searchable alpha/);
  assert.doesNotMatch(full, /getting-started|Searchable bundled/);
  assert.equal(Buffer.from(accepted.assets.get(assetUrl)!).toString(), 'Download alpha');
  assert.equal(accepted.assets.has('/course-assets/unreal-engine/unreferenced.txt'), false);
  assert.equal(accepted.assets.has('/secret.txt'), false);
  await library.refresh();
  assert.equal(library.getSnapshot(), accepted);

  await rm(coursesDir, { recursive: true });
  await library.refresh();
  const unavailable = library.getSnapshot();
  assertEmptyPublication(unavailable);
  assert.deepEqual(getPublicationTree(unavailable).children, []);
  assert.deepEqual(await search.search('alpha'), []);
  assert.doesNotMatch(await markdown.index(), /ue584|getting-started/);
  assert.equal(await markdown.full(), '');
});

test('an external course may reuse a bundled identity without serving bundled content', async (context) => {
  const files = await fixture(context);
  const checkout = path.join(files.root, 'checkout');
  await course(checkout, 'getting-started', 'replacement', true);
  const library = await createCourseLibrary(files.app, path.join(checkout, 'courses'));
  assert.equal(library.getSnapshot().getCourse('getting-started')?.title, 'Course bundled');
  await library.refresh();
  const accepted = library.getSnapshot();
  assert.equal(accepted.getCourse('getting-started')?.title, 'Course replacement');
  assert.equal(accepted.isExternal, true);
  const page = accepted.source.getPage(['getting-started', '05-02']);
  assert.match(await page!.data.getText('processed'), /Searchable replacement/);
});
