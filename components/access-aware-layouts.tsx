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

import {
  AccessAwareDocsLayout,
  AccessAwareHomeLayout as SharedAccessAwareHomeLayout,
  type AccessAwareDocsLayoutProps,
  type AccessAwareHomeLayoutProps,
} from '@sayakm/fumadocs-shared';
import { usePathname } from 'next/navigation';
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

const accessOptions = {
  getLogoutUrl,
  getLayoutProps: baseOptions,
  recheckOnReturn: true,
};

export function AccessAwareCourseLayout({ tree, children }: Pick<AccessAwareDocsLayoutProps, 'tree' | 'children'>) {
  const pathname = usePathname();
  return (
    <AccessAwareDocsLayout tree={tree} sessionKey={pathname} {...accessOptions}>
      {children}
    </AccessAwareDocsLayout>
  );
}

export function AccessAwareHomeLayout({ children }: Pick<AccessAwareHomeLayoutProps, 'children'>) {
  const pathname = usePathname();
  return (
    <SharedAccessAwareHomeLayout sessionKey={pathname} {...accessOptions}>
      {children}
    </SharedAccessAwareHomeLayout>
  );
}
