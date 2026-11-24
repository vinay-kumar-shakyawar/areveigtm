import "server-only";
import { promises as dns } from "node:dns";

/**
 * DNS checks for a sending domain. SPF and DMARC come straight from DNS; DKIM
 * is checked against common selectors and, where available, the provider's own
 * domain status. "unknown" means we could not find a record, not that none exists.
 */
export interface DomainAuthReport {
  domain: string;
  checkedAt: string;
  spf: { status: "pass" | "missing" | "error"; record?: string };
  dmarc: { status: "pass" | "missing" | "error"; policy?: string; record?: string };
  dkim: { status: "pass" | "unknown" | "error"; selectors: string[]; source: "dns" | "provider" | "none" };
  mx: { status: "pass" | "missing" | "error"; hosts?: string[] };
  providerVerified?: boolean | null;
}

const DKIM_SELECTORS = ["google", "selector1", "selector2", "resend", "s1", "s2", "k1", "k2", "mail", "default", "amazonses", "sendgrid", "em", "dkim"];

async function txt(name: string): Promise<string[] | null> {
  try {
    const rows = await dns.resolveTxt(name);
    return rows.map((r) => r.join(""));
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "ENOTFOUND" || code === "ENODATA") return [];
    return null;
  }
}

export async function checkDomainAuth(domain: string, provider?: { getDomainStatus?(d: string): Promise<{ spf?: boolean; dkim?: boolean; dmarc?: boolean; verified: boolean }> }): Promise<DomainAuthReport> {
  const d = domain.trim().toLowerCase();
  const [spfRows, dmarcRows, mx] = await Promise.all([
    txt(d),
    txt(`_dmarc.${d}`),
    dns.resolveMx(d).then((r) => r.sort((a, b) => a.priority - b.priority).map((x) => x.exchange)).catch((err: { code?: string }) => (err.code === "ENOTFOUND" || err.code === "ENODATA" ? [] : null)),
  ]);
  const spfRecord = spfRows?.find((r) => /^v=spf1/i.test(r));
  const dmarcRecord = dmarcRows?.find((r) => /^v=DMARC1/i.test(r));
  const dkimFound: string[] = [];
  await Promise.all(
    DKIM_SELECTORS.map(async (sel) => {
      const rows = await txt(`${sel}._domainkey.${d}`);
      if (rows?.some((r) => /v=DKIM1|k=rsa|p=/i.test(r))) dkimFound.push(sel);
    }),
  );
  let providerVerified: boolean | null = null;
  let providerDkim: boolean | undefined;
  if (provider?.getDomainStatus) {
    try {
      const s = await provider.getDomainStatus(d);
      providerVerified = s.verified;
      providerDkim = s.dkim;
    } catch {
      providerVerified = null;
    }
  }
  return {
    domain: d,
    checkedAt: new Date().toISOString(),
    spf: spfRows === null ? { status: "error" } : spfRecord ? { status: "pass", record: spfRecord } : { status: "missing" },
    dmarc: dmarcRows === null ? { status: "error" } : dmarcRecord ? { status: "pass", policy: /p=([a-z]+)/i.exec(dmarcRecord)?.[1]?.toLowerCase(), record: dmarcRecord } : { status: "missing" },
    dkim: dkimFound.length ? { status: "pass", selectors: dkimFound.sort(), source: "dns" } : providerDkim ? { status: "pass", selectors: [], source: "provider" } : { status: "unknown", selectors: [], source: "none" },
    mx: mx === null ? { status: "error" } : mx.length ? { status: "pass", hosts: mx } : { status: "missing" },
    providerVerified,
  };
}
