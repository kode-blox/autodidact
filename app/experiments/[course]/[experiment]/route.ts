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

import { getCoursePublication } from '@/lib/content/library';

export async function GET(_request: Request, { params }: RouteContext<'/experiments/[course]/[experiment]'>) {
  const ids = await params;
  const publication = await getCoursePublication();
  const experiment = publication.getCourse(ids.course)?.experiments.find((item) => item.id === ids.experiment);

  return experiment
    ? new Response(experiment.html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy':
            "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'self'",
          'X-Content-Type-Options': 'nosniff',
          ...(publication.externalEnabled ? { 'Cache-Control': 'no-store' } : {}),
        },
      })
    : new Response('Experiment not found', { status: 404 });
}
