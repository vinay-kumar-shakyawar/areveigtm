import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { workspaceContextForUser } from "@/server/auth/context";
import { can } from "@/server/auth/rbac";
import { authorizationUrl, isConfigured, pkcePair, signState, type OAuthProvider } from "@/server/modules/senders/oauth";
import { seal } from "@/server/vault";
import { env } from "@/lib/env";

const PROVIDERS: OAuthProvider[] = ["google", "microsoft", "x"];

/** Starts an OAuth connect flow for the signed-in user's workspace. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!PROVIDERS.includes(provider as OAuthProvider)) return NextResponse.json({ error: { code: "not_found", message: "Unknown provider" } }, { status: 404 });
  const p = provider as OAuthProvider;
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL(`/sign-in?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`, env().APP_BASE_URL));
  const slug = req.nextUrl.searchParams.get("workspace");
  if (!slug) return NextResponse.json({ error: { code: "invalid_request", message: "workspace is required" } }, { status: 400 });
  const ctx = await workspaceContextForUser(user, slug);
  if (!can(ctx.role, "senders.manage")) return NextResponse.json({ error: { code: "forbidden", message: "Admins only" } }, { status: 403 });
  if (!isConfigured(p)) {
    return NextResponse.redirect(new URL(`/w/${ctx.workspaceSlug}/integrations/senders?oauth=${p}&error=not_configured`, env().APP_BASE_URL));
  }
  const { token, nonce } = signState({ workspaceId: ctx.workspaceId, workspaceSlug: ctx.workspaceSlug, userId: user.id, provider: p });
  const pkce = p === "x" ? pkcePair() : null;
  const res = NextResponse.redirect(authorizationUrl(p, token, pkce?.challenge));
  const sealed = seal(JSON.stringify({ nonce, verifier: pkce?.verifier ?? null }), `oauth:${p}`);
  res.cookies.set(`arevei_oauth_${p}`, Buffer.from(JSON.stringify(sealed)).toString("base64url"), { httpOnly: true, sameSite: "lax", secure: env().APP_BASE_URL.startsWith("https"), path: `/api/oauth/${p}`, maxAge: 600 });
  return res;
}
