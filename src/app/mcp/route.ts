import { handleMcp } from "@/lib/mcp/server";

/** The CRM's MCP endpoint (Streamable HTTP, stateless). It checks its own bearer token, not the cookie session; see src/lib/mcp/server.ts. */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handleMcp(req);
}

export async function GET(req: Request) {
  return handleMcp(req);
}

export async function DELETE(req: Request) {
  return handleMcp(req);
}
