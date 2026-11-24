import type { EnrichmentProvider, EnrichmentResult, PeopleSearchProvider, PersonRecord, ProviderDescriptor, UsageSink } from "@/server/providers/types";
import { providerFetch } from "@/server/providers/http";

/**
 * People Data Labs adapter (Person Search + Person Enrichment, API v5).
 * https://docs.peopledatalabs.com. Live verification pending credentials.
 */
interface Creds {
  apiKey: string;
}
type Config = Record<string, never>;
const BASE = "https://api.peopledatalabs.com/v5";

interface PdlPerson {
  id: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  job_title?: string;
  job_title_levels?: string[];
  job_title_role?: string;
  headline?: string;
  work_email?: string;
  emails?: { address: string; type?: string }[];
  linkedin_url?: string;
  twitter_url?: string;
  location_name?: string;
  location_country?: string;
  phone_numbers?: string[];
  job_company_id?: string;
  job_company_name?: string;
  job_company_website?: string;
  job_company_linkedin_url?: string;
  job_company_industry?: string;
  job_company_size?: string;
  job_company_location_name?: string;
}

function sizeToHeadcount(size?: string): number | undefined {
  if (!size) return undefined;
  const m = /^(\d+)/.exec(size);
  return m ? Number(m[1]) : undefined;
}

function mapPerson(p: PdlPerson): PersonRecord {
  const linkedin = p.linkedin_url ? (p.linkedin_url.startsWith("http") ? p.linkedin_url : `https://${p.linkedin_url}`) : undefined;
  return {
    providerRecordId: p.id,
    firstName: p.first_name,
    lastName: p.last_name,
    fullName: p.full_name ?? [p.first_name, p.last_name].filter(Boolean).join(" "),
    title: p.job_title,
    seniority: p.job_title_levels?.[0],
    function: p.job_title_role,
    headline: p.headline,
    email: p.work_email ?? p.emails?.find((e) => e.type === "professional")?.address,
    emailStatus: p.work_email ? "risky" : "unknown",
    phone: p.phone_numbers?.[0],
    linkedinUrl: linkedin,
    xHandle: p.twitter_url ? p.twitter_url.split("/").filter(Boolean).pop() : undefined,
    location: p.location_name,
    country: p.location_country,
    company: p.job_company_name
      ? {
          providerRecordId: p.job_company_id,
          name: p.job_company_name,
          domain: p.job_company_website?.replace(/^https?:\/\//, "").replace(/\/.*$/, ""),
          website: p.job_company_website,
          linkedinUrl: p.job_company_linkedin_url,
          industry: p.job_company_industry,
          headcount: sizeToHeadcount(p.job_company_size),
          headcountRange: p.job_company_size,
          location: p.job_company_location_name,
        }
      : undefined,
    sourceUrl: linkedin,
  };
}

function buildEsQuery(c: Parameters<PeopleSearchProvider["searchPeople"]>[0]) {
  const must: unknown[] = [];
  const mustNot: unknown[] = [];
  if (c.titles?.length) must.push({ bool: { should: c.titles.map((t) => ({ match_phrase: { job_title: t } })) } });
  if (c.excludeTitles?.length) mustNot.push({ bool: { should: c.excludeTitles.map((t) => ({ match_phrase: { job_title: t } })) } });
  if (c.seniorities?.length) must.push({ terms: { job_title_levels: c.seniorities.map((s) => s.toLowerCase()) } });
  if (c.functions?.length) must.push({ terms: { job_title_role: c.functions.map((s) => s.toLowerCase()) } });
  if (c.countries?.length) must.push({ terms: { location_country: c.countries.map((s) => s.toLowerCase()) } });
  if (c.locations?.length) must.push({ bool: { should: c.locations.map((l) => ({ match: { location_name: l } })) } });
  if (c.industries?.length) must.push({ terms: { job_company_industry: c.industries.map((s) => s.toLowerCase()) } });
  if (c.companyDomains?.length) must.push({ terms: { job_company_website: c.companyDomains } });
  if (c.excludeCompanyDomains?.length) mustNot.push({ terms: { job_company_website: c.excludeCompanyDomains } });
  if (c.companyNames?.length) must.push({ bool: { should: c.companyNames.map((n) => ({ match_phrase: { job_company_name: n } })) } });
  if (c.companySizeMin || c.companySizeMax) {
    const sizes = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5001-10000", "10001+"].filter((band) => {
      const [lo, hi] = band.replace("+", "-1000000").split("-").map(Number);
      return (!c.companySizeMin || hi >= c.companySizeMin) && (!c.companySizeMax || lo <= c.companySizeMax);
    });
    must.push({ terms: { job_company_size: sizes } });
  }
  if (c.keywords?.length || c.semanticQuery) must.push({ match: { summary: [c.semanticQuery, ...(c.keywords ?? [])].filter(Boolean).join(" ") } });
  must.push({ exists: { field: "job_title" } });
  return { bool: { must, must_not: mustNot } };
}

