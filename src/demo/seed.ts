import { emptyData, type DemoData } from "@/lib/store/demoStore";
import { ROW_DEFAULTS } from "@/lib/store/types";
import { basePoints, DEFAULT_WEIGHTS, scoreCompany } from "@/lib/score";
import { FALLBACK_PRICES, JOBS, type JobId, round6 } from "@/lib/jobs";
import type { ActionKind, ActionStatus, ActivityKind, EmailStatus, RunOutcome, SignalKind, Stage, TableName, Tables } from "@/lib/types";

/**
 * Demo data. The user is Inès Marchetti, an account executive selling dock and yard scheduling
 * software to mid-size logistics firms. Every company is invented and every domain ends in
 * .example. Dates are offsets from `now`, so the demo never looks stale.
 */
export const DEMO_ROLE_KEYWORDS = ["logistics", "supply chain", "warehouse operations", "transportation"];

const DAY = 86_400_000;

// id, name, domain, industry, employees, hq, description, tech
const COMPANIES: [string, string, string, string, number, string, string, string[]][] = [
  ["brightwell", "Brightwell Logistics", "brightwell-logistics.example", "Third-party logistics", 640, "Columbus, OH", "Contract warehousing and regional trucking for consumer brands across the Midwest.", ["Manhattan WMS", "Samsara", "Snowflake", "Okta", "Salesforce", "Workday", "Tableau", "Twilio", "FourKites", "Descartes"]],
  ["kestrel", "Kestrel Cold Chain", "kestrelcold.example", "Cold storage", 310, "Fresno, CA", "Temperature-controlled storage and cross-docking for produce and dairy shippers.", ["Blue Yonder WMS", "Motive", "NetSuite", "Power BI", "Zendesk", "Okta"]],
  ["ostrava", "Ostrava Freight Group", "ostravafreight.example", "Freight forwarding", 1850, "Newark, NJ", "Ocean, air and intermodal forwarding with eleven terminals on the East Coast.", ["CargoWise", "Yardview YMS", "SAP S/4HANA", "project44", "ServiceNow", "Azure", "Looker"]],
  ["halden", "Halden & Pryce Distribution", "haldenpryce.example", "Wholesale distribution", 420, "Charlotte, NC", "Wholesale distributor of plumbing and HVAC parts to contractors in the Southeast.", ["Epicor Prophet 21", "Korber WMS", "HubSpot", "Shopify Plus", "Fivetran"]],
  ["tamarind", "Tamarind Grocers Co-op", "tamarindcoop.example", "Grocery retail", 2300, "Sacramento, CA", "Member-owned grocery chain with 64 stores and one distribution center.", ["Oracle Retail", "Relex", "Zebra", "Kronos", "Azure", "Slack"]],
  ["northgate", "Northgate Parcel", "northgateparcel.example", "Last-mile delivery", 980, "Minneapolis, MN", "Regional parcel carrier serving seven states with next-day ground delivery.", ["Onfleet", "Samsara", "AWS", "Datadog", "Greenhouse"]],
  ["selwyn", "Selwyn Marine Supply", "selwynmarine.example", "Industrial supply", 150, "Mobile, AL", "Parts and consumables for commercial shipyards and port operators.", ["Acumatica", "ShipStation", "QuickBooks"]],
  ["ardent", "Ardent Bottling", "ardentbottling.example", "Beverage manufacturing", 720, "Chattanooga, TN", "Contract bottler for regional soft drink and sparkling water brands.", ["SAP ECC", "Ignition SCADA", "Descartes", "ADP", "Microsoft 365"]],
  ["fennick", "Fennick Auto Parts", "fennickparts.example", "Auto parts distribution", 510, "Toledo, OH", "Aftermarket parts distributor with four regional warehouses.", ["Infor CloudSuite", "Epicor Eagle", "Zoho CRM", "Fishbowl"]],
  ["quillon", "Quillon Pharma Logistics", "quillonpharma.example", "Pharma distribution", 260, "Raleigh, NC", "Licensed distributor of temperature-sensitive specialty drugs.", ["TraceLink", "Veeva", "NetSuite", "Sensitech"]],
  ["marrow", "Marrow Creek Foods", "marrowcreek.example", "Food processing", 890, "Boise, ID", "Frozen potato and vegetable processor selling to foodservice distributors.", ["Plex", "Blue Yonder TMS", "Workday", "Power BI"]],
  ["dunmore", "Dunmore Rail Services", "dunmorerail.example", "Rail freight", 1200, "Kansas City, MO", "Short-line rail operator and transload yards across the Central Plains.", ["RailConnect", "Oracle EBS", "Esri", "ServiceNow"]],
  ["vessel", "Vessel & Vane", "vesselvane.example", "Home goods e-commerce", 95, "Portland, ME", "Online retailer of kitchen and garden goods shipping from one fulfillment center.", ["Shopify", "ShipBob", "Klaviyo", "Gorgias"]],
  ["lowmoor", "Lowmoor Timber", "lowmoortimber.example", "Building materials", 340, "Eugene, OR", "Lumber and engineered wood supplier to builders in the Pacific Northwest.", []],
];

