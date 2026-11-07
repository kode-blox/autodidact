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

'use client';

import { FrameworkProvider } from 'fumadocs-core/framework';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import {
  MAX_NOTE_LENGTH,
  type CourseState,
  type LessonState,
  type NoteValue,
  type Resource,
} from '@/lib/learner-types';

const OVERVIEW_ENTRY_KEY = 'autodidact:overview-entry';
const RESUME_TIMEOUT_MS = 1500;

function headingFromHash(hash: string) {
  try {
    return hash ? decodeURIComponent(hash.slice(1)) : null;
  } catch {
    return null;
  }
}

// Both links and programmatic search navigation use the reader's save guard.
function navigateDocument(url: string) {
  const link = document.createElement('a');

  link.href = url;
  link.dataset.readerNavigation = 'true';
  link.hidden = true;

  document.body.append(link);

  link.click();
  link.remove();
}

const documentRouter = {
  push: navigateDocument,

  refresh: () => location.reload(),
};

function useDocumentRouter() {
  return documentRouter;
}

export function ReaderNavigationProvider({ children }: { children: ReactNode }) {
  return (
    <FrameworkProvider usePathname={usePathname} useParams={useParams} useRouter={useDocumentRouter}>
      {children}
    </FrameworkProvider>
  );
}

export function OverviewLessonLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={className}
      prefetch={false}
      onNavigate={(event) => {
        event.preventDefault();

        try {
          if (document.visibilityState === 'visible') {
            sessionStorage.setItem(
              OVERVIEW_ENTRY_KEY,
              JSON.stringify({ url: new URL(href, location.href).href, expires: Date.now() + 30_000 }),
            );
          }
        } catch {
          // Navigating still works when browser storage is unavailable.
        }
        // Keep Back from a lesson subject to its beforeunload draft guard.
        location.assign(href);
      }}
    >
      {children}
    </Link>
  );
}

function takeOverviewEntry() {
  try {
    const stored = sessionStorage.getItem(OVERVIEW_ENTRY_KEY);

    if (!stored) {
      return false;
    }

    sessionStorage.removeItem(OVERVIEW_ENTRY_KEY);

    const { url, expires } = JSON.parse(stored) as { url: string; expires: number };
    const [navigation] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];

    return navigation?.type === 'navigate' && location.href === url && Date.now() < expires;
  } catch {
    return false;
  }
}

interface Props {
  courseId: string;
  lessonId: string;
  lessonIds: string[];
  headingIds: string[];
  experiments: {
    id: string;
    title: string;
  }[];
}

type Panel = 'notes' | 'experiment';

