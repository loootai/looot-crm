import { describe, expect, it } from "vitest";
import {
  changedLines,
  extractCompany,
  extractEmail,
  extractEmailStatus,
  extractFunding,
  extractItems,
  extractMarkdown,
  extractPeople,
  extractPhone,
  extractTech,
  isMatchingJob,
  mentionsCompany,
  normalizePage,
  removedLines,
  tagHeadline,
  titleMatches,
} from "./extract";

// Fixtures follow the field names in each provider's public API docs. Values are invented.

describe("extractItems", () => {
  it("reads news from a Serper-style body", () => {
    const body = { searchParameters: { q: "x" }, news: [{ title: "Brightwell Logistics raises $48M", link: "https://news.example/1", date: "2 days ago", source: "Freight Ledger" }] };
    expect(extractItems(body)).toEqual([{ url: "https://news.example/1", title: "Brightwell Logistics raises $48M", date: "2 days ago", source: "Freight Ledger", company: undefined }]);
  });
  it("reads jobs nested under data and drops entries without a link", () => {
    const body = { data: { jobs: [{ job_title: "Dock Supervisor", employer_name: "Northgate Parcel", job_url: "https://jobs.example/9", date_posted: "2026-10-05" }, { job_title: "No link" }] } };
    expect(extractItems(body)).toHaveLength(1);
    expect(extractItems(body)[0]).toMatchObject({ title: "Dock Supervisor", company: "Northgate Parcel" });
  });
  it("returns nothing for an empty or unknown body", () => {
    expect(extractItems({ news: [] })).toEqual([]);
    expect(extractItems("error")).toEqual([]);
  });
});

describe("job and news filters", () => {
  it("matches a job by employer and role word", () => {
    const job = { url: "https://j.example", title: "Supply Chain Analyst", company: "Kestrel Cold Chain, Inc." };
    expect(isMatchingJob(job, "Kestrel Cold Chain", ["supply chain"])).toBe(true);
    expect(isMatchingJob(job, "Kestrel Cold Chain", ["transportation"])).toBe(false);
    expect(isMatchingJob(job, "Ardent Bottling", ["supply chain"])).toBe(false);
  });
  it("keeps headlines that name the company", () => {
    expect(mentionsCompany("Halden & Pryce launches contractor delivery tracking", "Halden & Pryce Distribution")).toBe(true);
    expect(mentionsCompany("Regional distributors see record quarter", "Halden & Pryce Distribution")).toBe(false);
  });
  it("tags headlines", () => {
    expect(tagHeadline("Brightwell raises $48M Series C")).toBe("funding");
    expect(tagHeadline("Selwyn Marine Supply names Henrik Solberg chief operating officer")).toBe("leadership");
    expect(tagHeadline("Northgate Parcel launches Sunday delivery")).toBe("launch");
    expect(tagHeadline("Ostrava and Tidewater sign a partnership")).toBe("partnership");
    expect(tagHeadline("Brightwell named to fastest-growing list")).toBe("other");
  });
});

describe("contact readers", () => {
  it("reads an email from flat, nested and list shapes", () => {
    expect(extractEmail({ email: "A.Okonkwo@Brightwell-Logistics.example", score: 96 })).toBe("a.okonkwo@brightwell-logistics.example");
    expect(extractEmail({ data: { emails: [{ email: "priya@kestrelcold.example", type: "professional" }] } })).toBe("priya@kestrelcold.example");
    expect(extractEmail({ person: { work_email: "t.wieczorek@ostravafreight.example" } })).toBe("t.wieczorek@ostravafreight.example");
  });
  it("gives null when no email came back", () => {
    expect(extractEmail({ email: null, status: "not_found" })).toBeNull();
    expect(extractEmail({ email: "not-an-email" })).toBeNull();
    expect(extractEmail({})).toBeNull();
  });
  it("maps verifier verdicts", () => {
    expect(extractEmailStatus({ status: "valid" })).toBe("verified");
    expect(extractEmailStatus({ data: { result: "deliverable" } })).toBe("verified");
    expect(extractEmailStatus({ state: "catch_all" })).toBe("risky");
    expect(extractEmailStatus({ result: "undeliverable" })).toBe("invalid");
    expect(extractEmailStatus({ is_valid: false })).toBe("invalid");
    expect(extractEmailStatus({ credits: 3 })).toBeNull();
  });
  it("reads a phone from flat and list shapes", () => {
    expect(extractPhone({ mobile_phone: "+1 (614) 555-0110" })).toBe("+1 (614) 555-0110");
    expect(extractPhone({ person: { phone_numbers: [{ sanitized_number: "+16145550111", type: "mobile" }] } })).toBe("+16145550111");
    expect(extractPhone({ phone: null })).toBeNull();
    expect(extractPhone({ phone: "n/a" })).toBeNull();
  });
});