// company, first, last, title, email status, has email, has phone
const CONTACTS: [string, string, string, string, EmailStatus, boolean, boolean][] = [
  ["brightwell", "Adaeze", "Okonkwo", "VP Operations", "verified", true, true],
  ["brightwell", "Marcus", "Lindqvist", "Director of Transportation", "verified", true, true],
  ["brightwell", "Hye-jin", "Bae", "Senior Supply Chain Analyst", "verified", true, false],
  ["brightwell", "Rafael", "Quintero", "Chief Financial Officer", "risky", true, false],
  ["brightwell", "Noor", "Al-Sayed", "Yard Manager", "unchecked", false, false],
  ["kestrel", "Priya", "Raghunathan", "Head of Logistics", "verified", true, true],
  ["kestrel", "Declan", "O'Rourke", "Chief Operating Officer", "verified", true, true],
  ["kestrel", "Mei-Ling", "Tsao", "Warehouse Operations Manager", "verified", true, false],
  ["kestrel", "Jonas", "Brandt", "IT Director", "not_found", false, false],
  ["ostrava", "Tomasz", "Wieczorek", "Director of Supply Chain", "verified", true, true],
  ["ostrava", "Ivana", "Hruskova", "VP Terminal Operations", "verified", true, true],
  ["ostrava", "Samuel", "Oyelaran", "Procurement Lead", "risky", true, false],
  ["ostrava", "Katarina", "Novotna", "Yard Systems Analyst", "verified", true, false],
  ["halden", "Callum", "Ferreira", "Warehouse Systems Manager", "verified", true, true],
  ["halden", "Bronwyn", "Achterberg", "Director of Distribution", "verified", true, true],
  ["halden", "Darius", "Montazeri", "Head of IT", "invalid", true, false],
  ["tamarind", "Lucia", "Benavides", "VP Supply Chain", "verified", true, true],
  ["tamarind", "Gideon", "Asante", "Distribution Center Manager", "verified", true, true],
  ["tamarind", "Farah", "Qureshi", "Transportation Planner", "unchecked", true, false],
  ["tamarind", "Owen", "Thackeray", "Director of Finance", "risky", true, false],
  ["northgate", "Yusuf", "Demirci", "Head of Dock Operations", "verified", true, true],
  ["northgate", "Camille", "Fontaine", "Regional Operations Manager", "verified", true, false],
  ["northgate", "Arjun", "Subramanian", "Fleet Analyst", "unchecked", false, false],
  ["selwyn", "Henrik", "Solberg", "Chief Operating Officer", "verified", true, true],
  ["selwyn", "Abigail", "Mwangi", "Logistics Coordinator", "not_found", false, false],
  ["ardent", "Renata", "Kowalczyk", "Plant Logistics Manager", "verified", true, true],
  ["ardent", "Elias", "Vanterpool", "Supply Chain Director", "verified", true, true],
  ["ardent", "Sunita", "Dhillon", "Shipping Supervisor", "unchecked", false, false],
  ["fennick", "Teodoro", "Marquez", "VP Distribution", "verified", true, true],
  ["fennick", "Ingrid", "Halvorsen", "Warehouse Operations Lead", "risky", true, false],
  ["fennick", "Kwabena", "Osei", "Inventory Systems Manager", "unchecked", true, false],
  ["quillon", "Anneliese", "Roth", "Head of Cold Chain Logistics", "verified", true, true],
  ["quillon", "Dmitri", "Vasilenko", "Quality Director", "not_found", false, false],
  ["marrow", "Shauna", "Kilbride", "Director of Logistics", "verified", true, true],
  ["marrow", "Paulo", "Azevedo", "Dock Supervisor", "verified", true, false],
  ["marrow", "Leilani", "Kahale", "Operations Analyst", "unchecked", false, false],
  ["dunmore", "Bartholomew", "Finch", "VP Yard Operations", "invalid", true, false],
  ["dunmore", "Zanele", "Mokoena", "Terminal Manager", "risky", true, false],
  ["vessel", "Odette", "Marchand", "Head of Fulfillment", "unchecked", true, false],
  ["vessel", "Felix", "Nakamura", "Operations Lead", "not_found", false, false],
  ["lowmoor", "Greta", "Lindahl", "Logistics Manager", "unchecked", false, false],
];

// id, company, name, stage, amount in dollars, close in days, next step, next step due in days, closed reason
const DEALS: [string, string, string, Stage, number, number, string | null, number | null, string | null][] = [
  ["d-brightwell", "brightwell", "Brightwell: yard scheduling, 4 sites", "proposal", 84000, 18, "Send revised order form with the 3-year term", 0, null],
  ["d-brightwell-2", "brightwell", "Brightwell: Dayton expansion site", "qualified", 22000, 46, "Scope dock count with Marcus", 4, null],
  ["d-kestrel", "kestrel", "Kestrel: Fresno and Modesto docks", "demo", 52500, 27, "Run the live demo on their reefer schedule", 2, null],
  ["d-ostrava", "ostrava", "Ostrava: Port Newark terminals", "qualified", 126000, 61, "Security questionnaire back to Ivana", -2, null],
  ["d-halden", "halden", "Halden & Pryce: Charlotte DC", "demo", 38000, 24, "Share the Korber integration notes", 1, null],
  ["d-tamarind", "tamarind", "Tamarind: Sacramento DC scheduling", "qualified", 97000, 54, "Intro call with the Reno project lead", 6, null],
  ["d-tamarind-2", "tamarind", "Tamarind: carrier portal add-on", "lead", 9500, 75, null, null, null],
  ["d-northgate", "northgate", "Northgate: hub dock appointments", "lead", 45000, 68, "Book discovery with Yusuf", 0, null],
  ["d-selwyn", "selwyn", "Selwyn: receiving dock", "lead", 18500, 80, "Follow up after the COO settles in", 9, null],
  ["d-ardent", "ardent", "Ardent: plant yard and docks", "proposal", 61000, 12, "Legal review call on the MSA", 3, null],
  ["d-fennick", "fennick", "Fennick: four warehouses", "qualified", 33000, 49, "Send ROI model with their trailer counts", 5, null],
  ["d-quillon", "quillon", "Quillon: GDP-compliant docks", "lead", 29000, 90, "Ask Anneliese about audit timing", 7, null],
  ["d-vessel", "vessel", "Vessel & Vane: fulfillment center", "lead", 12000, 95, null, null, null],
  ["d-marrow", "marrow", "Marrow Creek: Boise plant", "won", 72000, -21, null, null, "Chosen over a spreadsheet process"],
  ["d-kestrel-2", "kestrel", "Kestrel: renewal, year 2", "won", 31000, -40, null, null, "Renewed at list price"],
  ["d-dunmore", "dunmore", "Dunmore: transload yards", "lost", 110000, -33, null, null, "Chose incumbent"],
  ["d-ostrava-2", "ostrava", "Ostrava: Baltimore pilot", "lost", 15000, -58, null, null, "Timing"],
];

