// Real MCP-protocol test: spawn the server as a subprocess and drive it through
// the official client SDK (initialize -> tools/list -> tools/call). This proves
// the server behaves correctly as an MCP server over stdio, not just via the
// standalone analyze() calls. Run from the project dir (bun loads .env).
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolve } from "node:path";

function textOf(result: unknown): string {
  const obj = (result ?? {}) as { content?: unknown };
  const content = (obj.content ?? []) as Array<{ type: string; text?: string }>;
  return content
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("");
}

async function main(): Promise<void> {
  // Reproduce the exact registered command: bare absolute-path spawn. The
  // server loads .env from its own dir (config.ts -> loadPackageEnv), so this
  // works from any caller cwd — no cd, no key in the command.
  const projectRoot = resolve(import.meta.dir, "..");
  const transport = new StdioClientTransport({
    command: "bun",
    args: ["run", `${projectRoot}/src/index.ts`],
  });

  const client = new Client(
    { name: "vision-mcp-test-client", version: "0.0.0" },
    { capabilities: {} },
  );

  console.error("Connecting to vision-mcp over stdio...");
  await client.connect(transport);

  console.error("Handshake OK. Listing tools...");
  const { tools } = await client.listTools();
  console.log("ADVERTISED TOOLS:", tools.map((t) => t.name).join(", "));

  console.error("Calling analyze_image (real image URL)...");
  const res = await client.callTool({
    name: "analyze_image",
    arguments: {
      image: "https://placehold.co/600x400/png",
      prompt: "What text is in this image? Answer in one short sentence.",
    },
  });
  console.log("analyze_image RESULT:", textOf(res));

  await client.close();
  console.error("Done.");
}

main().catch((err: unknown) => {
  console.error("FAILED:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
