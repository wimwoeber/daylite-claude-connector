#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DayliteCalDAVClient } from "./daylite-client.js";
import { DayliteRestClient } from "./daylite-rest-client.js";
import { registerTaskTools } from "./tools/tasks.js";
import { registerAppointmentTools } from "./tools/appointments.js";
import { registerContactTools } from "./tools/contacts.js";
import { registerCompanyTools } from "./tools/companies.js";
import { registerOpportunityTools } from "./tools/opportunities.js";
import { registerProjectTools } from "./tools/projects.js";
import { registerSearchTools } from "./tools/rest-search.js";

const DEFAULT_SERVER_URL = "https://caldav.marketcircle.net";

function getConfig() {
  const username = process.env.DAYLITE_USERNAME;
  const password = process.env.DAYLITE_PASSWORD;
  const refreshToken = process.env.DAYLITE_REFRESH_TOKEN;

  const hasCalDAV = !!(username && password);
  const hasREST = !!refreshToken;

  if (!hasCalDAV && !hasREST) {
    console.error(
      "Fehler: Keine Zugangsdaten konfiguriert.\n\n" +
        "Für CalDAV (Tasks & Termine):\n" +
        "  DAYLITE_USERNAME und DAYLITE_PASSWORD setzen\n\n" +
        "Für REST API (Kontakte, Firmen, Opportunities, Projekte):\n" +
        "  DAYLITE_REFRESH_TOKEN setzen\n\n" +
        "Beide können gleichzeitig genutzt werden."
    );
    process.exit(1);
  }

  return {
    caldav: hasCalDAV
      ? {
          serverUrl: process.env.DAYLITE_SERVER_URL || DEFAULT_SERVER_URL,
          username: username!,
          password: password!,
        }
      : null,
    rest: hasREST
      ? {
          refreshToken: refreshToken!,
        }
      : null,
  };
}

async function main() {
  const config = getConfig();
  const features: string[] = [];

  const server = new McpServer({
    name: "daylite",
    version: "2.0.0",
  });

  // CalDAV-Tools registrieren (Tasks & Termine)
  if (config.caldav) {
    const caldavClient = new DayliteCalDAVClient(config.caldav);
    registerTaskTools(server, caldavClient);
    registerAppointmentTools(server, caldavClient);
    features.push("CalDAV (Tasks, Termine)");
  }

  // REST API-Tools registrieren (Kontakte, Firmen, etc.)
  if (config.rest) {
    const restClient = new DayliteRestClient(config.rest);
    registerContactTools(server, restClient);
    registerCompanyTools(server, restClient);
    registerOpportunityTools(server, restClient);
    registerProjectTools(server, restClient);
    registerSearchTools(server, restClient);
    features.push("REST API (Kontakte, Firmen, Opportunities, Projekte, Suche, Pipelines)");
  }

  // Server über stdio starten
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Daylite MCP Server v2.0 läuft: ${features.join(" + ")}`);
}

main().catch((error) => {
  console.error("Fataler Fehler:", error);
  process.exit(1);
});