// company, kind, days ago, title, tag, detail
type SignalSeed = [string, SignalKind, number, string, string | null, Record<string, unknown> | null];
const SIGNALS: SignalSeed[] = [
  // Brightwell 86
  ["brightwell", "funding", 6, "Series C, $48M", "series_c", { type: "Series C", amount: "$48M", investors: "Calder Ridge Partners, Meridian Growth" }],
  ["brightwell", "hiring", 1, "Director of Warehouse Operations", null, { location: "Columbus, OH" }],
  ["brightwell", "hiring", 1, "Supply Chain Systems Analyst", null, { location: "Columbus, OH" }],
  ["brightwell", "hiring", 1, "Transportation Manager, Dedicated Fleet", null, { location: "Indianapolis, IN" }],
  ["brightwell", "tech", 2, "Added FourKites", "added", null],
  ["brightwell", "tech", 2, "Removed MacroPoint", "removed", null],
  ["brightwell", "news", 6, "Brightwell Logistics raises $48M to add four Midwest warehouses", "funding", { source: "Freight Ledger" }],
  ["brightwell", "news", 3, "Brightwell launches same-day cross-dock service in Indianapolis", "launch", { source: "Supply Chain Wire" }],
  ["brightwell", "news", 1, "Brightwell Logistics named to Ohio fastest-growing companies list", "other", { source: "Columbus Business Daily" }],
  ["brightwell", "site", 4, "Careers page changed", null, { page: "/careers", added: ["Director of Warehouse Operations, Columbus", "Yard Coordinator, Dayton (new site, opening Q1)"], removed: ["No open roles in operations right now."] }],
  // Kestrel 74
  ["kestrel", "hiring", 0, "Director of Warehouse Operations", null, { location: "Fresno, CA" }],
  ["kestrel", "hiring", 0, "Supply Chain Analyst", null, { location: "Modesto, CA" }],
  ["kestrel", "hiring", 0, "Supply Chain Analyst, Inbound", null, { location: "Fresno, CA" }],
  ["kestrel", "tech", 1, "Added Motive", "added", null],
  ["kestrel", "tech", 1, "Removed KeepTruckin ELD", "removed", null],
  ["kestrel", "news", 2, "Kestrel Cold Chain launches blast-freezing service for Central Valley growers", "launch", { source: "Central Valley Business Journal" }],
  ["kestrel", "news", 5, "Kestrel Cold Chain appoints Declan O'Rourke as chief operating officer", "leadership", { source: "Cold Chain Weekly" }],
  ["kestrel", "news", 9, "Kestrel and Sierra Reefer Lines sign a regional partnership", "partnership", { source: "Freight Ledger" }],
  ["kestrel", "site", 4, "Careers page changed", null, { page: "/careers", added: ["Director of Warehouse Operations", "Supply Chain Analyst (2 openings)"], removed: [] }],
  ["kestrel", "site", 6, "Pricing page changed", null, { page: "/pricing", added: ["Blast freezing: quoted per pallet"], removed: ["Storage only. Ask about handling."] }],
  ["kestrel", "funding", 80, "Growth equity, $22M", "growth", { type: "Growth equity", amount: "$22M", investors: "Sable Fork Capital" }],
  // Ostrava 68
  ["ostrava", "tech", 11, "Added Yardview YMS", "added", null],
  ["ostrava", "tech", 11, "Removed an in-house gate log", "removed", null],
  ["ostrava", "hiring", 3, "Logistics Systems Manager", null, { location: "Newark, NJ" }],
  ["ostrava", "hiring", 3, "Transportation Planner, Intermodal", null, { location: "Baltimore, MD" }],
  ["ostrava", "news", 1, "Ostrava Freight launches weekly Rotterdam to Newark consolidation", "launch", { source: "Port Report" }],
  ["ostrava", "news", 5, "Ostrava Freight and Tidewater Drayage sign a three-year partnership", "partnership", { source: "Freight Ledger" }],
  ["ostrava", "news", 8, "Ostrava Freight Group ranked among top 25 East Coast forwarders", "other", { source: "Port Report" }],
  ["ostrava", "site", 1, "Pricing page changed", null, { page: "/pricing", added: ["Terminal handling: quoted per container from 1 November"], removed: ["Terminal handling: flat $185 per container"] }],
  ["ostrava", "site", 7, "Careers page changed", null, { page: "/careers", added: ["Logistics Systems Manager, Newark"], removed: [] }],
  ["ostrava", "funding", 30, "Debt facility, $60M", "debt", { type: "Debt facility", amount: "$60M", investors: "Harrow Street Bank" }],
  // Halden 61
  ["halden", "site", 3, "Pricing page changed", null, { page: "/pricing", added: ["Will-call pickup windows: book online, 30-minute slots", "Freight on orders above $2,500 is prepaid"], removed: ["Will-call pickup: first come, first served"] }],
  ["halden", "site", 5, "Careers page changed", null, { page: "/careers", added: ["Warehouse Operations Supervisor, 2nd shift"], removed: [] }],
  ["halden", "hiring", 4, "Warehouse Operations Supervisor, 2nd shift", null, { location: "Charlotte, NC" }],
  ["halden", "hiring", 7, "Logistics Analyst", null, { location: "Charlotte, NC" }],
  ["halden", "hiring", 10, "Transportation Coordinator", null, { location: "Greenville, SC" }],
  ["halden", "news", 6, "Halden & Pryce launches contractor delivery tracking", "launch", { source: "HVAC Trade Weekly" }],
  ["halden", "news", 9, "Halden & Pryce and Carolina Mechanical Supply announce a distribution partnership", "partnership", { source: "Charlotte Trade Journal" }],
  ["halden", "news", 12, "Halden & Pryce names Bronwyn Achterberg vp of distribution", "leadership", { source: "HVAC Trade Weekly" }],
  ["halden", "tech", 8, "Added Korber WMS", "added", null],
  ["halden", "tech", 8, "Removed HighJump", "removed", null],
  // Tamarind 57
  ["tamarind", "news", 5, "Tamarind Grocers launches plan for a second distribution center in Reno", "launch", { source: "Grocery Dispatch" }],
  ["tamarind", "news", 3, "Tamarind Grocers and Sierra Fresh Farms expand their supply partnership", "partnership", { source: "Grocery Dispatch" }],
  ["tamarind", "news", 2, "Tamarind Grocers Co-op appoints Lucia Benavides to lead the Reno build", "leadership", { source: "Sacramento Business Daily" }],
  ["tamarind", "hiring", 4, "Supply Chain Project Manager, Reno DC", null, { location: "Reno, NV" }],
  ["tamarind", "hiring", 4, "Transportation Supervisor", null, { location: "Sacramento, CA" }],
  ["tamarind", "tech", 10, "Added Relex", "added", null],
  ["tamarind", "tech", 10, "Removed an in-house replenishment tool", "removed", null],
  ["tamarind", "site", 1, "Careers page changed", null, { page: "/careers", added: ["Reno distribution center: 40 roles opening in January"], removed: [] }],
  ["tamarind", "site", 2, "Pricing page changed", null, { page: "/pricing", added: ["Supplier delivery windows are now booked by appointment"], removed: [] }],
  // Northgate 49
  ["northgate", "hiring", 3, "Transportation Planner", null, { location: "Minneapolis, MN" }],
  ["northgate", "hiring", 3, "Dock Supervisor, Logistics Hub", null, { location: "Eagan, MN" }],
  ["northgate", "funding", 30, "Series B extension, $18M", "series_b", { type: "Series B extension", amount: "$18M", investors: "Lakehead Ventures" }],
  ["northgate", "news", 10, "Northgate Parcel launches Sunday delivery in the Twin Cities", "launch", { source: "Parcel Monitor" }],
  ["northgate", "news", 4, "Northgate Parcel delivers its 40 millionth package", "other", { source: "Parcel Monitor" }],
  ["northgate", "tech", 14, "Added Onfleet", "added", null],
  ["northgate", "site", 3, "Careers page changed", null, { page: "/careers", added: ["Dock Supervisor, Eagan hub", "Transportation Planner"], removed: [] }],
  // Selwyn 44
  ["selwyn", "tech", 12, "Added ShipStation", "added", null],
  ["selwyn", "tech", 12, "Removed a legacy shipping desk tool", "removed", null],
  ["selwyn", "hiring", 9, "Logistics Coordinator", null, { location: "Mobile, AL" }],
  ["selwyn", "hiring", 9, "Warehouse Operations Lead", null, { location: "Mobile, AL" }],
  ["selwyn", "news", 19, "Selwyn Marine Supply names Henrik Solberg chief operating officer", "leadership", { source: "Gulf Coast Trade News" }],
  ["selwyn", "news", 6, "Selwyn Marine Supply launches next-day parts delivery to Gulf shipyards", "launch", { source: "Gulf Coast Trade News" }],
  ["selwyn", "site", 8, "Careers page changed", null, { page: "/careers", added: ["Logistics Coordinator", "Warehouse Operations Lead"], removed: [] }],
  ["selwyn", "site", 20, "Pricing page changed", null, { page: "/pricing", added: ["Next-day delivery within 150 miles of Mobile"], removed: [] }],
  // Ardent 38
  ["ardent", "site", 9, "Careers page changed", null, { page: "/careers", added: ["Yard Driver, nights", "Shipping Coordinator, Logistics"], removed: ["Line Operator, 1st shift"] }],
  ["ardent", "site", 6, "Pricing page changed", null, { page: "/pricing", added: ["Co-packing minimum run: 20 pallets"], removed: ["Co-packing minimum run: 40 pallets"] }],
  ["ardent", "hiring", 9, "Logistics Coordinator", null, { location: "Chattanooga, TN" }],
  ["ardent", "hiring", 9, "Yard Driver, Transportation", null, { location: "Chattanooga, TN" }],
  ["ardent", "hiring", 14, "Supply Chain Planner", null, { location: "Chattanooga, TN" }],
  ["ardent", "news", 8, "Ardent Bottling launches a second canning line", "launch", { source: "Beverage Trade Daily" }],
  ["ardent", "news", 14, "Ardent Bottling and Ridgeline Sparkling sign a co-packing partnership", "partnership", { source: "Beverage Trade Daily" }],
  ["ardent", "news", 5, "Ardent Bottling sponsors Chattanooga riverfront cleanup", "other", { source: "Chattanooga Courier" }],
  // Fennick 31
  ["fennick", "tech", 34, "Removed a legacy WMS", "removed", null],
  ["fennick", "tech", 34, "Added Infor CloudSuite", "added", null],
  ["fennick", "hiring", 12, "Warehouse Operations Manager", null, { location: "Toledo, OH" }],
  ["fennick", "hiring", 12, "Logistics Analyst", null, { location: "Toledo, OH" }],
  ["fennick", "news", 15, "Fennick Auto Parts launches same-day delivery for repair shops in Ohio", "launch", { source: "Aftermarket Wire" }],
  ["fennick", "news", 9, "Fennick Auto Parts marks 40 years in Toledo", "other", { source: "Toledo Business Report" }],
  ["fennick", "site", 11, "Careers page changed", null, { page: "/careers", added: ["Warehouse Operations Manager", "Logistics Analyst"], removed: [] }],
  // Quillon 27
  ["quillon", "funding", 52, "Seed extension, $6M", "seed", { type: "Seed extension", amount: "$6M", investors: "Triangle Bio Ventures" }],
  ["quillon", "hiring", 5, "Cold Chain Logistics Specialist", null, { location: "Raleigh, NC" }],
  ["quillon", "hiring", 5, "Warehouse Operations Lead, GDP", null, { location: "Raleigh, NC" }],
  ["quillon", "site", 9, "Careers page changed", null, { page: "/careers", added: ["Cold Chain Logistics Specialist"], removed: [] }],
  // Marrow Creek 18
  ["marrow", "hiring", 20, "Transportation Scheduler", null, { location: "Boise, ID" }],
  ["marrow", "news", 18, "Marrow Creek Foods launches a frozen sweet potato line", "launch", { source: "Foodservice Report" }],
  ["marrow", "news", 40, "Marrow Creek Foods donates 20 tons of produce to Idaho food banks", "other", { source: "Boise Ledger" }],
  ["marrow", "tech", 25, "Added Blue Yonder TMS", "added", null],
  ["marrow", "site", 35, "Careers page changed", null, { page: "/careers", added: ["Transportation Scheduler"], removed: [] }],
  // Dunmore 12
  ["dunmore", "hiring", 71, "Logistics Yard Planner", null, { location: "Kansas City, MO" }],
  ["dunmore", "hiring", 60, "Transportation Dispatcher", null, { location: "Wichita, KS" }],
  ["dunmore", "tech", 45, "Added RailConnect", "added", null],
  ["dunmore", "news", 50, "Dunmore Rail Services names a new chief commercial officer", "leadership", { source: "Rail Freight Review" }],
  ["dunmore", "site", 40, "Careers page changed", null, { page: "/careers", added: ["Transportation Dispatcher, Wichita"], removed: [] }],
];

