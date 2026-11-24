import { NextResponse, type NextRequest } from "next/server";
import { verifyUnsubscribeToken } from "@/server/modules/channels/email";
import { recordUnsubscribe } from "@/server/modules/inbound/service";
import { ipHash } from "@/server/auth/tokens";
import { env } from "@/lib/env";

function parse(token: string) {
  const [payload, sig] = decodeURIComponent(token).split(".");
  return payload && sig ? verifyUnsubscribeToken(payload, sig) : null;
}

/** RFC 8058 one-click unsubscribe (List-Unsubscribe-Post). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = parse(token);
  if (!data) return NextResponse.json({ ok: false, error: "Invalid link" }, { status: 400 });
  await recordUnsubscribe(data.workspaceId, { email: data.email, messageId: data.messageId, method: "list_unsubscribe_header", ipHash: ipHash(req.headers.get("x-forwarded-for")?.split(",")[0]), token: decodeURIComponent(token) });
  return NextResponse.json({ ok: true });
}

/** Mail clients sometimes GET the header URL; show the confirmation page instead of acting. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return NextResponse.redirect(new URL(`/u/${token}`, env().APP_BASE_URL));
}
