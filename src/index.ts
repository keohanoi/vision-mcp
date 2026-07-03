import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createProvider, loadConfig } from "./config.js";
import { registerTools } from "./tools.js";

// NOTE: stdout is the MCP transport — never console.log to stdout here.
// If you need a startup log, write to console.error.

const server = new McpServer({ name: "vision-mcp", version: "0.1.0" });
const cfg = loadConfig(); // throws with a clear message if config is incomplete
const provider = createProvider(cfg);
registerTools(server, provider);

const transport = new StdioServerTransport();
await server.connect(transport);
