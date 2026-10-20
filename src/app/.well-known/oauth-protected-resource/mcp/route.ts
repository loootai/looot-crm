import { protectedResourceMetadata } from "@/lib/mcp/server";

/** The same metadata at the path-suffixed location (RFC 9728 section 3.1) that some MCP clients try first. */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return Response.json(protectedResourceMetadata(new URL(req.url).origin), { headers: { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" } });
}
