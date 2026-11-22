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

import { resolveLinkItems, type BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { LogOut } from 'lucide-react';
import { appName, gitConfig } from '@/lib/shared';

export function baseOptions(logoutUrl?: string): BaseLayoutProps {
  const links = resolveLinkItems({ githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}` });
  if (logoutUrl) {
    links.push({
      type: 'icon',
      label: 'Log out',
      text: 'Log out',
      icon: <LogOut aria-hidden="true" />,
      url: logoutUrl,
      // Use same-tab navigation. The auth origin is cross-origin, which Next.js never prefetches.
      external: false,
    });
  }

  return {
    nav: {
      // JSX supported
      title: appName,
    },
    links,
  };
}
