#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DayliteRestClient } from "./daylite-rest-client.js";
import { registerTaskTools } from "./tools/tasks.js";
import { registerAppointmentTools } from "./tools/appointments.js";
import { registerContactTools } from "./tools/contacts.js";
import { registerCompanyTools } from "./tools/companies.js";
import { registerOpportunityTools } from "./tools/opportunities.js";
import { registerProjectTools } from "./tools/projects.js";
import { registerSearchTools } from "./tools/rest-search.js";

function getConfig() {
  const refreshToken = process.env.DAYLITE_REFRESH_TOKEN;

  if (!refreshToken) {
    console.error(
      "Fehler: DAYLITE_REFRESH_TOKEN nicht gesetzt.\n\n" +
        "Token generieren unter: https://developer.daylite.app/reference/personal-token\n" +
        "Dann in claude_desktop_config.json als DAYLITE_REFRESH_TOKEN eintragen."
    );
    process.exit(1);
  }

  return { refreshToken };
}

async function main() {
  const config = getConfig();

  const server = new McpServer({
    name: "daylite",
    version: "3.0.0",
  });

  const client = new DayliteRestClient(config);

  // Alle Tools registrieren
  registerTaskTools(server, client);
  registerAppointmentTools(server, client);
  registerContactTools(server, client);
  registerCompanyTools(server, client);
  registerOpportunityTools(server, client);
  registerProjectTools(server, client);
  registerSearchTools(server, client);

  // Server über stdio starten
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Daylite MCP Server v3.0 läuft (REST API: Tasks, Termine, Kontakte, Firmen, Opportunities, Projekte, Suche, Pipelines)");
}

main().catch((error) => {
  console.error("Fataler Fehler:", error);
  process.exit(1);
});
