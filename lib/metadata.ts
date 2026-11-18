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

import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getPageImageUrl } from '@/lib/shared';

export function metadataOrigin(requestHeaders: Pick<Headers, 'get'>, configuredOrigin = process.env.APP_ORIGIN): URL {
  if (configuredOrigin) {
    return new URL(configuredOrigin);
  }

  const host = (requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host'))?.split(',')[0].trim();

  if (!host) {
    throw new Error('A request host or APP_ORIGIN is required for page metadata');
  }

  const protocol = requestHeaders.get('x-forwarded-proto')?.split(',')[0].trim() === 'https' ? 'https' : 'http';
  return new URL(protocol + '://' + host);
}

/** Runtime origin keeps one standalone image portable across deployments. */
export async function getPageMetadata(page: {
  slugs: string[];
  data: { title: string; description?: string };
}): Promise<Metadata> {
  // Read request headers even with APP_ORIGIN so build-time rendering cannot
  // bake a different deployment's origin into generated Open Graph metadata.
  const requestHeaders = await headers();
  return {
    title: page.data.title,
    description: page.data.description,
    openGraph: {
      images: new URL(getPageImageUrl(page).url, metadataOrigin(requestHeaders)).href,
    },
  };
}