// company: note, call, meeting
const TALK: Record<string, [string, string, string]> = {
  brightwell: [
    "Adaeze wants one schedule across all four sites before peak. Dayton opens in Q1 and has no dock process yet.",
    "Call with Marcus. Detention fees ran $41k last quarter, mostly at the Indianapolis cross-dock. He will pull the gate logs.",
    "Proposal review with Adaeze and Rafael. Rafael asked for a 3-year term with a price hold. No objection on scope.",
  ],
  kestrel: [
    "Priya's reefer carriers get 2-hour windows today, booked by email. Missed windows mean spoiled loads, so she tracks them by hand.",
    "Call with Declan. Budget is approved for this fiscal year if we can go live before the Modesto freezer opens.",
    "Discovery meeting with Priya and Mei-Ling. They want carrier self-booking and a door view for the night shift.",
  ],
  ostrava: [
    "Tomasz confirmed they just rolled out a yard system at Newark. Dock scheduling is still a shared spreadsheet per terminal.",
    "Call with Ivana. Security review is the gate: SOC 2 report and the questionnaire. Procurement comes after.",
    "On-site at Port Newark with Tomasz and Katarina. Walked the gate. 30 to 45 minute truck queues in the morning.",
  ],
  halden: [
    "Callum is mid-migration to a new WMS. He wants appointment data to land in it without double entry.",
    "Call with Bronwyn. New owners want will-call wait times cut in half by spring.",
    "Demo for Callum and Bronwyn. Most questions were on the WMS integration and on contractor pickup slots.",
  ],
  tamarind: [
    "Lucia is planning the Reno DC. Sacramento runs 110 inbound loads a day on a paper door sheet.",
    "Call with Gideon. He needs live door status on the floor, not a report the next morning.",
    "Intro meeting with Lucia and Owen. Owen asked how pricing scales when Reno opens.",
  ],
  northgate: [
    "Yusuf replied to the cold email after the Sunday delivery launch. Line-haul trailers stack up at the hub from 2 am.",
    "Short call with Camille. She owns the Eagan hub and wants to see the carrier view.",
    "First meeting with Yusuf. Agreed to map one week of hub arrivals before a demo.",
  ],
  selwyn: [
    "Small receiving dock, six doors. The new COO is reviewing every vendor, so timing depends on him.",
    "Call with Henrik. He ran a larger dock operation at his last company and knows the problem.",
    "Meeting with Henrik. He asked to revisit after his first 60 days.",
  ],
  ardent: [
    "Renata's yard holds 80 trailers and the plant schedules pickups by phone. Night shift has no visibility.",
    "Call with Elias. Legal wants their paper. He will send the MSA template this week.",
    "Proposal walkthrough with Renata and Elias. They accepted the two-phase rollout, docks first, then the yard.",
  ],
  fennick: [
    "Teodoro is retiring the old warehouse system across four sites. Scheduling is on his list for next year.",
    "Call with Ingrid. Toledo receives 60 LTL deliveries a day with no appointments at all.",
    "Qualification meeting with Teodoro. Needs an ROI model using their own trailer counts.",
  ],
  quillon: [
    "Anneliese needs a documented chain of custody at the dock for audits. Volume is low, compliance is the driver.",
    "Call with Anneliese. An audit is coming and she wants to know if we can be live before it.",
    "Intro meeting with Anneliese. Dmitri from quality will join the next one.",
  ],
  marrow: [
    "Shauna signed. Kickoff is set, Paulo will be the day-to-day lead on the dock.",
    "Call with Shauna. First week live, carriers booked 212 appointments without a phone call.",
    "Kickoff meeting with Shauna, Paulo and Leilani. Carrier onboarding list agreed.",
  ],
  dunmore: [
    "Bartholomew stopped replying after the committee meeting. Their rail system vendor offered a scheduling module at no cost.",
    "Call with Zanele. She preferred our carrier view but the decision was made above her.",
    "Final meeting with Bartholomew. They are staying with the incumbent for now.",
  ],
  vessel: [
    "Odette downloaded the dock checklist. One building, eight doors. Too small today, worth a check in spring.",
    "Call with Odette. Inbound containers arrive in bursts around promotions and block the doors.",
    "Short intro meeting with Odette. No project yet.",
  ],
};