export default function ReaderTools({ courseId, lessonId, lessonIds, headingIds, experiments }: Props) {
  const [panel, setPanel] = useState<Panel | null>(null),
    [state, setState] = useState<LessonState>(),
    [draft, setDraft] = useState(''),
    [status, setStatus] = useState('Loading saved state…'),
    [available, setAvailable] = useState(false),
    [conflict, setConflict] = useState<Resource<NoteValue>>(),
    [experiment, setExperiment] = useState(experiments[0]?.id ?? '');

  const dialog = useRef<HTMLDialogElement>(null),
    note = useRef<Resource<NoteValue> | undefined>(undefined),
    text = useRef(''),
    dirty = useRef(false),
    saving = useRef<Promise<boolean> | null>(null),
    blocked = useRef(false),
    resume = useRef<LessonState['resume'] | undefined>(undefined),
    restoreDone = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const base = `/api/courses/${courseId}`;
  const lessonBase = `${base}/lessons/${lessonId}`;
  const resumeSaving = useRef<Promise<void> | null>(null);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const navigating = useRef(false);
  const explicitEntry = useRef(false);
  const excessCharacters = draft.length - MAX_NOTE_LENGTH;
  const noteTooLong = excessCharacters > 0;

  const currentReadingPoint = useCallback(() => {
    const heading =
      Array.from(
        document.querySelectorAll<HTMLElement>('[data-lesson-prose] :is(h1, h2, h3, h4, h5, h6)[id]'),
      ).findLast(
        (element) =>
          headingIds.includes(element.id) &&
          !element.closest('details:not([open]) > :not(summary:first-of-type)') &&
          element.getClientRects().length > 0 &&
          element.getBoundingClientRect().top < 180,
      )?.id ?? null;
    return { lessonId, heading };
  }, [headingIds, lessonId]);

  const saveResume = useCallback(
    async (value: { lessonId: string; heading: string | null }) => {
      // Serialize local writes. A conflict supplies the version for the next
      // explicit activity; it never causes an automatic overwrite.
      // One deadline covers waiting for the current write, lookup, and saving.
      const signal = AbortSignal.timeout(RESUME_TIMEOUT_MS);

      while (resumeSaving.current) {
        await resumeSaving.current;
      }

      if (signal.aborted || document.visibilityState !== 'visible') {
        return;
      }

      const operation = (async () => {
        try {
          if (!resume.current) {
            // Resume can still be available when the lesson's note cannot load.
            const response = await fetch(`${base}/state`, { signal });

            if (!response.ok) {
              return;
            }

            const courseState: CourseState = await response.json();
            resume.current ??= courseState.resume;
          }

          const response = await fetch(`${base}/resume`, {
            method: 'PUT',
            signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              expectedVersion: resume.current.version,
              value,
            }),
          });

          const data = await response.json();

          if (response.ok) {
            resume.current = data;
          } else if (response.status === 409) {
            resume.current = data.current;
          }
        } catch {
          // A later user action can retry; reading and navigation still work.
        }
      })();
      resumeSaving.current = operation;
      try {
        await operation;
      } finally {
        if (resumeSaving.current === operation) {
          resumeSaving.current = null;
        }
      }
    },
    [base],
  );

  useEffect(() => () => clearTimeout(timer.current), []);

  const save = useCallback(
    async function saveChanges(): Promise<boolean> {
      if (saving.current) {
        const previousVersion = note.current?.version;
        await saving.current;

        if (!dirty.current) {
          return true;
        }

        return !blocked.current && note.current?.version !== previousVersion ? saveChanges() : false;
      }

      if (!dirty.current) {
        return true;
      }

      if (!note.current || blocked.current) {
        return false;
      }

      const sent = text.current;

      if (sent.length > MAX_NOTE_LENGTH) {
        return false;
      }

      setStatus('Saving…');
      const operation = (async () => {
        try {
          const r = await fetch(`${lessonBase}/state`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              kind: 'note',
              expectedVersion: note.current!.version,
              value: { text: sent },
            }),
          });

          const data = await r.json();

          if (r.status === 409) {
            blocked.current = true;
            setConflict(data.current);
            setStatus('A newer note exists. Your draft is preserved.');
            return false;
          }

          if (r.status === 400 && typeof data.error === 'string') {
            setStatus(`${data.error} Your draft is still here.`);
            return false;
          }

          if (!r.ok) {
            throw new Error();
          }

          note.current = data;
          dirty.current = text.current !== sent;
          setStatus(dirty.current ? 'Unsaved changes' : 'Saved');

          return !dirty.current;
        } catch {
          setStatus('Could not save. Your draft is still here.');

          return false;
        } finally {
          saving.current = null;
        }
      })();
      saving.current = operation;

      return operation;
    },
    [lessonBase],
  );
  useEffect(() => {
    explicitEntry.current ||= takeOverviewEntry();
    let live = true;

    async function load() {
      try {
        const response = await fetch(`${lessonBase}/state`);

        if (!response.ok) {
          throw new Error();
        }

        const ls: LessonState = await response.json();

        if (!live) {
          return;
        }

        setState((previous) =>
          previous
            ? {
                ...ls,
                completion: ls.completion.version >= previous.completion.version ? ls.completion : previous.completion,
              }
            : ls,
        );

        setAvailable(true);

        if (!resume.current || ls.resume.version >= resume.current.version) {
          resume.current = ls.resume;
        }

        if (!dirty.current && !saving.current && ls.note.version >= (note.current?.version ?? 0)) {
          note.current = ls.note;
          text.current = ls.note.value.text;
          setDraft(text.current);
          setStatus('Saved');
        }

        if (!restoreDone.current) {
          restoreDone.current = true;
          const target = resume.current.value;

          if (!location.hash && target?.lessonId === lessonId && target.heading) {
            document.getElementById(target.heading)?.scrollIntoView();
          }
        }

        if (explicitEntry.current) {
          explicitEntry.current = false;
          const anchor = headingFromHash(location.hash);
          const heading = anchor && headingIds.includes(anchor) ? anchor : null;
          const target = resume.current.value;

          if (!navigating.current && (target?.lessonId !== lessonId || (heading && heading !== target.heading))) {
            void saveResume({ lessonId, heading });
          }
        }
      } catch {
        if (live) {
          setAvailable(false);
          setStatus('Saved state is unavailable. Reading still works.');
          restoreDone.current = true;
        }
      }
    }

    void load();
    window.addEventListener('focus', load);

    return () => {
      live = false;
      window.removeEventListener('focus', load);
    };
  }, [headingIds, lessonBase, lessonId, saveResume]);

  useEffect(() => {
    if (panel) {
      dialog.current?.showModal();
    } else {
      dialog.current?.close();
    }
  }, [panel]);

  useEffect(() => {
    const hasPendingNote = () => dirty.current || saving.current !== null;
    const before = (event: BeforeUnloadEvent) => {
      if (hasPendingNote()) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    const click = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
      if (
        !link ||
        (link.target && link.target !== '_self') ||
        link.hasAttribute('download') ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0
      ) {
        return;
      }

      const url = new URL(link.href, location.href);

      if (url.origin !== location.origin) {
        return;
      }

      if (url.pathname.startsWith(`/experiments/${courseId}/`)) {
        event.preventDefault();
        setExperiment(url.pathname.split('/').pop()!);
        setPanel('experiment');

        return;
      }

      const samePage = url.pathname === location.pathname && url.search === location.search;

      const activeNavigation =
        (event.isTrusted || link.dataset.readerNavigation === 'true') && document.visibilityState === 'visible';

      if (!hasPendingNote() && !activeNavigation) {
        return;
      }

      event.preventDefault();

      if (navigating.current) {
        return;
      }

      navigating.current = true;

      clearTimeout(resumeTimer.current);

      // Capture the point before awaiting notes, since a dialog can move focus.
      const readingPoint = currentReadingPoint();
      const destination = lessonIds.find((id) => url.pathname === `/courses/${courseId}/${id}`);
      const heading = headingFromHash(url.hash);
      const destinationPoint = destination ? { lessonId: destination, heading } : readingPoint;

      void (async () => {
        clearTimeout(timer.current);
        // New edits made during either request must be flushed before leaving.
        const flushNotes = async () => {
          while (hasPendingNote()) {
            const previousVersion = note.current?.version;
            const saved = await save();

            if (!saved && (blocked.current || note.current?.version === previousVersion)) {
              setPanel('notes');
              navigating.current = false;
              return false;
            }
          }
          return true;
        };

        if (!(await flushNotes())) {
          return;
        }

        if (activeNavigation) {
          await saveResume(destinationPoint);
        }

        if (!(await flushNotes())) {
          return;
        }

        if (samePage) {
          setPanel(null);
        }

        location.assign(url.href);

        if (samePage) {
          navigating.current = false;
        }
      })();
    };

    window.addEventListener('beforeunload', before);
    document.addEventListener('click', click);

    return () => {
      window.removeEventListener('beforeunload', before);
      document.removeEventListener('click', click);
    };
  }, [courseId, lessonIds, currentReadingPoint, save, saveResume]);

  useEffect(() => {
    let userHasInteracted = false;
    const active = (event: Event) => {
      if (!event.isTrusted || navigating.current || !restoreDone.current || document.visibilityState !== 'visible') {
        return;
      }

      if (event.type !== 'scroll') {
        userHasInteracted = true;
      }

      if (!userHasInteracted) {
        return;
      }

      clearTimeout(resumeTimer.current);
      resumeTimer.current = setTimeout(() => void saveResume(currentReadingPoint()), 900);
    };

    window.addEventListener('wheel', active, { passive: true });
    window.addEventListener('touchmove', active, { passive: true });
    window.addEventListener('scroll', active);
    window.addEventListener('pointerdown', active);
    window.addEventListener('keydown', active);

    return () => {
      clearTimeout(resumeTimer.current);
      window.removeEventListener('wheel', active);
      window.removeEventListener('touchmove', active);
      window.removeEventListener('scroll', active);
      window.removeEventListener('pointerdown', active);
      window.removeEventListener('keydown', active);
    };
  }, [currentReadingPoint, saveResume]);
  async function toggleCompletion() {
    if (!state) {
      return;
    }

    setAvailable(false);

    try {
      const r = await fetch(`${lessonBase}/state`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'completion',
          expectedVersion: state.completion.version,
          value: { completed: !state.completion.value.completed },
        }),
      });

      const data = await r.json();

      if (r.ok) {
        setState({ ...state, completion: data });
      } else if (r.status === 409) {
        setState({ ...state, completion: data.current });
        setStatus('Completion changed elsewhere. Check its current state before trying again.');
      } else {
        throw new Error();
      }
    } catch {
      setStatus('Could not update completion. Please try again.');
    } finally {
      setAvailable(true);
    }
  }
  return (
    <>
      <nav
        className="mb-4 flex flex-wrap justify-between gap-3 border-y border-fd-border py-3 text-[0.85rem]"
        aria-label="Reading tools"
      >
        <div className="flex gap-2">
          <button
            className="cursor-pointer rounded-[0.4rem] border border-fd-border px-3 py-2"
            onClick={() => setPanel('notes')}
          >
            Notes{dirty.current ? ' •' : ''}
          </button>
          {experiments.length > 0 && (
            <button
              className="cursor-pointer rounded-[0.4rem] border border-fd-border px-3 py-2"
              onClick={() => setPanel('experiment')}
            >
              Experiments
            </button>
          )}
        </div>
        <button
          className="cursor-pointer rounded-[0.4rem] border border-fd-border px-3 py-2 disabled:cursor-default disabled:opacity-50 aria-pressed:text-fd-primary"
          disabled={!available}
          aria-pressed={state?.completion.value.completed ?? false}
          onClick={() => void toggleCompletion()}
        >
          {state?.completion.value.completed ? '✓ Completed' : 'Mark complete'}
        </button>
      </nav>
      {(!available || /Could not|changed elsewhere/.test(status)) && (
        <p className="text-[0.85rem] text-fd-muted-foreground" role="status">
          {status}
        </p>
      )}
      <dialog
        className={cn(
          'fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh max-w-full border-0 border-l border-fd-border bg-fd-background p-0 text-fd-foreground backdrop:bg-[#10241d55] [@media(max-width:650px)]:w-full',
          panel === 'experiment' ? 'w-[min(1100px,100%)]' : 'w-[min(500px,100%)]',
        )}
        ref={dialog}
        onCancel={() => setPanel(null)}
        onClose={() => setPanel(null)}
        aria-labelledby="panel-title"
      >
        <header className="sticky top-0 z-1 flex items-center justify-between border-b border-fd-border bg-fd-background px-6 py-[1.2rem]">
          <h2 id="panel-title" className="m-0 text-[1.5rem]">
            {panel === 'notes' ? 'Your notes' : 'Experiments'}
          </h2>
          <button
            className="cursor-pointer rounded-[0.4rem] border border-fd-border px-3 py-2"
            aria-label="Close panel"
            onClick={() => setPanel(null)}
          >
            ✕
          </button>
        </header>
        <div className="p-6">
          {panel === 'notes' && (
            <>
              <label className="mb-[0.7rem] block text-[0.85rem]" htmlFor="lesson-note">
                Private notes for this lesson
              </label>
              <textarea
                id="lesson-note"
                className="w-full rounded-[4px] border border-fd-border bg-fd-background p-[0.8rem] min-h-[55dvh] resize-y leading-[1.7] disabled:cursor-default disabled:opacity-50"
                disabled={!available}
                value={draft}
                aria-invalid={noteTooLong}
                aria-describedby="lesson-note-limit"
                onChange={(e) => {
                  text.current = e.target.value;
                  setDraft(text.current);
                  // The in-flight write can change the saved text even if this edit restores the old value.
                  dirty.current =
                    blocked.current || saving.current !== null || text.current !== note.current?.value.text;
                  if (!blocked.current) setStatus(dirty.current ? 'Unsaved changes' : 'Saved');
                  clearTimeout(timer.current);
                  if (text.current.length <= MAX_NOTE_LENGTH) timer.current = setTimeout(() => void save(), 700);
                }}
                placeholder="What do you want to remember?"
              />
              <p id="lesson-note-limit" className="text-[0.85rem] text-fd-muted-foreground">
                {noteTooLong
                  ? `Remove ${excessCharacters.toLocaleString('en-US')} ${excessCharacters === 1 ? 'character' : 'characters'} to save your draft.`
                  : `${draft.length.toLocaleString('en-US')} / ${MAX_NOTE_LENGTH.toLocaleString('en-US')} characters`}
              </p>
              <p role="status" className="text-[0.85rem] text-fd-muted-foreground">
                {status}
              </p>
              {conflict && (
                <div>
                  <h3>Saved version from another session</h3>
                  <pre className="max-h-[200px] overflow-auto whitespace-pre-wrap bg-fd-muted p-4">
                    {conflict.value.text || '(Empty note)'}
                  </pre>
                  <button
                    className="m-[0.3rem] cursor-pointer rounded-[0.4rem] border border-fd-border px-3 py-2"
                    onClick={() => {
                      note.current = conflict;
                      text.current = conflict.value.text;
                      setDraft(text.current);
                      dirty.current = false;
                      blocked.current = false;
                      setConflict(undefined);
                      setStatus('Saved');
                    }}
                  >
                    Load saved version
                  </button>
                  <button
                    className="m-[0.3rem] cursor-pointer rounded-[0.4rem] border border-fd-border px-3 py-2 disabled:cursor-default disabled:opacity-50"
                    disabled={noteTooLong}
                    onClick={() => {
                      note.current = conflict;
                      blocked.current = false;
                      setConflict(undefined);
                      void save();
                    }}
                  >
                    Keep my draft and save
                  </button>
                </div>
              )}
              {dirty.current && !conflict && !noteTooLong && (
                <button
                  className="cursor-pointer rounded-[0.4rem] border border-fd-border px-3 py-2"
                  onClick={() => void save()}
                >
                  Retry save
                </button>
              )}
            </>
          )}
          {panel === 'experiment' && (
            <>
              <label className="mb-[0.7rem] block text-[0.85rem]" htmlFor="experiment-choice">
                Choose experiment
              </label>
              <select
                className="w-full rounded-[4px] border border-fd-border bg-fd-background p-[0.8rem]"
                id="experiment-choice"
                value={experiment}
                onChange={(e) => setExperiment(e.target.value)}
              >
                {experiments.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title}
                  </option>
                ))}
              </select>
              {experiment && (
                <iframe
                  className="mt-4 h-[75dvh] w-full border border-fd-border bg-white"
                  key={experiment}
                  title={experiments.find((e) => e.id === experiment)?.title ?? 'Interactive experiment'}
                  src={`/experiments/${courseId}/${experiment}`}
                  sandbox="allow-scripts"
                />
              )}
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
