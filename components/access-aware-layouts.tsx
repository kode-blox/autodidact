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

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { DocsLayout, type DocsLayoutProps } from 'fumadocs-ui/layouts/docs';
import { HomeLayout, type HomeLayoutProps } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '@/lib/layout.shared';

async function getLogoutUrl(signal: AbortSignal): Promise<string | undefined> {
  try {
    const response = await fetch('/api/auth/session', {
      cache: 'no-store',
      credentials: 'same-origin',
      redirect: 'error',
      signal,
    });
    if (response.status !== 204) return;

    const url = new URL(response.headers.get('X-AutoDidact-Logout-URL') ?? '');
    if (url.protocol === 'https:' && url.origin !== window.location.origin) {
      return url.href;
    }
  } catch {
    // The logout control stays hidden when the gateway session cannot be verified.
  }
}

function useLogoutUrl() {
  const pathname = usePathname();
  const [session, setSession] = useState<{ pathname: string; logoutUrl: string }>();

  useEffect(() => {
    let controller: AbortController | undefined;

    function checkSession() {
      controller?.abort();
      const check = new AbortController();
      controller = check;
      void getLogoutUrl(check.signal).then((url) => {
        if (!check.signal.aborted) setSession(url ? { pathname, logoutUrl: url } : undefined);
      });
    }

    function recheckSession() {
      setSession(undefined);
      checkSession();
    }

    function restorePage(event: PageTransitionEvent) {
      if (event.persisted) recheckSession();
    }

    checkSession();
    window.addEventListener('focus', recheckSession);
    window.addEventListener('pageshow', restorePage);
    return () => {
      controller?.abort();
      window.removeEventListener('focus', recheckSession);
      window.removeEventListener('pageshow', restorePage);
    };
  }, [pathname]);

  return session?.pathname === pathname ? session.logoutUrl : undefined;
}

export function AccessAwareCourseLayout({ tree, children }: Pick<DocsLayoutProps, 'tree' | 'children'>) {
  const logoutUrl = useLogoutUrl();
  return (
    <DocsLayout tree={tree} {...baseOptions(logoutUrl)}>
      {children}
    </DocsLayout>
  );
}

export function AccessAwareHomeLayout({ children }: Pick<HomeLayoutProps, 'children'>) {
  const logoutUrl = useLogoutUrl();
  return <HomeLayout {...baseOptions(logoutUrl)}>{children}</HomeLayout>;
}
