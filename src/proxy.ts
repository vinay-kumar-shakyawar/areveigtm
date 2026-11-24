import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "arevei_session";

/**
 * Optimistic redirect for app routes when no session cookie is present.
 * Real authorization happens in the server layer (requireWorkspaceContext).
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasCookie = request.cookies.has(SESSION_COOKIE);
  if (!hasCookie && (pathname.startsWith("/w/") || pathname.startsWith("/workspaces"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/w/:path*", "/workspaces/:path*"],
};
