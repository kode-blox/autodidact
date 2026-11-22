const privateHeaders = { "Cache-Control": "private, no-store" };
const sessionCheckPath = "/api/auth/session";

function isPageNavigation(request, pathname) {
  return (
    request.method === "GET" &&
    request.headers.get("Sec-Fetch-Mode") === "navigate" &&
    request.headers.get("Sec-Fetch-Dest") === "document" &&
    pathname !== "/api" &&
    !pathname.startsWith("/api/")
  );
}

function getSignInUrl(value, publicOrigin) {
  const signInUrl = new URL(value);
  if (
    signInUrl.protocol !== "https:" ||
    signInUrl.username ||
    signInUrl.password ||
    signInUrl.port ||
    signInUrl.search ||
    signInUrl.hash ||
    signInUrl.origin === publicOrigin
  ) {
    throw new Error("Invalid AUTH_SIGN_IN_URL");
  }
  return signInUrl;
}

function redirectToSignIn(value, returnUrl) {
  const signInUrl = getSignInUrl(value, returnUrl.origin);
  signInUrl.searchParams.set("rd", returnUrl.href);
  return new Response(null, {
    status: 302,
    headers: { ...privateHeaders, Location: signInUrl.href },
  });
}

function getSessionCookies(cookieHeader, cookieName) {
  if (!cookieHeader || !cookieName) return "";

  // OAuth2 Proxy splits larger session cookies into numbered chunks.
  const chunkPrefix = `${cookieName}_`;
  return cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .filter((cookie) => {
      const separator = cookie.indexOf("=");
      if (separator === -1) return false;
      const name = cookie.slice(0, separator);
      return name === cookieName || (
        name.startsWith(chunkPrefix) && /^\d+$/.test(name.slice(chunkPrefix.length))
      );
    })
    .join("; ");
}

async function checkSession(request, env, publicOrigin) {
  const cookie = getSessionCookies(request.headers.get("Cookie"), env.AUTH_SESSION_COOKIE_NAME);
  if (!cookie) return new Response(null, { status: 401, headers: privateHeaders });

  try {
    const signInUrl = getSignInUrl(env.AUTH_SIGN_IN_URL, publicOrigin);
    const response = await fetch(new URL("auth", signInUrl), {
      cache: "no-store",
      headers: { Cookie: cookie },
      redirect: "manual",
    });

    if (response.status !== 202 && response.status !== 401) {
      return new Response(null, { status: 503, headers: privateHeaders });
    }

    const headers = new Headers(privateHeaders);
    for (const value of response.headers.getSetCookie()) {
      headers.append("Set-Cookie", value);
    }
    if (response.status === 401) return new Response(null, { status: 401, headers });

    const logoutUrl = new URL("sign_out", signInUrl);
    logoutUrl.searchParams.set("rd", `${publicOrigin}/`);
    headers.set("X-AutoDidact-Logout-URL", logoutUrl.href);
    return new Response(null, { status: 204, headers });
  } catch {
    return new Response(null, { status: 503, headers: privateHeaders });
  }
}

const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.origin !== `https://${env.PUBLIC_HOST}`) {
      return new Response("Not Found", { status: 404, headers: privateHeaders });
    }

    if (request.method === "GET" && url.pathname === sessionCheckPath) {
      return checkSession(request, env, url.origin);
    }

    // Preserve the request, including its session cookie and body. Let the
    // browser apply its own cookie rules when it follows an origin redirect.
    const response = await fetch(request, { redirect: "manual" });
    if (response.status !== 401 || !isPageNavigation(request, url.pathname)) {
      return response;
    }

    try {
      return redirectToSignIn(env.AUTH_SIGN_IN_URL, url);
    } catch {
      return new Response("Worker sign-in configuration is invalid", {
        status: 500,
        headers: privateHeaders,
      });
    }
  },
};

export default worker;
