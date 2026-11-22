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

import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '@/workers/sign-in-router/src/index.js';

const env = {
  PUBLIC_HOST: 'learn.example.test',
  AUTH_SIGN_IN_URL: 'https://auth.example.test/oauth2/sign_in',
  AUTH_SESSION_COOKIE_NAME: '__Secure-reader_auth',
};
const appOrigin = `https://${env.PUBLIC_HOST}`;
const sessionUrl = `${appOrigin}/api/auth/session`;
const logoutHeader = 'X-AutoDidact-Logout-URL';

test('the session check returns a logout URL only after OAuth2 Proxy accepts the session', async (t) => {
  const cookies = ['__Secure-reader_auth_0=first', '__Secure-reader_auth_1=second'];
  const refreshed = cookies.map((cookie) => `${cookie}; Path=/; Domain=example.test; Secure; HttpOnly`);
  const authResponse = new Response(null, { status: 202 });
  for (const cookie of refreshed) authResponse.headers.append('Set-Cookie', cookie);
  const fetch = t.mock.method(globalThis, 'fetch', async (_url: URL, _options: RequestInit) => authResponse);

  const response = await worker.fetch(
    new Request(sessionUrl, {
      headers: { Cookie: [...cookies, 'other=value', '__Secure-reader_auth_csrf=value'].join('; ') },
    }),
    env,
  );

  assert.deepEqual(fetch.mock.calls.map(({ arguments: args }) => args), [
    [
      new URL('https://auth.example.test/oauth2/auth'),
      { cache: 'no-store', headers: { Cookie: cookies.join('; ') }, redirect: 'manual' },
    ],
  ]);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.deepEqual(response.headers.getSetCookie(), refreshed);
  const logoutUrl = new URL(response.headers.get(logoutHeader)!);
  assert.equal(logoutUrl.origin + logoutUrl.pathname, 'https://auth.example.test/oauth2/sign_out');
  assert.equal(logoutUrl.searchParams.get('rd'), `${appOrigin}/`);
});

test('missing, rejected or unverifiable sessions receive no logout URL', async (t) => {
  let authStatus = 401;
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: authStatus }));
  const anonymous = await worker.fetch(new Request(sessionUrl, { headers: { Cookie: 'other=value' } }), env);
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.headers.get(logoutHeader), null);
  assert.equal(fetch.mock.callCount(), 0);

  for (const status of [401, 200, 302, 500]) {
    authStatus = status;
    const response = await worker.fetch(
      new Request(sessionUrl, { headers: { Cookie: '__Secure-reader_auth=invalid' } }),
      env,
    );
    assert.equal(response.status, status === 401 ? 401 : 503);
    assert.equal(response.headers.get(logoutHeader), null);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  }
});

test('normal navigation still redirects to sign-in and API requests keep the 401', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 401 }));
  const headers = { 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document' };
  const pageUrl = `${appOrigin}/courses/course/lesson`;
  const page = await worker.fetch(new Request(pageUrl, { headers }), env);
  assert.equal(page.status, 302);
  const signIn = new URL(page.headers.get('Location')!);
  assert.equal(signIn.origin + signIn.pathname, env.AUTH_SIGN_IN_URL);
  assert.equal(signIn.searchParams.get('rd'), pageUrl);

  const api = await worker.fetch(new Request(`${appOrigin}/api/health`, { headers }), env);
  assert.equal(api.status, 401);
});
