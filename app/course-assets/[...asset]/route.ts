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

import { extname } from 'node:path';
import { notFound } from 'next/navigation';
import { getCoursePublication } from '@/lib/content/library';

const imageTypes = new Map([
  ['avif', 'image/avif'],
  ['gif', 'image/gif'],
  ['jpeg', 'image/jpeg'],
  ['jpg', 'image/jpeg'],
  ['png', 'image/png'],
  ['webp', 'image/webp'],
]);

export async function GET(_request: Request, { params }: RouteContext<'/course-assets/[...asset]'>) {
  const publication = await getCoursePublication();
  if (!publication.externalEnabled) notFound();

  const { asset } = await params;
  const url = '/course-assets/' + asset.map(encodeURIComponent).join('/');
  const bytes = publication.assets.get(url);
  const headers = new Headers({ 'Cache-Control': 'private, no-store' });
  if (!bytes) return new Response(null, { status: 404, headers });

  const extension = extname(asset.at(-1) ?? '')
    .slice(1)
    .toLowerCase();
  const imageType = imageTypes.get(extension);
  headers.set('Content-Type', imageType ?? 'application/octet-stream');
  if (!imageType) headers.set('Content-Disposition', 'attachment');
  headers.set('Content-Security-Policy', "sandbox; default-src 'none'");
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(bytes, { headers });
}
