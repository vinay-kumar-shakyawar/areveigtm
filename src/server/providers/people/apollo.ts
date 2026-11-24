import type { EnrichmentProvider, EnrichmentResult, PeopleSearchProvider, PersonRecord, ProviderDescriptor, UsageSink } from "@/server/providers/types";
import { providerFetch } from "@/server/providers/http";

/**
 * Apollo.io adapter. Endpoints follow Apollo's public REST API
 * (https://docs.apollo.io). Live verification pending credentials.
 */
interface Creds {
  apiKey: string;
}
type Config = Record<string, never>;

const BASE = "https://api.apollo.io/api/v1";

interface ApolloPerson {
  id: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  title?: string;
  seniority?: string;
  headline?: string;
  email?: string;
  email_status?: string;
  linkedin_url?: string;
  twitter_url?: string;
  city?: string;
  state?: string;
  country?: string;
  phone_numbers?: { sanitized_number?: string }[];
  organization?: {
    id?: string;
    name?: string;
    primary_domain?: string;
    website_url?: string;
    linkedin_url?: string;
    industry?: string;
    estimated_num_employees?: number;
    short_description?: string;
    technology_names?: string[];
    latest_funding_stage?: string;
    latest_funding_round_date?: string;
    total_funding?: number;
  };
}

function mapPerson(p: ApolloPerson): PersonRecord {
  const org = p.organization;
  return {
    providerRecordId: p.id,
    firstName: p.first_name,
    lastName: p.last_name,
    fullName: p.name ?? [p.first_name, p.last_name].filter(Boolean).join(" "),
    title: p.title,
    seniority: p.seniority,
    headline: p.headline,
    email: p.email && !p.email.includes("email_not_unlocked") ? p.email : undefined,
    emailStatus: mapEmailStatus(p.email_status),
    phone: p.phone_numbers?.[0]?.sanitized_number,
    linkedinUrl: p.linkedin_url,
    xHandle: p.twitter_url ? p.twitter_url.split("/").filter(Boolean).pop() : undefined,
    location: [p.city, p.state, p.country].filter(Boolean).join(", ") || undefined,
    country: p.country,
    company: org
      ? {
          providerRecordId: org.id,
          name: org.name ?? "",
          domain: org.primary_domain,
          website: org.website_url,
          linkedinUrl: org.linkedin_url,
          industry: org.industry,
          headcount: org.estimated_num_employees,
          description: org.short_description,
          technologies: org.technology_names,
          fundingStage: org.latest_funding_stage,
          lastFundingAt: org.latest_funding_round_date,
          totalFundingUsd: org.total_funding,
        }
      : undefined,
    sourceUrl: p.linkedin_url,
  };
}

function mapEmailStatus(s?: string): PersonRecord["emailStatus"] {
  if (s === "verified") return "valid";
  if (s === "guessed" || s === "unavailable") return "risky";
  if (s === "bounced") return "invalid";
  return "unknown";
}

function headcountRanges(min?: number, max?: number): string[] | undefined {
  if (!min && !max) return undefined;
  const bands: [number, number][] = [
    [1, 10],
    [11, 20],
    [21, 50],
    [51, 100],
    [101, 200],
    [201, 500],
    [501, 1000],
    [1001, 2000],
    [2001, 5000],
    [5001, 10000],
    [10001, 1_000_000],
  ];
  return bands.filter(([lo, hi]) => (!min || hi >= min) && (!max || lo <= max)).map(([lo, hi]) => `${lo},${hi >= 1_000_000 ? "" : hi}`);
}

