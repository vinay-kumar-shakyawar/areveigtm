/** Identity normalizers shared by import, search, enrichment and dedup. */

export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const e = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  return e;
}

/** `https://www.linkedin.com/in/Jane-Doe-123/` → `jane-doe-123` */
export function linkedinSlug(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /linkedin\.com\/in\/([^/?#]+)/i.exec(url.trim());
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]).toLowerCase().replace(/\/+$/, "");
  } catch {
    return m[1].toLowerCase();
  }
}

export function canonicalLinkedinUrl(url: string | null | undefined): string | null {
  const slug = linkedinSlug(url);
  return slug ? `https://www.linkedin.com/in/${slug}` : null;
}

/** `@JaneDoe`, `https://x.com/JaneDoe` → `janedoe` */
export function normalizeXHandle(handle: string | null | undefined): string | null {
  if (!handle) return null;
  let h = handle.trim();
  const m = /(?:twitter\.com|x\.com)\/([A-Za-z0-9_]{1,15})/i.exec(h);
  if (m) h = m[1];
  h = h.replace(/^@/, "").toLowerCase();
  return /^[a-z0-9_]{1,15}$/.test(h) ? h : null;
}

export function domainFromUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = input.trim().toLowerCase();
  if (!s) return null;
  try {
    const u = new URL(s.includes("://") ? s : `https://${s}`);
    return u.hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

export function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}