// title, company, deal, due in days (negative is overdue), done
const TASKS: [string, string, string | null, number, boolean][] = [
  ["Send Rafael the 3-year pricing table", "brightwell", "d-brightwell", -1, false],
  ["Chase the SOC 2 report for Ivana", "ostrava", "d-ostrava", -3, false],
  ["Reply to Callum on the WMS field mapping", "halden", "d-halden", -1, false],
  ["Confirm Thursday demo slot with Priya", "kestrel", "d-kestrel", 0, false],
  ["Prepare the Reno DC door plan for Lucia", "tamarind", "d-tamarind", 0, false],
  ["Draft the ROI model for Teodoro", "fennick", "d-fennick", 5, false],
];

const cid = (slug: string) => `co-${slug}`;
const pid = (first: string, last: string) => `p-${`${first}-${last}`.toLowerCase().replace(/[^a-z-]/g, "")}`;

/** Builds the full demo dataset relative to `now`. Pure, so the seed test can assert its sums. */
export function seedDemo(now: Date = new Date()): DemoData {
  const d = emptyData();
  const t0 = now.getTime();
  const ago = (days: number, hours = 0) => new Date(t0 - days * DAY - hours * 3_600_000).toISOString();
  const dateIn = (days: number) => new Date(t0 + days * DAY).toISOString().slice(0, 10);
  const row = <T extends TableName>(table: T, r: Partial<Tables[T]>): Tables[T] => {
    const full = { created_at: ago(30), ...structuredClone(ROW_DEFAULTS[table]), ...r } as Tables[T];
    (d[table] as Tables[T][]).push(full);
    return full;
  };

  d.settings.push({
    id: "settings-demo",
    created_at: ago(120),
    role_keywords: [...DEMO_ROLE_KEYWORDS],
    default_pages: ["/pricing", "/careers"],
    weights: { ...DEFAULT_WEIGHTS },
    action_ceiling_usd: null,
  });

  // Signals first, so each company's score is computed from them and never drifts from the rule.
  SIGNALS.forEach(([slug, kind, days, title, tag, detail], i) => {
    const domain = COMPANIES.find((c) => c[0] === slug)![2];
    const page = (detail?.page as string | undefined) ?? null;
    const url =
      kind === "site" ? `https://${domain}${page}` : kind === "hiring" ? `https://${domain}/careers/${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : kind === "news" ? `https://news.example/${slug}/${i}` : kind === "funding" ? `https://${domain}/press/funding` : null;
    row("signals", {
      id: `s-${i + 1}`,
      company_id: cid(slug),
      kind,
      title,
      tag: kind === "news" || kind === "tech" ? tag : null,
      detail: detail ? JSON.stringify(detail) : null,
      url,
      occurred_at: ago(days, 2),
      created_at: ago(Math.max(0, days - 1), 1),
      points: basePoints(kind, tag),
      dedupe_key: `${kind}:${i}`,
      read_at: days > 9 ? ago(days - 1) : null,
    });
  });

  COMPANIES.forEach(([slug, name, domain, industry, employees, hq, description, tech], i) => {
    const signals = d.signals.filter((s) => s.company_id === cid(slug));
    const checked = slug !== "lowmoor";
    const { score, breakdown } = scoreCompany(signals, DEFAULT_WEIGHTS, now);
    const checkedDays = [2, 1, 1, 3, 5, 3, 8, 1, 6, 5, 22, 40, 16, 0][i];
    row("companies", {
      id: cid(slug),
      name,
      domain,
      industry,
      employees,
      hq,
      description,
      linkedin_url: null,
      tech,
      watched_pages: [`https://${domain}/pricing`, `https://${domain}/careers`],
      score,
      score_updated_at: checked ? ago(checkedDays) : null,
      intent_checked_at: checked ? ago(checkedDays, 3) : null,
      enriched_at: checked ? ago(60 + i) : null,
      updated_at: ago(checkedDays),
      created_at: ago(150 - i * 4),
    });
    if (!checked) return;
    // Twelve weekly points that end on the current score.
    const shape = [0.34, 0.38, 0.36, 0.45, 0.5, 0.48, 0.58, 0.63, 0.6, 0.72, 0.79, 1];
    shape.forEach((f, w) => {
      const wobble = ((i * 7 + w * 3) % 5) - 2;
      const v = w === 11 ? score : Math.max(0, Math.min(100, Math.round(score * (i % 3 === 2 ? 1.25 - f * 0.25 : f)) + (score ? wobble : 0)));
      row("score_history", { id: `h-${slug}-${w}`, company_id: cid(slug), score: v, breakdown: w === 11 ? breakdown : {}, at: ago((11 - w) * 7 + (w === 11 ? checkedDays : 0)), created_at: ago((11 - w) * 7) });
    });
    row("signal_baselines", { id: `b-${slug}-tech`, company_id: cid(slug), kind: "tech", key: "tech", hash: null, content: tech.join("\n"), checked_at: ago(checkedDays) });
    for (const p of ["/pricing", "/careers"]) {
      row("signal_baselines", { id: `b-${slug}-${p.slice(1)}`, company_id: cid(slug), kind: "site", key: `https://${domain}${p}`, hash: `demo-${slug}-${p.slice(1)}`, content: `${name}\n${p === "/pricing" ? "Request a quote" : "Open roles"}`, checked_at: ago(checkedDays) });
    }
  });

  CONTACTS.forEach(([slug, first, last, title, status, hasEmail, hasPhone], i) => {
    const domain = COMPANIES.find((c) => c[0] === slug)![2];
    const local = `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, "");
    row("contacts", {
      id: pid(first, last),
      company_id: cid(slug),
      first_name: first,
      last_name: last,
      title,
      email: hasEmail ? `${local}@${domain}` : null,
      email_status: status,
      email_checked_at: status === "unchecked" ? null : ago(3 + (i % 9)),
      phone: hasPhone ? `+1 (${[614, 559, 973, 704, 916, 612, 251, 423, 419, 919, 208][i % 11]}) 555-01${String(10 + i).padStart(2, "0")}` : null,
      phone_found_at: hasPhone ? ago(3 + (i % 9)) : null,
      linkedin_url: `https://www.linkedin.example/in/${local.replace(".", "-")}`,
      source: status === "unchecked" ? "csv" : i % 4 === 0 ? "looot" : i % 3 === 0 ? "manual" : "csv",
      created_at: ago(140 - i * 3, i),
    });
  });

  const perStage: Record<string, number> = {};
  DEALS.forEach(([id, slug, name, stage, amount, closeIn, nextStep, dueIn, reason], i) => {
    perStage[stage] = (perStage[stage] ?? 0) + 1;
    row("deals", {
      id,
      company_id: cid(slug),
      name,
      stage,
      amount_cents: amount * 100,
      close_date: dateIn(closeIn),
      next_step: nextStep,
      next_step_due: dueIn === null ? null : dateIn(dueIn),
      position: perStage[stage] * 1000,
      closed_reason: reason,
      stage_changed_at: ago(stage === "won" || stage === "lost" ? -closeIn : 4 + i * 2),
      created_at: ago(70 + i * 3),
    });
    const people = d.contacts.filter((c) => c.company_id === cid(slug)).slice(0, 2);
    people.forEach((p, k) => row("deal_contacts", { id: `dc-${id}-${k}`, deal_id: id, contact_id: p.id, role: k === 0 ? "champion" : "buyer" }));
  });

  // 13 companies x (note, call, meeting, stage change) = 52 activities.
  let n = 0;
  const act = (kind: ActivityKind, slug: string, body: string | null, daysAgo: number, extra: Partial<Tables["activities"]> = {}) =>
    row("activities", { id: `a-${++n}`, kind, company_id: cid(slug), body, created_at: ago(daysAgo, n % 7), ...extra });
  Object.entries(TALK).forEach(([slug, [note, call, meeting]], i) => {
    const deal = DEALS.find((x) => x[1] === slug)!;
    const contact = d.contacts.find((c) => c.company_id === cid(slug))!;
    const closedDays = deal[3] === "won" || deal[3] === "lost" ? -deal[5] : 0;
    act("meeting", slug, meeting, closedDays + 3 + (i % 4), { deal_id: deal[0], contact_id: contact.id });
    act("stage_change", slug, null, closedDays + 4 + i * 2, { deal_id: deal[0], meta: { from: deal[3] === "lead" ? null : "lead", to: deal[3] } });
    act("call", slug, call, closedDays + 9 + (i % 5), { deal_id: deal[0], contact_id: contact.id });
    act("note", slug, note, closedDays + 16 + (i % 6), { deal_id: deal[0] });
  });
  // 6 tasks: 3 overdue, 2 due today, 1 later.
  TASKS.forEach(([title, slug, dealId, dueIn], i) => {
    act("task", slug, title, 4 + i, { deal_id: dealId, due_at: new Date(t0 + dueIn * DAY).toISOString().slice(0, 10) + "T17:00:00.000Z" });
  });
  // 6 enrichment entries.
  const enr: [string, string, number][] = [
    ["brightwell", "Found a work email and phone for Adaeze Okonkwo. $0.0469.", 12],
    ["kestrel", "Found a work email for Mei-Ling Tsao. $0.0205.", 7],
    ["ostrava", "Company details filled from looot: industry, headcount, HQ. $0.0019.", 30],
    ["halden", "Email for Darius Montazeri checked: invalid. $0.0015.", 9],
    ["tamarind", "Found 8 people matching \"supply chain, logistics\". 3 added.", 6],
    ["ardent", "Found a work email and phone for Elias Vanterpool. $0.0469.", 3],
  ];
  enr.forEach(([slug, body, days]) => act("enrichment", slug, body, days));

  seedSpend(d, ago);
  return d;
}

