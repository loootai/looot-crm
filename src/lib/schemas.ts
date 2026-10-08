import { z } from "zod";
import { STEP_IDS } from "./plan";

const id = z.string().min(1).max(80);
export const ACTION_KINDS = ["intent_refresh", "contact_enrich", "company_enrich", "find_people", "email_verify"] as const;

export const QuoteSchema = z.object({
  kind: z.enum(ACTION_KINDS),
  targetIds: z.array(id).min(1).max(500),
  steps: z.array(z.enum(STEP_IDS)).max(10).optional(),
  options: z.object({ keywords: z.array(z.string().max(60)).max(12).optional(), limit: z.number().int().min(1).max(25).optional() }).optional(),
});

export const ActionSchema = QuoteSchema.extend({
  actionKey: z.string().uuid(),
  maxCostUsd: z.number().positive().max(1000),
});

export const ImportSchema = z.object({
  csv: z.string().min(1).max(4_000_000),
  mapping: z.record(z.string(), z.number().int().min(0).max(200)),
  hasHeader: z.boolean().default(true),
});
