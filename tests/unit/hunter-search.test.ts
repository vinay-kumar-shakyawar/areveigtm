import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDiscoverBody, hunterDescriptor } from "@/server/providers/people/hunter";
import type { PeopleSearchProvider, UsageRecord } from "@/server/providers/types";

type Call = { url: string; init?: RequestInit };

function stubHunter(calls: Call[], opts?: { ctoAt?: string[]; failPaging?: boolean }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      const u = new URL(url);
      const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
      if (u.pathname.endsWith("/discover")) {
        const body = JSON.parse(String(init?.body ?? "{}"));
        if (opts?.failPaging && body.offset > 0) return json({ errors: [{ id: "pagination_error", code: 400, details: "Your current plan returns only the first page of results." }] }, 400);
        return json({
          data: [
            { domain: "acme.ae", organization: "Acme", emails_count: { personal: 12, generic: 1, total: 13 } },
            { domain: "beta.ae", organization: "Beta", emails_count: { personal: 2, generic: 0, total: 2 } },
            { domain: "gamma.ae", organization: "Gamma", emails_count: { personal: 40, generic: 3, total: 43 } },
          ],
          meta: { results: 3, limit: 100, offset: body.offset ?? 0, filters: body.query ? { keywords: { match: "any", include: ["saas"] } } : body },
        });
      }
      if (u.pathname.endsWith("/domain-search")) {
        const domain = u.searchParams.get("domain")!;
        const titles = u.searchParams.get("job_titles");
        const emails = [];
        if (!titles || (opts?.ctoAt ?? ["acme.ae"]).includes(domain)) {
          emails.push({ value: `cto@${domain}`, type: "personal", provenance: "found", confidence: 90, first_name: "Casey", last_name: "Tech", position: "CTO", seniority: "executive", department: "it", linkedin: "https://linkedin.com/in/casey", verification: { status: "valid" } });
        }
        if (!titles) {
          emails.push({ value: `intern@${domain}`, type: "personal", provenance: "inferred", confidence: 40, first_name: "Ira", last_name: "Intern", position: "Marketing Intern", seniority: "junior", department: "marketing", verification: null });
          emails.push({ value: `info@${domain}`, type: "generic", confidence: 70 });
        }
        return json({ data: { domain, organization: domain === "acme.ae" ? "Acme Inc" : null, emails }, meta: { results: emails.length } }, 200, { "x-credits-used": emails.length ? "1" : "0" });
      }
      if (u.pathname.endsWith("/account")) return json({ data: { email: "owner@example.com", requests: { searches: { used: 3, available: 50 } } } });
      return json({ errors: [{ id: "not_found", code: 404 }] }, 404);
    }),
  );
}

function hunter(usage: UsageRecord[] = [], config: Record<string, unknown> = {}) {
  return hunterDescriptor.create({ credentials: { apiKey: "hk" }, config, usage: (u) => usage.push(u) }) as unknown as PeopleSearchProvider;
}

afterEach(() => vi.unstubAllGlobals());

