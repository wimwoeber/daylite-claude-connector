#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DayliteCalDAVClient } from "./daylite-client.js";
import { registerTaskTools } from "./tools/tasks.js";
import { registerAppointmentTools } from "./tools/appointments.js";

const DEFAULT_SERVER_URL = "https://caldav.marketcircle.net";

function getConfig() {
  const username = process.env.DAYLITE_USERNAME;
  const password = process.env.DAYLITE_PASSWORD;

  if (!username || !password) {
    console.error(
      "Fehler: DAYLITE_USERNAME und/oder DAYLITE_PASSWORD nicht gesetzt.\n\n" +
        "Bitte setze deine Daylite CalDAV-Zugangsdaten:\n" +
        "  export DAYLITE_USERNAME=dein-app-benutzername\n" +
        "  export DAYLITE_PASSWORD=dein-app-passwort\n\n" +
        "Du findest diese in den Daylite-Einstellungen unter\n" +
        "'Kalender und Kontakte Integration' > '+ Neue App-Anmeldung'."
    );
    process.exit(1);
  }

  return {
    serverUrl: process.env.DAYLITE_SERVER_URL || DEFAULT_SERVER_URL,
    username,
    password,
  };
}

async function main() {
  const config = getConfig();
  const client = new DayliteCalDAVClient(config);

  const server = new McpServer({
    name: "daylite",
    version: "1.0.0",
  });

  // Tools registrieren
  registerTaskTools(server, client);
  registerAppointmentTools(server, client);

  // Server über stdio starten
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Daylite MCP Server läuft (CalDAV via stdio)");
}

main().catch((error) => {
  console.error("Fataler Fehler:", error);
  process.exit(1);
});