/** 23 actions with 71 runs, spread over the last 30 days. */
function seedSpend(d: DemoData, ago: (days: number, hours?: number) => string) {
  let a = 0;
  let r = 0;
  type RunSeed = [JobId, string, string | null, RunOutcome, number, string?, string?];
  const price = (id: JobId) => FALLBACK_PRICES[id];
  const action = (kind: ActionKind, label: string, targets: number, days: number, max: number, status: ActionStatus, runs: RunSeed[], hour = 0) => {
    const id = `act-${++a}`;
    const estimate = round6(runs.reduce((s, x) => s + price(x[0]), 0));
    const actual = round6(runs.reduce((s, x) => s + x[4], 0));
    d.actions.push({
      id,
      created_at: ago(days, hour),
      action_key: `demo-key-${a}`,
      kind,
      target_count: targets,
      target_label: label,
      estimate_usd: estimate,
      max_cost_usd: max,
      actual_usd: actual,
      status,
      finished_at: ago(days, hour),
    });
    runs.forEach(([job, targetType, targetId, outcome, cost, error, note], i) => {
      r++;
      d.runs.push({
        id: `run-${r}`,
        created_at: ago(days, hour),
        action_id: id,
        job_id: job,
        step: JOBS[job].feature,
        target_type: targetType,
        target_id: targetId,
        idempotency_key: `crm:demo-key-${a}:${job}:${targetId ?? "x"}${job === "web.scrape.markdown" ? `:${i}` : ""}`,
        looot_run_id: outcome === "skipped" ? null : `run_${(0x5f3a1c00 + r * 7919).toString(16)}${(r * 104729).toString(16).padStart(6, "0")}`,
        status: outcome === "skipped" ? null : outcome === "failed" ? "failed" : "completed",
        outcome,
        cap_usd: JOBS[job].cap,
        cost_usd: cost,
        error: error ?? null,
        note: note ?? null,
      });
    });
  };
  const co = (slug: string) => `co-${slug}`;
  const name = (slug: string) => d.companies.find((c) => c.id === co(slug))!.name;
  const full = (slug: string, days: number, opts: { techFail?: boolean; quiet?: boolean } = {}) => {
    const out: RunOutcome = opts.quiet ? "no_result" : "data";
    action("intent_refresh", name(slug), 1, days, 0.13, opts.techFail ? "partial" : "done", [
      ["jobs.search", "company", co(slug), out, 0.00145],
      ["news.search", "company", co(slug), out, 0.00099],
      opts.techFail ? ["company.technographics", "company", co(slug), "failed", 0, "Provider timed out."] : ["company.technographics", "company", co(slug), opts.quiet ? "no_result" : "data", 0.01, undefined, opts.quiet ? "Baseline saved" : undefined],
      ["company.funding", "company", co(slug), opts.quiet ? "no_result" : "data", opts.quiet ? 0 : 0.01],
      ["web.scrape.markdown", "company", co(slug), opts.quiet ? "no_result" : "data", 0.001, undefined, opts.quiet ? "Baseline saved" : undefined],
      ["web.scrape.markdown", "company", co(slug), "no_result", 0.001],
    ], 3);
  };
  // 6 full refreshes, 36 runs.
  full("brightwell", 2);
  full("kestrel", 1);
  full("ostrava", 1);
  full("halden", 3);
  full("ardent", 1, { techFail: true });
  full("vessel", 16, { quiet: true });
  // 5 single-kind refreshes, 5 runs.
  action("intent_refresh", `${name("tamarind")}: news`, 1, 5, 0.01, "done", [["news.search", "company", co("tamarind"), "data", 0.00099]], 5);
  action("intent_refresh", `${name("northgate")}: hiring`, 1, 3, 0.02, "done", [["jobs.search", "company", co("northgate"), "data", 0.00145]], 6);
  action("intent_refresh", `${name("selwyn")}: news`, 1, 8, 0.01, "done", [["news.search", "company", co("selwyn"), "data", 0.00099]], 2);
  action("intent_refresh", `${name("fennick")}: tech stack`, 1, 6, 0.02, "done", [["company.technographics", "company", co("fennick"), "data", 0.0089]], 4);
  action("intent_refresh", `${name("quillon")}: hiring`, 1, 5, 0.02, "done", [["jobs.search", "company", co("quillon"), "data", 0.00145]], 7);
  // Stopped at the confirmed max: $0.0462 of $0.05, 2 of 3 contacts done. 9 runs.
  action("contact_enrich", "3 contacts", 3, 4, 0.05, "stopped_at_max", [
    ["people.email.find", "contact", "p-hye-jin-bae", "data", 0.019],
    ["people.email.verify", "contact", "p-hye-jin-bae", "data", 0.0015],
    ["people.phone.find", "contact", "p-hye-jin-bae", "no_result", 0.0052],
    ["people.email.find", "contact", "p-katarina-novotna", "data", 0.019],
    ["people.email.verify", "contact", "p-katarina-novotna", "data", 0.0015],
    ["people.phone.find", "contact", "p-katarina-novotna", "skipped", 0, undefined, "Left of the max: $0.0038. This step needs $0.0264."],
    ["people.email.find", "contact", "p-noor-al-sayed", "skipped", 0, undefined, "Stopped at the max"],
    ["people.email.verify", "contact", "p-noor-al-sayed", "skipped", 0, undefined, "Stopped at the max"],
    ["people.phone.find", "contact", "p-noor-al-sayed", "skipped", 0, undefined, "Stopped at the max"],
  ], 1);
  // 3 single contact enrichments, 9 runs.
  const enrich = (pidv: string, label: string, days: number, phone: boolean, email = true) =>
    action("contact_enrich", label, 1, days, 0.1, email && phone ? "done" : "partial", [
      ["people.email.find", "contact", pidv, email ? "data" : "no_result", email ? 0.019 : 0],
      ["people.email.verify", "contact", pidv, email ? "data" : "skipped", email ? 0.00145 : 0, undefined, email ? undefined : "No email to verify"],
      ["people.phone.find", "contact", pidv, phone ? "data" : "no_result", phone ? 0.0264 : 0],
    ], 2);
  enrich("p-adaeze-okonkwo", "Adaeze Okonkwo", 12, true);
  enrich("p-elias-vanterpool", "Elias Vanterpool", 3, true);
  enrich("p-jonas-brandt", "Jonas Brandt", 9, false, false);
  // 4 company enrichments, 4 runs.
  [["ostrava", 28], ["tamarind", 26], ["northgate", 21], ["quillon", 18]].forEach(([slug, days]) =>
    action("company_enrich", name(slug as string), 1, days as number, 0.02, "done", [["company.enrich", "company", co(slug as string), "data", 0.0019]], 4),
  );
  // 2 people searches, 2 runs.
  action("find_people", "Like Lucia Benavides, Tamarind Grocers Co-op", 1, 6, 0.02, "done", [["people.search", "contact", "p-lucia-benavides", "data", 0.00288, undefined, "8 of 10 matched your keywords"]], 5);
  action("find_people", "Like Tomasz Wieczorek, Ostrava Freight Group", 1, 14, 0.02, "done", [["people.search", "contact", "p-tomasz-wieczorek", "data", 0.0036, undefined, "6 of 10 matched your keywords"]], 5);
  // 2 bulk verifications of 3 contacts, 6 runs.
  action("email_verify", "3 contacts", 3, 9, 0.03, "done", [
    ["people.email.verify", "contact", "p-darius-montazeri", "data", 0.00145],
    ["people.email.verify", "contact", "p-samuel-oyelaran", "data", 0.00145],
    ["people.email.verify", "contact", "p-owen-thackeray", "data", 0.00145],
  ], 6);
  action("email_verify", "3 contacts", 3, 20, 0.03, "done", [
    ["people.email.verify", "contact", "p-bartholomew-finch", "data", 0.00145],
    ["people.email.verify", "contact", "p-zanele-mokoena", "data", 0.00145],
    ["people.email.verify", "contact", "p-ingrid-halvorsen", "data", 0.00145],
  ], 6);
}