function createPdl(creds: Creds, _config: Config, usage: UsageSink): PeopleSearchProvider & EnrichmentProvider {
  const headers = { "Content-Type": "application/json", "X-Api-Key": creds.apiKey };
  return {
    id: "pdl",
    category: "people_data",
    async testConnection() {
      const started = Date.now();
      try {
        // Lightweight, no-credit call: enrichment with an impossible profile returns 404 when the key works.
        await providerFetch("pdl", `${BASE}/person/enrich?profile=linkedin.com/in/this-profile-does-not-exist-arevei`, { headers }).catch((err) => {
          if ((err as { code?: string }).code !== "not_found") throw err;
        });
        return { ok: true, message: "Connected to People Data Labs", latencyMs: Date.now() - started };
      } catch (err) {
        return { ok: false, message: (err as Error).message, latencyMs: Date.now() - started };
      }
    },
    async estimateSearch(criteria) {
      const { data } = await providerFetch<{ total?: number }>("pdl", `${BASE}/person/search`, {
        method: "POST",
        headers,
        body: JSON.stringify({ query: buildEsQuery(criteria), size: 1, pretty: false }),
      });
      usage({ operation: "people.search.estimate", units: 1, unitLabel: "records" });
      return { totalEstimate: data.total, creditsPerRecord: 1, note: "PDL charges one credit per returned record." };
    },
    async searchPeople(criteria) {
      const size = Math.min(criteria.limit, 100);
      const { data } = await providerFetch<{ data?: PdlPerson[]; total?: number; scroll_token?: string }>("pdl", `${BASE}/person/search`, {
        method: "POST",
        headers,
        body: JSON.stringify({ query: buildEsQuery(criteria), size, scroll_token: criteria.cursor, pretty: false }),
      });
      const people = (data.data ?? []).map(mapPerson);
      usage({ operation: "people.search", units: people.length, unitLabel: "records", estimatedCostCents: people.length * 10 });
      return { people, nextCursor: data.scroll_token, totalEstimate: data.total };
    },
    async enrichPerson(input) {
      const params = new URLSearchParams();
      if (input.email) params.set("email", input.email);
      if (input.linkedinUrl) params.set("profile", input.linkedinUrl);
      if (input.firstName) params.set("first_name", input.firstName);
      if (input.lastName) params.set("last_name", input.lastName);
      if (input.companyName) params.set("company", input.companyName);
      params.set("min_likelihood", "6");
      let data: { data?: PdlPerson; likelihood?: number } | undefined;
      try {
        ({ data } = await providerFetch<{ data?: PdlPerson; likelihood?: number }>("pdl", `${BASE}/person/enrich?${params}`, { headers }));
      } catch (err) {
        if ((err as { code?: string }).code === "not_found") return { found: false, fields: {} };
        throw err;
      }
      usage({ operation: "people.enrich", units: 1, unitLabel: "lookups", estimatedCostCents: 10 });
      if (!data?.data) return { found: false, fields: {} };
      const p = mapPerson(data.data);
      const conf = Math.min(1, (data.likelihood ?? 6) / 10);
      const f: EnrichmentResult["fields"] = {};
      if (p.email) f.email = { value: p.email, confidence: conf * 0.8, verified: false };
      if (p.title) f.title = { value: p.title, confidence: conf };
      if (p.linkedinUrl) f.linkedinUrl = { value: p.linkedinUrl, confidence: conf };
      if (p.phone) f.phone = { value: p.phone, confidence: conf * 0.6 };
      if (p.location) f.location = { value: p.location, confidence: conf };
      if (p.country) f.country = { value: p.country, confidence: conf };
      if (p.headline) f.headline = { value: p.headline, confidence: conf };
      if (p.company?.name) f.companyName = { value: p.company.name, confidence: conf };
      if (p.company?.domain) f.companyDomain = { value: p.company.domain, confidence: conf };
      if (p.company?.headcount) f.companyHeadcount = { value: p.company.headcount, confidence: conf * 0.7 };
      if (p.company?.industry) f.companyIndustry = { value: p.company.industry, confidence: conf * 0.8 };
      return { found: true, providerRecordId: p.providerRecordId, fields: f };
    },
  };
}

export const pdlDescriptor: ProviderDescriptor<Creds, Config> = {
  id: "pdl",
  category: "people_data",
  displayName: "People Data Labs",
  description: "Person search and enrichment over a large professional dataset.",
  docsUrl: "https://docs.peopledatalabs.com",
  capabilities: ["people.search", "people.enrich"],
  credentialFields: [{ key: "apiKey", label: "API key", type: "secret", required: true }],
  configFields: [],
  systemEnvKeys: ["PEOPLE_DATA_LABS_API_KEY"],
  credentialsFromEnv: (env) => (env.PEOPLE_DATA_LABS_API_KEY ? { apiKey: env.PEOPLE_DATA_LABS_API_KEY } : null),
  create: ({ credentials, config, usage }) => createPdl(credentials, config as Config, usage),
};
