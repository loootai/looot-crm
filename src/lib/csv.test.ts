import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildImport, guessMapping, parseCsv, toCsv } from "./csv";

const CSV = `Company,Website,First Name,Last Name,Job Title,Email
"Brightwell Logistics",https://www.brightwell-logistics.example/about,Adaeze,Okonkwo,"VP, Operations",adaeze@brightwell-logistics.example
Brightwell Logistics,brightwell-logistics.example,Marcus,Lindqvist,Director of Transportation,
Brightwell Logistics,brightwell-logistics.example,Adaeze,Okonkwo,VP Operations,adaeze@brightwell-logistics.example
Kestrel Cold Chain,KESTRELCOLD.example,Priya,Raghunathan,Head of Logistics,priya@kestrelcold.example
No Domain Inc,,Sam,Okafor,Buyer,
Lowmoor Timber,lowmoortimber.example,,,,
`;

describe("csv import", () => {
  const rows = parseCsv(CSV);
  it("parses quoted cells and commas inside quotes", () => {
    expect(rows).toHaveLength(7);
    expect(rows[1][4]).toBe("VP, Operations");
  });
  it("guesses the column mapping from the header", () => {
    expect(guessMapping(rows[0])).toEqual({ name: 0, domain: 1, first_name: 2, last_name: 3, title: 4, email: 5 });
  });
  it("groups rows by domain, drops repeated people and rows without a domain", () => {
    const plan = buildImport(rows.slice(1), guessMapping(rows[0]));
    expect(plan.companies.map((c) => c.domain)).toEqual(["brightwell-logistics.example", "kestrelcold.example", "lowmoortimber.example"]);
    expect(plan.companies[0].contacts).toHaveLength(2);
    expect(plan.companies[2].contacts).toHaveLength(0);
    expect(plan.invalid).toBe(1);
    expect(plan.contacts).toBe(3);
  });
  it("skips domains already in the CRM", () => {
    const plan = buildImport(rows.slice(1), guessMapping(rows[0]), ["kestrelcold.example"]);
    expect(plan.duplicates).toBe(1);
    expect(plan.companies.map((c) => c.domain)).not.toContain("kestrelcold.example");
  });
  it("writes CSV with escaping", () => {
    expect(toCsv([{ a: 'say "hi"', b: "x,y", c: null }])).toBe('a,b,c\n"say ""hi""","x,y",');
  });
});

describe("examples/companies.example.csv", () => {
  it("maps every column and imports 3 companies with 3 contacts", () => {
    const rows = parseCsv(readFileSync(resolve(__dirname, "../../examples/companies.example.csv"), "utf8"));
    const mapping = guessMapping(rows[0]);
    expect(Object.keys(mapping).sort()).toEqual(["domain", "email", "first_name", "last_name", "linkedin_url", "name", "title"]);
    const plan = buildImport(rows.slice(1), mapping);
    expect(plan.companies).toHaveLength(3);
    expect(plan.contacts).toBe(3);
    expect(plan.invalid).toBe(0);
  });
});
