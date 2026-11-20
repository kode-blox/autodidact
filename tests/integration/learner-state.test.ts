import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { startS3Server } from '@/tests/helpers/s3-server';
import type { CourseState, LessonState, Resource, NoteValue, ResumeValue } from '@/lib/learner-types';

const nextCli = fileURLToPath(import.meta.resolve('next/dist/bin/next'));

test('S3 learner state survives restart and rejects conflicting updates', { timeout: 60_000 }, async () => {
  // Requires a freshly built application; all storage traffic stays on loopback.
  const courseId = 'ue584';
  const origin = 'http://127.0.0.1:4341';
  const s3 = await startS3Server();
  const children: ChildProcess[] = [];

  async function startApp() {
    const child = spawn(process.execPath, [nextCli, 'start', '--hostname', '127.0.0.1'], {
      env: {
        ...process.env,
        AUTODIDACT_S3_ENDPOINT: s3.endpoint,
        AUTODIDACT_S3_REGION: 'test-region',
        AUTODIDACT_S3_BUCKET: s3.bucket,
        AUTODIDACT_S3_USE_PATH_STYLE: 'true',
        AWS_ACCESS_KEY_ID: 'integration-access-key',
        AWS_SECRET_ACCESS_KEY: 'integration-secret-key',
        AWS_SESSION_TOKEN: '',
        HOSTNAME: '127.0.0.1',
        PORT: new URL(origin).port,
        AUTODIDACT_METRICS_PORT: '4342',
        AUTODIDACT_PUBLIC_URL: origin,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    children.push(child);
    child.stdout?.resume();
    child.stderr?.resume();
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null || child.signalCode !== null)
        throw new Error('The test application exited during startup.');
      try {
        if ((await fetch(`${origin}/api/health`)).status === 200) return child;
      } catch {
        /* The listener may not be ready yet. */
      }
      await delay(100);
    }
    throw new Error('Timed out waiting for application startup.');
  }

  async function stopApp(child: ChildProcess) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
      }, 3000);
      timer.unref();
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      child.kill();
    });
  }

  async function lessonState(lesson = '05-01'): Promise<LessonState> {
    const response = await fetch(`${origin}/api/courses/${courseId}/lessons/${lesson}/state`);
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  }

  async function courseState(): Promise<CourseState> {
    const response = await fetch(`${origin}/api/courses/${courseId}/state`);
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  }

  function saveLesson(kind: 'note' | 'completion', expectedVersion: number, value: unknown, lesson = '05-01') {
    return fetch(`${origin}/api/courses/${courseId}/lessons/${lesson}/state`, {
      method: 'PUT',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, expectedVersion, value }),
    });
  }

  function saveResume(expectedVersion: number, value: ResumeValue) {
    return fetch(`${origin}/api/courses/${courseId}/resume`, {
      method: 'PUT',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedVersion, value }),
    });
  }

  try {
    await startApp();
    assert.equal(
      s3.requests.filter((request) => request.method === 'PUT').length,
      0,
      'Startup and readiness must not create storage documents.',
    );
    const health = await fetch(origin + '/api/health');
    assert.equal(health.headers.get('cache-control'), 'no-store');
    const rejectedOrigin = await fetch(origin + '/api/courses/' + courseId + '/lessons/05-01/state', {
      method: 'PUT',
      headers: { Origin: 'https://other.example', 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'completion', expectedVersion: 0, value: { completed: true } }),
    });
    assert.equal(rejectedOrigin.status, 403);
    const rejectedType = await fetch(origin + '/api/courses/' + courseId + '/lessons/05-01/state', {
      method: 'PUT',
      headers: { Origin: origin, 'Content-Type': 'text/plain' },
      body: '{}',
    });
    assert.equal(rejectedType.status, 415);
    const invalidHeading = await saveResume(0, { lessonId: '05-01', heading: 'missing-heading' });
    assert.equal(invalidHeading.status, 400);
    assert.equal(
      s3.requests.filter((request) => request.method === 'PUT').length,
      0,
      'Rejected requests must not write learner documents.',
    );
    const initial = await lessonState();
    assert.equal(initial.note.version, 0);
    assert.deepEqual(initial.note.value, { text: '' });

    const writes = await Promise.all([
      saveLesson('note', 0, { text: 'First tab note' }),
      saveLesson('note', 0, { text: 'Second tab note' }),
    ]);
    assert.deepEqual(writes.map((response) => response.status).sort(), [200, 409]);
    const winner = (await writes.find((response) => response.status === 200)!.json()) as Resource<NoteValue>;
    const conflict = (await writes.find((response) => response.status === 409)!.json()) as {
      current: Resource<NoteValue>;
    };
    assert.deepEqual(conflict.current, winner);
    assert.deepEqual((await lessonState()).note, winner);

    const edited = await saveLesson('note', winner.version, { text: 'Saved newer note' });
    assert.equal(edited.status, 200);
    const newest = (await edited.json()) as Resource<NoteValue>;
    const stale = await saveLesson('note', winner.version, { text: 'Stale note' });
    assert.equal(stale.status, 409);
    assert.deepEqual(((await stale.json()) as { current: unknown }).current, newest);

    const completed = await saveLesson('completion', 0, { completed: true });
    assert.equal(completed.status, 200);
    const completion = await completed.json();
    const repeated = await saveLesson('completion', 0, { completed: true });
    assert.equal(repeated.status, 200);
    assert.deepEqual(await repeated.json(), completion);
    const conflicting = await saveLesson('completion', 0, { completed: false });
    assert.equal(conflicting.status, 409);
    assert.deepEqual(((await conflicting.json()) as { current: unknown }).current, completion);
    const otherLesson = await saveLesson('completion', 0, { completed: true }, '05-02');
    assert.equal(otherLesson.status, 200);
    assert.equal(((await otherLesson.json()) as Resource<unknown>).version, 1);
    assert.deepEqual((await lessonState()).completion, completion);
    assert.deepEqual((await lessonState()).note, newest);

    const resume = await saveResume(0, { lessonId: '05-02', heading: null });
    assert.equal(resume.status, 200);
    const savedResume = (await resume.json()) as Resource<ResumeValue>;
    const staleResume = await saveResume(0, { lessonId: '05-01', heading: null });
    assert.equal(staleResume.status, 409);
    assert.deepEqual(((await staleResume.json()) as { current: unknown }).current, savedResume);
    assert.deepEqual((await courseState()).resume, savedResume);

    const introResume = await saveResume(savedResume.version, { lessonId: '05-01', heading: '' });
    assert.equal(introResume.status, 200);
    assert.deepEqual(((await introResume.json()) as Resource<ResumeValue>).value, { lessonId: '05-01', heading: '' });

    const stateBeforeRestart = await lessonState();
    const otherBeforeRestart = await lessonState('05-02');
    const courseBeforeRestart = await courseState();
    await stopApp(children.at(-1)!);
    await startApp();
    assert.deepEqual(await lessonState(), stateBeforeRestart);
    assert.deepEqual(await lessonState('05-02'), otherBeforeRestart);
    assert.deepEqual(await courseState(), courseBeforeRestart);

    assert.equal((await fetch(`${origin}/api/courses/not-a-course/state`)).status, 404);
    assert.equal((await fetch(`${origin}/api/courses/${courseId}/lessons/not-a-lesson/state`)).status, 404);
    assert.equal(s3.errors.length, 0, 'S3 fixture saw an unexpected request.');
    assert.ok(s3.requests.some((request) => request.method === 'PUT' && request.ifNoneMatch === '*'));
    assert.ok(s3.requests.some((request) => request.method === 'PUT' && request.ifMatch));
    assert.deepEqual([...s3.objects.keys()].sort(), [
      `courses/${courseId}/lessons/05-01/completion.json`,
      `courses/${courseId}/lessons/05-01/note.json`,
      `courses/${courseId}/lessons/05-02/completion.json`,
      `courses/${courseId}/resume.json`,
    ]);
    console.info(
      'S3 integration passed: note conflicts, per-lesson completion, resume conflicts, nonmutating readiness, and restart persistence.',
    );
  } finally {
    await Promise.all(children.map(stopApp));
    await s3.close();
  }
});
