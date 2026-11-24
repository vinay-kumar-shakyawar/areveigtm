import { NextResponse, type NextRequest } from "next/server";
import { completeMailboxConnect, completeXConnect, exchangeCode, verifyState, type OAuthProvider } from "@/server/modules/senders/oauth";
import { open } from "@/server/vault";
import { env } from "@/lib/env";
import { logger } from "@/server/logger";

/** OAuth redirect target. Validates state + nonce cookie, exchanges the code, stores tokens server-side. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const p = provider as OAuthProvider;
  const state = verifyState(req.nextUrl.searchParams.get("state"));
  const fail = (slug: string | undefined, reason: string) => NextResponse.redirect(new URL(`/w/${slug ?? ""}/integrations/senders?oauth=${p}&error=${encodeURIComponent(reason)}`, env().APP_BASE_URL));
  if (!state || state.provider !== p) return fail(undefined, "invalid_state");
  const cookie = req.cookies.get(`arevei_oauth_${p}`)?.value;
  let nonceData: { nonce: string; verifier: string | null } | null = null;
  try {
    if (cookie) nonceData = JSON.parse(open(JSON.parse(Buffer.from(cookie, "base64url").toString("utf8")), `oauth:${p}`));
  } catch {
    nonceData = null;
  }
  if (!nonceData || nonceData.nonce !== state.nonce) return fail(state.workspaceSlug, "nonce_mismatch");
  const code = req.nextUrl.searchParams.get("code");
  const providerError = req.nextUrl.searchParams.get("error");
  if (providerError || !code) return fail(state.workspaceSlug, providerError ?? "no_code");
  try {
    const tokens = await exchangeCode(p, code, nonceData.verifier ?? undefined);
    if (p === "x") await completeXConnect(state, tokens as Parameters<typeof completeXConnect>[1]);
    else await completeMailboxConnect(state, tokens as Parameters<typeof completeMailboxConnect>[1]);
  } catch (err) {
    logger.warn({ err, provider: p }, "oauth connect failed");
    return fail(state.workspaceSlug, (err as Error).message.slice(0, 120));
  }
  const res = NextResponse.redirect(new URL(`/w/${state.workspaceSlug}/integrations/senders?oauth=${p}&connected=1`, env().APP_BASE_URL));
  res.cookies.delete(`arevei_oauth_${p}`);
  return res;
}
