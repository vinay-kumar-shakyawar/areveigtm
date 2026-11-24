import type { EnrichmentProvider, EnrichmentResult, PeopleSearchCriteria, PeopleSearchProvider, PersonRecord, ProviderDescriptor, SearchEstimate, UsageSink } from "@/server/providers/types";
import { ProviderError } from "@/server/providers/types";
import { providerFetch } from "@/server/providers/http";

/**
 * Hunter.io adapter. https://hunter.io/api-documentation/v2
 *
 * People search is a two-step pipeline on Hunter's own endpoints:
 *   1. Discover (POST /discover, free) turns company criteria into a list of
 *      company domains.
 *   2. Domain Search (GET /domain-search) lists the people at each domain,
 *      filtered by job title, seniority and department. Each call that returns
 *      at least one person costs one Hunter search credit.
 * Observed on the free plan (2026-11-22): Discover returns only the first 100
 * companies (offset must be 0), Domain Search returns at most 10 people per
 * domain, and sending a natural-language `query` to Discover makes Hunter
 * ignore every structured filter. The adapter therefore sends structured
 * filters whenever it has any and falls back to `query` only otherwise.
 */
interface Creds {
  apiKey: string;
}
interface Config {
  /** People requested per company during search (1-10; Hunter's free plan caps a domain search at 10). */
  peoplePerCompany?: number;
}
const BASE = "https://api.hunter.io/v2";
const DISCOVER_PAGE = 100;
const MAX_COMPANIES_PER_PAGE = 25;

const HEADCOUNT_BANDS: [string, number, number][] = [
  ["1-10", 1, 10],
  ["11-50", 11, 50],
  ["51-200", 51, 200],
  ["201-500", 201, 500],
  ["501-1000", 501, 1000],
  ["1001-5000", 1001, 5000],
  ["5001-10000", 5001, 10000],
  ["10001+", 10001, Number.MAX_SAFE_INTEGER],
];

const DEPARTMENTS: [RegExp, string][] = [
  [/founder|owner|c-level|cxo|chief|executive|leadership/i, "executive"],
  [/engineer|developer|software|technolog|\bit\b|devops|data|security|infra/i, "it"],
  [/financ|account|treasur|controller|cfo/i, "finance"],
  [/sales|revenue|business development|account exec|\bsdr\b|\bbdr\b/i, "sales"],
  [/marketing|growth|demand|brand|content|seo/i, "marketing"],
  [/legal|counsel|compliance/i, "legal"],
  [/support|customer success|customer service|success/i, "support"],
  [/\bhr\b|human resources|people|talent|recruit/i, "hr"],
  [/communication|\bpr\b|public relations|press/i, "communication"],
  [/education|training|learning/i, "education"],
  [/design|ux|ui|creative/i, "design"],
  [/health|medical|clinical/i, "health"],
  [/operations|ops|logistics|supply/i, "operations"],
  [/product/i, "product"],
  [/research|scien|r&d/i, "research"],
  [/consult|advisor/i, "consulting"],
  [/admin|office|assistant/i, "administrative"],
  [/procure|purchas|sourcing/i, "procurement"],
  [/manage|management|general manager|\bgm\b/i, "management"],
];

const SENIORITY: [RegExp, string][] = [
  [/founder|owner|c-level|cxo|chief|\bc[a-z]o\b|president|partner|executive|\bvp\b|vice president|head|director/i, "executive"],
  [/senior|manager|lead|principal|staff/i, "senior"],
  [/junior|entry|associate|intern|graduate|trainee/i, "junior"],
];

/** Map free-form criteria values onto Hunter's fixed enum; unknown values are dropped. */
function mapEnum(values: string[] | undefined, table: [RegExp, string][]): string[] {
  const out = new Set<string>();
  for (const v of values ?? []) {
    const direct = table.find(([, id]) => id === v.trim().toLowerCase());
    const hit = direct ?? table.find(([re]) => re.test(v));
    if (hit) out.add(hit[1]);
  }
  return [...out];
}

function headcountBands(min?: number, max?: number): string[] | undefined {
  if (!min && !max) return undefined;
  return HEADCOUNT_BANDS.filter(([, lo, hi]) => (!min || hi >= min) && (!max || lo <= max)).map(([id]) => id);
}

function cleanDomain(d: string): string {
  return d
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
}

interface DiscoverFilters {
  headcount?: string[];
  headquarters_location?: { include: { country: string }[] };
  keywords?: { include: string[]; match: "any" | "all" };
  organization?: { name?: string[]; exclude?: { domain?: string[] } };
}