describe("company readers", () => {
  it("reads company fields from two provider shapes", () => {
    expect(extractCompany({ name: "Ostrava Freight Group", industry: "Freight forwarding", employee_count: 1850, location: { city: "Newark", state: "NJ", country: "US" }, description: "Forwarder.", linkedin_url: "linkedin.com/company/ostrava" })).toEqual({
      industry: "Freight forwarding",
      employees: 1850,
      hq: "Newark, NJ",
      description: "Forwarder.",
      linkedin_url: "https://linkedin.com/company/ostrava",
    });
    expect(extractCompany({ data: { industries: ["Cold storage"], size: "201-500", headquarters: "Fresno, CA" } })).toEqual({ industry: "Cold storage", employees: 201, hq: "Fresno, CA" });
    expect(extractCompany({ error: "not found" })).toEqual({});
  });
  it("reads named technologies and refuses category counts", () => {
    expect(extractTech({ technologies: [{ name: "Samsara", category: "Fleet" }, { name: "Okta" }, { name: "Okta" }] })).toEqual(["Okta", "Samsara"]);
    expect(extractTech({ data: { tech_stack: ["Snowflake", "Tableau"] } })).toEqual(["Snowflake", "Tableau"]);
    // The free BuiltWith answer: groups with live and dead counts, no technology names.
    expect(extractTech({ domain: "x.example", groups: [{ name: "analytics", live: 4, dead: 12 }] })).toBeNull();
  });
  it("reads funding rounds", () => {
    expect(extractFunding({ funding_rounds: [{ type: "Series C", amount: 48_000_000, announced_on: "2026-10-02", investors: [{ name: "Calder Ridge" }, { name: "Meridian Growth" }] }] })).toEqual([{ date: "2026-10-02", type: "Series C", amount: "$48M", investors: "Calder Ridge, Meridian Growth" }]);
    expect(extractFunding({ data: { rounds: [{ funding_type: "Seed", money_raised: "$6M", date: "2026-08-17" }] } })).toEqual([{ date: "2026-08-17", type: "Seed", amount: "$6M", investors: null }]);
    expect(extractFunding({ funding_rounds: [] })).toEqual([]);
    expect(extractFunding({ message: "no data" })).toEqual([]);
  });
});

describe("people search", () => {
  it("reads people from two shapes and filters by title keywords", () => {
    const a = extractPeople({ people: [{ first_name: "Ngozi", last_name: "Adeyemi", title: "Director of Logistics", linkedin_url: "https://www.linkedin.example/in/ngozi" }] });
    expect(a).toEqual([{ name: "Ngozi Adeyemi", first_name: "Ngozi", last_name: "Adeyemi", title: "Director of Logistics", linkedin_url: "https://www.linkedin.example/in/ngozi" }]);
    const b = extractPeople({ data: { results: [{ full_name: "Stellan Bergqvist", headline: "Supply Chain Manager" }, { name: "Support" }] } });
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ first_name: "Stellan", last_name: "Bergqvist", title: "Supply Chain Manager" });
    expect(titleMatches("Supply Chain Manager", ["operations", " supply chain "])).toBe(true);
    expect(titleMatches("Chief of Staff", ["operations"])).toBe(false);
    expect(titleMatches(null, [])).toBe(true);
  });
});

describe("page reads", () => {
  it("reads markdown from the usual fields", () => {
    expect(extractMarkdown({ result: { markdown: "# Pricing" } })).toBe("# Pricing");
    expect(extractMarkdown({ result: { data: { content: "text" } } })).toBe("text");
    expect(extractMarkdown({ normalized: { markdown: "n" }, result: { markdown: "r" } })).toBe("n");
    expect(extractMarkdown({ result: {} })).toBeNull();
  });
  it("ignores dates and times when comparing, and lists added and removed lines", () => {
    const before = normalizePage("Pricing\nUpdated 2026-10-01 09:15\nFlat $185 per container");
    const after = normalizePage("Pricing\nUpdated 2026-10-07 11:40\nQuoted per container");
    expect(changedLines(before, after)).toEqual(["Quoted per container"]);
    expect(removedLines(before, after)).toEqual(["Flat $185 per container"]);
  });
});
