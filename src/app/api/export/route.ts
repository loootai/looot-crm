import { NextResponse } from "next/server";
import { bad, sessionOr401 } from "@/lib/api";
import { toCsv } from "@/lib/csv";
import { TABLE_NAMES, type TableName } from "@/lib/types";

/** Downloads one table as CSV. Only the signed-in user's rows. */
export async function GET(request: Request) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;
  const table = new URL(request.url).searchParams.get("table") as TableName | null;
  if (!table || !TABLE_NAMES.includes(table)) return bad("Unknown table.");
  const rows = (await session.store.all(table)).map((r) => {
    const { owner_id: _owner, ...rest } = r as unknown as Record<string, unknown>;
    void _owner;
    return rest;
  });
  return new NextResponse(toCsv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${table}.csv"` } });
}
