import type { LoootRun } from "@/lib/looot";
import { FALLBACK_PRICES, type JobId } from "@/lib/jobs";
import type { LoootLike } from "@/lib/runner";
import type { MemoryStore } from "@/lib/store/demoStore";

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}

const PEOPLE: [string, string, string][] = [
  ["Ngozi", "Adeyemi", "Director of Logistics"],
  ["Stellan", "Bergqvist", "Supply Chain Manager"],
  ["Marisol", "Ibarra", "VP Operations"],
  ["Tariq", "Haddad", "Logistics Operations Manager"],
  ["Wren", "Castellanos", "Head of Supply Chain Planning"],
  ["Ifeoma", "Chukwu", "Senior Logistics Analyst"],
  ["Lachlan", "Mercer", "Operations Director, Distribution"],
  ["Sanna", "Virtanen", "Director of Procurement"],
  ["Emeka", "Balogun", "Supply Chain Systems Lead"],
  ["Rosalind", "Pike", "Chief of Staff"],
  ["Joaquin", "Navarro", "Logistics Manager, Inbound"],
  ["Mirela", "Popescu", "Head of Customer Operations"],
];

/**
 * Stand-in for looot in demo mode. No network, no charge. Each job answers in the shape of a real
 * provider body, so the demo goes through the same readers as a live run. Answers depend only on
 * the idempotency key, so a replay returns the same thing.
 */
export class DemoLooot implements LoootLike {
  readonly keys: string[] = [];
  constructor(
    private readonly store: MemoryStore,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  async runAndWait(jobId: string, input: Record<string, unknown>, idempotencyKey: string, maxCostUsd: number): Promise<LoootRun> {
    const h = hash(idempotencyKey);
    this.keys.push(idempotencyKey);
    await this.sleep(600 + (h % 800));
    const runId = `run_demo_${h.toString(16)}`;
    const cost = Math.min(FALLBACK_PRICES[jobId as JobId] ?? 0.001, maxCostUsd);
    const domain = String(input.domain ?? "");
    const company = this.store.data.companies.find((c) => c.domain === domain || c.name === input.company || `"${c.name}"` === input.query);
    const today = new Date().toISOString();
    const done = (result: unknown, charge = cost): LoootRun => ({ runId, status: "completed", result, actualCost: charge });

    switch (jobId as JobId) {
      case "jobs.search": {
        const name = company?.name ?? String(input.company ?? "");
        const roles = [["Logistics Systems Coordinator", "Remote"], ["Supply Chain Planner, Inbound", company?.hq ?? "Remote"], ["Transportation Analyst", company?.hq ?? "Remote"]];
        const picked = roles.slice(0, 1 + (h % 2));
        return done({ jobs: picked.map(([title, location]) => ({ title, company_name: name, location, date_posted: today, job_url: `https://${company?.domain ?? "jobs.example"}/careers/${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` })) });
      }
      case "news.search": {
        const name = company?.name ?? String(input.query ?? "").replace(/"/g, "");
        if (h % 3 === 0) return done({ news: [] });
        return done({ news: [{ title: `${name} launches carrier appointment portal for inbound freight`, link: `https://news.example/${h.toString(16)}`, date: today, source: "Freight Ledger" }] });
      }
      case "company.technographics": {
        const tech = company?.tech ?? [];
        const next = h % 2 === 0 && !tech.includes("Opendock") ? [...tech, "Opendock"] : tech;
        return done({ domain, technologies: (next.length ? next : ["Microsoft 365", "Sage 300", "FedEx Ship Manager"]).map((name) => ({ name })) });
      }
      case "company.funding":
        return done({ domain, funding_rounds: [] });
      case "web.scrape.markdown": {
        const url = String(input.url ?? "");
        const base = this.store.data.signal_baselines.find((b) => b.key === url);
        const head = base?.content ?? `${company?.name ?? url}\n${url.endsWith("/pricing") ? "Request a quote" : "Open roles"}`;
        const extra = url.endsWith("/careers") ? "Dock Scheduling Coordinator, full time" : "Volume discounts start at 500 loads a month";
        return done({ markdown: base && h % 2 === 0 ? `${head}\n${extra}` : head, metadata: { title: company?.name ?? url } });
      }
      case "company.enrich":
        return done({ domain, industry: company?.industry ?? "Logistics and supply chain", employee_count: company?.employees ?? 120 + (h % 400), location: company?.hq ?? "Portland, OR", description: company?.description ?? "Regional distributor with its own warehouse and delivery fleet." });
      case "people.email.find": {
        if (h % 5 === 0) return done({ email: null, status: "not_found" }, 0);
        const local = `${input.first_name ?? "info"}.${input.last_name ?? ""}`.toLowerCase().replace(/[^a-z.]/g, "");
        return done({ email: `${local}@${domain || "mail.example"}`, confidence: 94 });
      }
      case "people.email.verify":
        return done({ email: input.email, status: h % 6 === 0 ? "catch_all" : "valid" });
      case "people.phone.find":
        if (h % 3 === 0) return done({ phone: null }, 0);
        return done({ phone: `+1 (${200 + (h % 700)}) 555-01${String(h % 100).padStart(2, "0")}` });
      case "people.search": {
        const limit = Math.min(Number(input.limit ?? 10), PEOPLE.length);
        const start = h % PEOPLE.length;
        const people = Array.from({ length: limit }, (_, i) => PEOPLE[(start + i) % PEOPLE.length]).map(([first_name, last_name, title]) => ({
          first_name,
          last_name,
          title,
          linkedin_url: `https://www.linkedin.example/in/${first_name}-${last_name}`.toLowerCase(),
        }));
        return done({ people }, Math.min(maxCostUsd, 0.00036 * people.length));
      }
    }
    return { runId, status: "failed", actualCost: 0, error: { code: "unknown_job", message: `Unknown job ${jobId}` } };
  }
}
