import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createSmitheryUrl } from "@smithery/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

// TODO: Set these values for your deployment/environment:
const serverUrl = process.env.SMITHERY_SERVER_URL; // e.g. 'https://api.smithery.ai'
const config = {}; // your config object if needed
const apiKey = process.env.SMITHERY_API_KEY; // set your API key as an environment variable

if (!serverUrl || !apiKey) {
  console.error(
    "Missing serverUrl or apiKey. Please set SMITHERY_SERVER_URL and SMITHERY_API_KEY env vars."
  );
  process.exit(1);
}

const url = createSmitheryUrl(serverUrl, config, apiKey);
const transport = new StreamableHTTPClientTransport(url);

const client = new Client({
  name: "browserbase client",
  version: "1.0.0",
});

async function main() {
  await client.connect(transport);
  console.log("Connected to MCP!");
  // Additional logic goes here
}

main();