/** Build the Discover request. Returns either structured filters or a natural-language query, never both. */
export function buildDiscoverBody(c: PeopleSearchCriteria): { query: string } | DiscoverFilters | null {
  const filters: DiscoverFilters = {};
  const headcount = headcountBands(c.companySizeMin, c.companySizeMax);
  if (headcount?.length && headcount.length < HEADCOUNT_BANDS.length) filters.headcount = headcount;
  const countries = (c.countries ?? []).map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z]{2}$/.test(x));
  if (countries.length) filters.headquarters_location = { include: countries.map((country) => ({ country })) };
  const keywords = [...(c.industries ?? []), ...(c.keywords ?? []), ...(c.technologies ?? [])].map((k) => k.trim().toLowerCase()).filter((k) => k && /^[\p{L}\p{N} .&+\-/]+$/u.test(k));
  if (keywords.length) filters.keywords = { include: [...new Set(keywords)].slice(0, 50), match: "any" };
  if (c.companyNames?.length) filters.organization = { ...filters.organization, name: c.companyNames.map((n) => n.trim()).filter(Boolean).slice(0, 25) };
  if (c.excludeCompanyDomains?.length) filters.organization = { ...filters.organization, exclude: { domain: c.excludeCompanyDomains.map(cleanDomain).slice(0, 100) } };
  if (Object.keys(filters).length) return filters;
  const query = [c.semanticQuery, c.industries?.length ? `${c.industries.join(", ")} companies` : null, c.locations?.length ? `in ${c.locations.join(", ")}` : null].filter(Boolean).join(" ").trim();
  return query ? { query } : null;
}

interface Cursor {
  /** Index of the next company to search within the Discover result list. */
  i: number;
  /** Filters Hunter applied to the first page, reused for later pages as the docs recommend. */
  f: DiscoverFilters | null;
  q: string | null;
}

function parseCursor(raw?: string): Cursor | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as Cursor;
    return typeof c.i === "number" ? c : null;
  } catch {
    return null;
  }
}

interface DiscoverCompany {
  domain: string;
  organization?: string;
  emails_count?: { personal?: number; generic?: number; total?: number };
}
interface HunterEmail {
  value: string;
  type?: string;
  provenance?: string;
  confidence?: number;
  first_name?: string | null;
  last_name?: string | null;
  position?: string | null;
  seniority?: string | null;
  department?: string | null;
  linkedin?: string | null;
  twitter?: string | null;
  phone_number?: string | null;
  verification?: { status?: string | null } | null;
  sources?: { uri?: string }[];
}

function mapStatus(s?: string | null): "valid" | "risky" | "invalid" | "catch_all" | "unknown" {
  if (s === "valid" || s === "deliverable") return "valid";
  if (s === "accept_all") return "catch_all";
  if (s === "invalid" || s === "undeliverable") return "invalid";
  if (s === "risky" || s === "webmail" || s === "disposable") return "risky";
  return "unknown";
}

function mapPerson(e: HunterEmail, company: { domain: string; name?: string | null }, titleMatch: boolean): PersonRecord {
  const fullName = [e.first_name, e.last_name].filter(Boolean).join(" ") || e.value;
  return {
    providerRecordId: e.value.toLowerCase(),
    firstName: e.first_name ?? undefined,
    lastName: e.last_name ?? undefined,
    fullName,
    title: e.position ?? undefined,
    seniority: e.seniority ?? undefined,
    function: e.department ?? undefined,
    email: e.value,
    emailStatus: e.verification?.status ? mapStatus(e.verification.status) : e.provenance === "inferred" ? "risky" : "unknown",
    phone: e.phone_number ?? undefined,
    linkedinUrl: e.linkedin ?? undefined,
    xHandle: e.twitter ?? undefined,
    company: { name: company.name || company.domain, domain: company.domain, website: `https://${company.domain}` },
    sourceUrl: e.linkedin ?? e.sources?.[0]?.uri ?? undefined,
    raw: { provenance: e.provenance, confidence: e.confidence, titleMatch },
  };
}