function createApollo(creds: Creds, _config: Config, usage: UsageSink): PeopleSearchProvider & EnrichmentProvider {
  const headers = { "Content-Type": "application/json", "x-api-key": creds.apiKey, "Cache-Control": "no-cache" };
  return {
    id: "apollo",
    category: "people_data",
    async testConnection() {
      const started = Date.now();
      try {
        await providerFetch("apollo", `${BASE}/auth/health`, { headers });
        return { ok: true, message: "Connected to Apollo", latencyMs: Date.now() - started };
      } catch (err) {
        return { ok: false, message: (err as Error).message, latencyMs: Date.now() - started };
      }
    },
    async estimateSearch(criteria) {
      const { data } = await providerFetch<{ pagination?: { total_entries?: number } }>("apollo", `${BASE}/mixed_people/search`, {
        method: "POST",
        headers,
        body: JSON.stringify({ ...buildQuery(criteria), page: 1, per_page: 1 }),
      });
      usage({ operation: "people.search.estimate", units: 1, unitLabel: "calls" });
      return { totalEstimate: data.pagination?.total_entries, note: "Apollo search results do not reveal emails; enrichment spends credits per contact." };
    },
    async searchPeople(criteria) {
      const page = Number(criteria.cursor ?? 1);
      const perPage = Math.min(criteria.limit, 100);
      const { data } = await providerFetch<{ people?: ApolloPerson[]; contacts?: ApolloPerson[]; pagination?: { page: number; total_pages: number; total_entries: number } }>(
        "apollo",
        `${BASE}/mixed_people/search`,
        { method: "POST", headers, body: JSON.stringify({ ...buildQuery(criteria), page, per_page: perPage }) },
      );
      const people = [...(data.people ?? []), ...(data.contacts ?? [])].map(mapPerson);
      usage({ operation: "people.search", units: people.length, unitLabel: "records" });
      const hasMore = data.pagination ? data.pagination.page < data.pagination.total_pages : false;
      return { people, nextCursor: hasMore ? String(page + 1) : undefined, totalEstimate: data.pagination?.total_entries };
    },
    async enrichPerson(input) {
      const { data } = await providerFetch<{ person?: ApolloPerson }>("apollo", `${BASE}/people/match`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          email: input.email,
          linkedin_url: input.linkedinUrl,
          first_name: input.firstName,
          last_name: input.lastName,
          name: input.fullName,
          domain: input.companyDomain,
          organization_name: input.companyName,
          reveal_personal_emails: false,
          reveal_phone_number: false,
        }),
      });
      usage({ operation: "people.enrich", units: 1, unitLabel: "lookups" });
      if (!data.person) return { found: false, fields: {} };
      const p = mapPerson(data.person);
      const f: EnrichmentResult["fields"] = {};
      if (p.email) f.email = { value: p.email, confidence: p.emailStatus === "valid" ? 0.95 : 0.6, verified: p.emailStatus === "valid", sourceUrl: p.sourceUrl };
      if (p.emailStatus) f.emailStatus = { value: p.emailStatus, confidence: 0.9 };
      if (p.title) f.title = { value: p.title, confidence: 0.8 };
      if (p.linkedinUrl) f.linkedinUrl = { value: p.linkedinUrl, confidence: 0.95 };
      if (p.location) f.location = { value: p.location, confidence: 0.7 };
      if (p.country) f.country = { value: p.country, confidence: 0.7 };
      if (p.company?.name) f.companyName = { value: p.company.name, confidence: 0.85 };
      if (p.company?.domain) f.companyDomain = { value: p.company.domain, confidence: 0.9 };
      if (p.company?.headcount) f.companyHeadcount = { value: p.company.headcount, confidence: 0.7 };
      if (p.company?.industry) f.companyIndustry = { value: p.company.industry, confidence: 0.7 };
      if (p.company?.description) f.companyDescription = { value: p.company.description, confidence: 0.7 };
      if (p.company?.technologies?.length) f.companyTechnologies = { value: p.company.technologies, confidence: 0.6 };
      return { found: true, providerRecordId: p.providerRecordId, fields: f };
    },
  };
}

function buildQuery(c: Parameters<PeopleSearchProvider["searchPeople"]>[0]) {
  return {
    person_titles: c.titles,
    person_not_titles: c.excludeTitles,
    person_seniorities: c.seniorities?.map((s) => s.toLowerCase()),
    person_locations: c.locations,
    organization_locations: c.countries,
    q_organization_domains_list: c.companyDomains,
    organization_not_domains: c.excludeCompanyDomains,
    organization_num_employees_ranges: headcountRanges(c.companySizeMin, c.companySizeMax),
    q_organization_keyword_tags: c.industries,
    currently_using_any_of_technology_uids: c.technologies?.map((t) => t.toLowerCase().replace(/\s+/g, "_")),
    q_keywords: [c.semanticQuery, ...(c.keywords ?? [])].filter(Boolean).join(" ") || undefined,
  };
}

export const apolloDescriptor: ProviderDescriptor<Creds, Config> = {
  id: "apollo",
  category: "people_data",
  displayName: "Apollo.io",
  description: "People and company search plus contact enrichment.",
  docsUrl: "https://docs.apollo.io",
  capabilities: ["people.search", "people.enrich", "company.search"],
  credentialFields: [{ key: "apiKey", label: "API key", type: "secret", required: true, help: "Apollo → Settings → Integrations → API." }],
  configFields: [],
  systemEnvKeys: ["APOLLO_API_KEY"],
  credentialsFromEnv: (env) => (env.APOLLO_API_KEY ? { apiKey: env.APOLLO_API_KEY } : null),
  create: ({ credentials, config, usage }) => createApollo(credentials, config as Config, usage),
};
