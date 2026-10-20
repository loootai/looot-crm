import { protectedResourceMetadata } from "@/lib/mcp/server";

/** OAuth protected-resource metadata (RFC 9728) for /mcp. Public: MCP clients read it to find the sign-in server. */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return Response.json(protectedResourceMetadata(new URL(req.url).origin), { headers: { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" } });
}