describe("Hunter people search", () => {
  it("sends structured Discover filters and never mixes them with a query", () => {
    const body = buildDiscoverBody({ limit: 10, countries: ["ae", "US"], companySizeMin: 11, companySizeMax: 200, industries: ["SaaS"], keywords: ["fintech"], semanticQuery: "B2B software; exclude: agencies" });
    expect(body).toEqual({
      headcount: ["11-50", "51-200"],
      headquarters_location: { include: [{ country: "AE" }, { country: "US" }] },
      keywords: { include: ["saas", "fintech"], match: "any" },
    });
    expect(buildDiscoverBody({ limit: 10, semanticQuery: "B2B software in the UAE" })).toEqual({ query: "B2B software in the UAE" });
    expect(buildDiscoverBody({ limit: 10, titles: ["CTO"] })).toBeNull();
  });

  it("discovers companies, lists people per domain with title filters, and pages by company", async () => {
    const calls: Call[] = [];
    stubHunter(calls);
    const usage: UsageRecord[] = [];
    const p = hunter(usage, { peoplePerCompany: 2 });
    const first = await p.searchPeople({ limit: 4, titles: ["CTO", "VP Engineering"], seniorities: ["C-Level", "Director"], functions: ["Engineering"], countries: ["AE"], excludeTitles: ["intern"] });
    // 4 requested / 2 per company = 2 companies on this page.
    const domainCalls = calls.filter((c) => c.url.includes("/domain-search"));
    expect(domainCalls.map((c) => new URL(c.url).searchParams.get("domain"))).toEqual(["acme.ae", "beta.ae", "beta.ae"]);
    const q = new URL(domainCalls[0].url).searchParams;
    expect(q.get("job_titles")).toBe("CTO,VP Engineering");
    expect(q.get("seniority")).toBe("executive");
    expect(q.get("department")).toBe("it");
    expect(q.get("type")).toBe("personal");
    expect(q.get("limit")).toBe("2");
    // Key goes in a header, never in the URL.
    expect(calls.every((c) => !c.url.includes("hk"))).toBe(true);
    // acme matched the titles; beta did not and fell back to seniority/department, flagged in raw; generic + excluded titles dropped.
    expect(first.people.map((x) => [x.email, x.company?.name, x.raw?.titleMatch])).toEqual([
      ["cto@acme.ae", "Acme Inc", true],
      ["cto@beta.ae", "Beta", false],
    ]);
    expect(first.people[0]).toMatchObject({ fullName: "Casey Tech", title: "CTO", emailStatus: "valid", linkedinUrl: "https://linkedin.com/in/casey", company: { domain: "acme.ae", website: "https://acme.ae" } });
    expect(first.nextCursor).toBeTruthy();
    expect(first.totalEstimate).toBe(6);
    expect(usage.filter((u) => u.operation === "people.search").map((u) => u.metadata?.credits)).toEqual([1, 0, 1]);

    const second = await p.searchPeople({ limit: 4, titles: ["CTO"], cursor: first.nextCursor });
    // gamma has nobody with that title: fallback lists its people without the title filter and flags them.
    expect(second.people.map((x) => [x.email, x.raw?.titleMatch])).toEqual([
      ["cto@gamma.ae", false],
      ["intern@gamma.ae", false],
    ]);
    expect(second.nextCursor).toBeUndefined();
    // Later pages reuse the applied filters instead of re-deriving them.
    const discoverBodies = calls.filter((c) => c.url.includes("/discover")).map((c) => JSON.parse(String(c.init?.body)));
    expect(discoverBodies[1]).toMatchObject({ headquarters_location: { include: [{ country: "AE" }] }, offset: 0 });
  });

  it("searches given company domains directly without Discover", async () => {
    const calls: Call[] = [];
    stubHunter(calls);
    const res = await hunter().searchPeople({ limit: 10, companyDomains: ["https://www.Acme.ae/about", "beta.ae"] });
    expect(calls.some((c) => c.url.includes("/discover"))).toBe(false);
    expect(res.people.map((x) => x.email)).toEqual(["cto@acme.ae", "intern@acme.ae", "cto@beta.ae", "intern@beta.ae"]);
    expect(res.people[1].emailStatus).toBe("risky");
    expect(res.nextCursor).toBeUndefined();
  });

  it("estimates reachable people and credits before running", async () => {
    stubHunter([]);
    const est = await hunter([], { peoplePerCompany: 5 }).estimateSearch!({ limit: 1, countries: ["AE"] });
    expect(est.totalEstimate).toBe(5 + 2 + 5);
    expect(est.creditsPerRecord).toBeCloseTo(0.2);
    expect(est.note).toContain("3 matching companies");
    expect(est.note).toContain("47 left");
  });

  it("explains when nothing narrows the company search", async () => {
    stubHunter([]);
    await expect(hunter().searchPeople({ limit: 10, titles: ["CTO"] })).rejects.toThrow(/industry, keyword, country code/);
  });
});