function createHunter(creds: Creds, config: Config, usage: UsageSink): PeopleSearchProvider & EnrichmentProvider {
  const key = creds.apiKey;
  const perCompany = Math.min(10, Math.max(1, Number(config.peoplePerCompany) || 5));
  const auth = { "X-API-KEY": key };

  async function discover(body: { query: string } | DiscoverFilters, offset: number) {
    const { data } = await providerFetch<{ data?: DiscoverCompany[]; meta?: { results?: number; filters?: DiscoverFilters } }>("hunter", `${BASE}/discover`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, limit: DISCOVER_PAGE, offset }),
    });
    usage({ operation: "company.discover", units: 1, unitLabel: "calls", estimatedCostCents: 0 });
    return { companies: (data.data ?? []).filter((c) => c.domain), total: data.meta?.results ?? 0, filters: data.meta?.filters ?? null };
  }

  async function domainSearch(domain: string, c: PeopleSearchCriteria, withTitles: boolean) {
    const q = new URLSearchParams({ domain, type: "personal", required_field: "full_name", limit: String(perCompany) });
    const seniority = mapEnum(c.seniorities, SENIORITY);
    if (seniority.length) q.set("seniority", seniority.join(","));
    const department = mapEnum(c.functions, DEPARTMENTS);
    if (department.length) q.set("department", department.join(","));
    if (withTitles && c.titles?.length) q.set("job_titles", c.titles.map((t) => t.replace(/,/g, " ").trim()).filter(Boolean).join(","));
    const { data, headers } = await providerFetch<{ data?: { domain?: string | null; organization?: string | null; emails?: HunterEmail[] }; meta?: { results?: number } }>("hunter", `${BASE}/domain-search?${q}`, { headers: auth });
    const emails = data.data?.emails ?? [];
    const credits = Number(headers.get("x-credits-used") ?? (emails.length ? 1 : 0)) || 0;
    usage({ operation: "people.search", units: emails.length, unitLabel: "records", metadata: { domain, credits } });
    return { emails, organization: data.data?.organization ?? null, credits };
  }

  async function companiesFor(c: PeopleSearchCriteria, cursor: Cursor | null): Promise<{ companies: DiscoverCompany[]; total: number; cursor: Cursor; exhausted: boolean }> {
    if (c.companyDomains?.length) {
      const domains = [...new Set(c.companyDomains.map(cleanDomain).filter(Boolean))];
      return { companies: domains.map((domain) => ({ domain })), total: domains.length, cursor: { i: cursor?.i ?? 0, f: null, q: null }, exhausted: true };
    }
    const body = cursor?.f ?? (cursor?.q ? { query: cursor.q } : buildDiscoverBody(c));
    if (!body) {
      throw new ProviderError("hunter", "invalid_request", "Add an industry, keyword, country code, company size, company name or a description so Hunter can find matching companies.");
    }
    const start = cursor?.i ?? 0;
    const offset = Math.floor(start / DISCOVER_PAGE) * DISCOVER_PAGE;
    let page: Awaited<ReturnType<typeof discover>>;
    try {
      page = await discover(body, offset);
    } catch (err) {
      // Plans without Discover paging stop after the first page; treat that as the end of results rather than a failure.
      if (offset > 0 && err instanceof ProviderError && /pagination|first page/i.test(err.message)) return { companies: [], total: 0, cursor: { i: start, f: cursor?.f ?? null, q: cursor?.q ?? null }, exhausted: true };
      throw err;
    }
    const next: Cursor = { i: start, f: "query" in body ? page.filters : (body as DiscoverFilters), q: "query" in body ? body.query : null };
    return { companies: page.companies, total: page.total, cursor: next, exhausted: offset + page.companies.length >= page.total };
  }

  async function findEmail(input: { firstName: string; lastName: string; companyDomain: string }): Promise<EnrichmentResult> {
    const q = new URLSearchParams({ domain: input.companyDomain, first_name: input.firstName, last_name: input.lastName });
    const { data } = await providerFetch<{ data?: { email?: string; score?: number; position?: string; linkedin_url?: string; verification?: { status?: string } } }>("hunter", `${BASE}/email-finder?${q}`, { headers: auth });
    usage({ operation: "email.find", units: 1, unitLabel: "lookups" });
    const d = data.data;
    if (!d?.email) return { found: false, fields: {} };
    const f: EnrichmentResult["fields"] = {
      email: { value: d.email, confidence: (d.score ?? 50) / 100, verified: d.verification?.status === "valid" },
      emailStatus: { value: mapStatus(d.verification?.status), confidence: 0.8 },
    };
    if (d.position) f.title = { value: d.position, confidence: 0.5 };
    if (d.linkedin_url) f.linkedinUrl = { value: d.linkedin_url, confidence: 0.7 };
    return { found: true, fields: f };
  }

  return {
    id: "hunter",
    category: "people_data",
    async testConnection() {
      const started = Date.now();
      try {
        const { data } = await providerFetch<{ data?: { email?: string; requests?: { searches?: { used: number; available: number } } } }>("hunter", `${BASE}/account`, { headers: auth });
        const s = data.data?.requests?.searches;
        return { ok: true, message: `Connected as ${data.data?.email ?? "account"}${s ? ` (${s.used}/${s.available} searches used)` : ""}`, latencyMs: Date.now() - started };
      } catch (err) {
        return { ok: false, message: (err as Error).message, latencyMs: Date.now() - started };
      }
    },

    async estimateSearch(criteria): Promise<SearchEstimate> {
      const { companies, total } = await companiesFor(criteria, null);
      const reachable = companies.reduce((sum, c) => sum + Math.min(perCompany, c.emails_count?.personal ?? perCompany), 0);
      let remaining: number | undefined;
      try {
        const { data } = await providerFetch<{ data?: { requests?: { searches?: { available: number; used: number } } } }>("hunter", `${BASE}/account`, { headers: auth });
        const s = data.data?.requests?.searches;
        if (s) remaining = s.available - s.used;
      } catch {
        /* estimate still useful without the quota */
      }
      const note = [
        `Hunter found ${total.toLocaleString()} matching compan${total === 1 ? "y" : "ies"}; about ${reachable.toLocaleString()} people are reachable from the first ${companies.length} with up to ${perCompany} per company.`,
        `Each company that returns people costs 1 Hunter search credit${remaining !== undefined ? ` (${remaining} left this period)` : ""}.`,
      ].join(" ");
      return { totalEstimate: reachable, creditsPerRecord: 1 / perCompany, note };
    },

    async searchPeople(criteria) {
      const { companies, total, cursor, exhausted } = await companiesFor(criteria, parseCursor(criteria.cursor));
      const perPage = Math.min(MAX_COMPANIES_PER_PAGE, Math.max(1, Math.ceil(criteria.limit / perCompany)));
      const startInPage = cursor.i % DISCOVER_PAGE;
      const slice = companies.slice(startInPage, startInPage + perPage);
      const exclude = (criteria.excludeTitles ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean);
      const people: PersonRecord[] = [];
      for (const company of slice) {
        let res = await domainSearch(company.domain, criteria, true);
        let titleMatch = true;
        if (res.emails.length === 0 && criteria.titles?.length) {
          // No one with those titles is known at this company; fall back to seniority/department so the page is not empty. Flagged in raw.titleMatch.
          res = await domainSearch(company.domain, criteria, false);
          titleMatch = false;
        }
        for (const e of res.emails) {
          if (e.type === "generic") continue;
          const pos = (e.position ?? "").toLowerCase();
          if (exclude.some((x) => pos.includes(x))) continue;
          people.push(mapPerson(e, { domain: company.domain, name: res.organization ?? company.organization }, titleMatch));
        }
      }
      const nextIndex = cursor.i + slice.length;
      const more = startInPage + slice.length < companies.length || !exhausted;
      return {
        people,
        nextCursor: more && slice.length > 0 ? JSON.stringify({ ...cursor, i: nextIndex } satisfies Cursor) : undefined,
        totalEstimate: criteria.companyDomains?.length ? undefined : Math.min(total, DISCOVER_PAGE) * perCompany,
      };
    },

    async enrichPerson(input) {
      if (input.firstName && input.lastName && input.companyDomain) return findEmail({ firstName: input.firstName, lastName: input.lastName, companyDomain: input.companyDomain });
      if (input.email) {
        const v = await this.verifyEmail!(input.email);
        return { found: v.status !== "unknown", fields: { emailStatus: { value: v.status, confidence: 0.9 } } };
      }
      return { found: false, fields: {} };
    },
    findEmail,
    async verifyEmail(email) {
      const { data } = await providerFetch<{ data?: { status?: string; score?: number } }>("hunter", `${BASE}/email-verifier?email=${encodeURIComponent(email)}`, { headers: auth });
      usage({ operation: "email.verify", units: 1, unitLabel: "verifications" });
      return { status: mapStatus(data.data?.status), score: data.data?.score };
    },
  };
}

export const hunterDescriptor: ProviderDescriptor<Creds, Config> = {
  id: "hunter",
  category: "people_data",
  displayName: "Hunter",
  description: "Find companies, list the people who work there with work emails, and find or verify addresses.",
  docsUrl: "https://hunter.io/api-documentation/v2",
  capabilities: ["people.search", "email.find", "email.verify", "people.enrich"],
  credentialFields: [{ key: "apiKey", label: "API key", type: "secret", required: true }],
  configFields: [{ key: "peoplePerCompany", label: "People per company", type: "number", default: 5, help: "How many people to pull from each matching company (1-10). Each company with results costs one Hunter search credit." }],
  systemEnvKeys: ["HUNTER_API_KEY"],
  credentialsFromEnv: (env) => (env.HUNTER_API_KEY ? { apiKey: env.HUNTER_API_KEY } : null),
  create: ({ credentials, config, usage }) => createHunter(credentials, config as Config, usage),
};
