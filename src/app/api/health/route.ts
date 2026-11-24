export async function GET() {
  return Response.json({ ok: true, service: "arevei-gtm", time: new Date().toISOString() });
}
