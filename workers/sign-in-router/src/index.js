const privateHeaders = { "Cache-Control": "private, no-store" };

function isPageNavigation(request, pathname) {
  return (
    request.method === "GET" &&
    request.headers.get("Sec-Fetch-Mode") === "navigate" &&
    request.headers.get("Sec-Fetch-Dest") === "document" &&
    pathname !== "/api" &&
    !pathname.startsWith("/api/")
  );
}

function redirectToSignIn(value, returnUrl) {
  const signInUrl = new URL(value);
  if (
    signInUrl.protocol !== "https:" ||
    signInUrl.username ||
    signInUrl.password ||
    signInUrl.port ||
    signInUrl.search ||
    signInUrl.hash ||
    signInUrl.origin === returnUrl.origin
  ) {
    throw new Error("Invalid AUTH_SIGN_IN_URL");
  }

  signInUrl.searchParams.set("rd", returnUrl.href);
  return new Response(null, {
    status: 302,
    headers: { ...privateHeaders, Location: signInUrl.href },
  });
}

const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.origin !== `https://${env.PUBLIC_HOST}`) {
      return new Response("Not Found", { status: 404, headers: privateHeaders });
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
