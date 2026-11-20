import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRuntimeCollections } from '@/lib/content/runtime';

async function library() {
  const root = await mkdtemp(path.join(tmpdir(), 'autodidact-runtime-'));
  return { root, close: () => rm(root, { recursive: true, force: true }) };
}

async function fixture(root: string, course: string) {
  const directory = path.join(root, 'content', 'courses', course);
  const assets = path.join(root, 'public', 'course-assets');
  await mkdir(path.join(directory, 'modules', 'one', 'lessons'), { recursive: true });
  await mkdir(assets, { recursive: true });
  await writeFile(path.join(assets, 'course notes.txt'), 'Course notes');
  await writeFile(
    path.join(directory, 'course.md'),
    `---\nid: ${course}\ntitle: User course\nmodules: ['one']\n---\nA mounted course.`,
  );
  await writeFile(
    path.join(directory, 'modules', 'one', 'module.md'),
    `---\nid: one\ncourse: ${course}\ntitle: Module one\nlessons: ['first']\n---`,
  );
  await writeFile(
    path.join(directory, 'modules', 'one', 'lessons', 'first.md'),
    `---\nid: first\ncourse: ${course}\ntitle: Mounted lesson\n---\n## Runtime heading\n\nSearchable personal content.\n\n[Notes](/course-assets/course%20notes.txt)`,
  );
}

test('an empty course directory loads without courses', async () => {
  const mounted = await library();
  try {
    const result = await createRuntimeCollections(mounted.root);
    assert.equal(result.courseDocuments.entries.length, 0);
    assert.equal(result.lessonDocuments.entries.length, 0);
  } finally {
    await mounted.close();
  }
});

test('course trees compile their own lessons, headings, Markdown exports, and public asset links', async () => {
  const first = await library();
  const second = await library();
  try {
    await fixture(first.root, 'private-one');
    await fixture(second.root, 'private-two');
    for (const [mounted, course] of [
      [first, 'private-one'],
      [second, 'private-two'],
    ] as const) {
      const result = await createRuntimeCollections(mounted.root);
      assert.deepEqual(
        result.courseDocuments.entries.map((entry) => entry.id),
        [course],
      );
      const lesson = result.lessonDocuments.entries[0];
      assert.equal(lesson.course, course);
      assert.ok(lesson.structuredData.headings.some((heading) => heading.id === 'runtime-heading'));
      assert.match(await lesson.getText('processed'), /Searchable personal content/);
      assert.deepEqual(lesson.publicUrls, ['/course-assets/course%20notes.txt']);
    }
  } finally {
    await first.close();
    await second.close();
  }
});

test('startup rejects a public asset symlink even when no courses are present', async (context) => {
  const mounted = await library();
  const outside = await library();
  try {
    const assets = path.join(mounted.root, 'public', 'course-assets');
    await mkdir(assets, { recursive: true });
    await writeFile(path.join(outside.root, 'secret.txt'), 'private');
    try {
      await symlink(outside.root, path.join(assets, 'outside'), 'junction');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') {
        return context.skip('Symlink creation is unavailable.');
      }
      throw error;
    }
    await assert.rejects(createRuntimeCollections(mounted.root), /Public asset symlinks are unsupported/);
  } finally {
    await mounted.close();
    await outside.close();
  }
});
