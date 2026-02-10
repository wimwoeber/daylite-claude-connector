import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DayliteRestClient } from "../daylite-rest-client.js";

/** Extract numeric ID from self URL like /v1/contacts/1000 */
function extractId(self: string | undefined): string | null {
  if (!self) return null;
  const parts = self.split("/");
  return parts[parts.length - 1] || null;
}

/** Get display name from any entity */
function getDisplayName(item: any): string {
  return item.name || item.full_name || [item.first_name, item.last_name].filter(Boolean).join(" ") || "(ohne Name)";
}

/** Check if an item matches the search query (client-side filtering) */
function matchesQuery(item: any, query: string): boolean {
  const q = query.toLowerCase();
  const name = getDisplayName(item).toLowerCase();
  if (name.includes(q)) return true;
  // Also check category and keywords
  if (item.category && item.category.toLowerCase().includes(q)) return true;
  if (item.keywords) {
    for (const kw of item.keywords) {
      if ((typeof kw === "string" ? kw : kw.name || "").toLowerCase().includes(q)) return true;
    }
  }
  return false;
}

export function registerSearchTools(server: McpServer, client: DayliteRestClient) {
  server.tool(
    "daylite_search",
    "Übergreifend in Daylite suchen (Kontakte, Firmen, Opportunities, Projekte)",
    {
      query: z.string().describe("Suchbegriff"),
      type: z.enum(["contacts", "companies", "opportunities", "projects", "all"]).optional().describe("Typ einschränken (Standard: all)"),
      limit: z.number().optional().describe("Maximale Ergebnisse pro Typ (Standard: 10)"),
    },
    async ({ query, type, limit }) => {
      try {
        const searchType = type || "all";
        const maxResults = limit || 10;
        const results: string[] = [];
        
        const endpoints = searchType === "all" 
          ? ["contacts", "companies", "opportunities", "projects"]
          : [searchType];

        for (const endpoint of endpoints) {
          try {
            // Fetch all items and filter client-side
            // (Daylite REST API has no server-side search)
            const data = await client.get(`/${endpoint}`);
            const items = Array.isArray(data) ? data : data?.data || [];
            const filtered = items.filter((item: any) => matchesQuery(item, query));
            
            if (filtered.length > 0) {
              const label = endpoint === "contacts" ? "Kontakte" : 
                           endpoint === "companies" ? "Firmen" :
                           endpoint === "opportunities" ? "Opportunities" : "Projekte";
              results.push(`### ${label} (${filtered.length}):`);
              for (const item of filtered.slice(0, maxResults)) {
                const id = extractId(item.self);
                const name = getDisplayName(item);
                results.push(`  ID: ${id || "?"}\n  Name: ${name}\n  ---`);
              }
            }
          } catch (e: any) {
            results.push(`### ${endpoint}: Fehler - ${e.message}`);
          }
        }

        if (results.length === 0) {
          return { content: [{ type: "text", text: `Keine Ergebnisse für "${query}" gefunden.` }] };
        }

        return { content: [{ type: "text", text: `Suchergebnisse für "${query}":\n\n${results.join("\n")}` }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Fehler: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "daylite_list_pipelines",
    "Verfügbare Pipelines aus Daylite auflisten",
    {},
    async () => {
      try {
        const data = await client.get("/pipelines");
        const pipelines = Array.isArray(data) ? data : data?.data || [];
        if (pipelines.length === 0) {
          return { content: [{ type: "text", text: "Keine Pipelines gefunden." }] };
        }
        const text = pipelines.map((p: any) => {
          const parts: string[] = [];
          const id = extractId(p.self);
          if (id) parts.push(`ID: ${id}`);
          if (p.name) parts.push(`Name: ${p.name}`);
          // Pipeline stages (if available in detail view)
          if (p.stages?.length > 0) {
            parts.push(`Stufen:`);
            for (const s of p.stages) {
              const sId = extractId(s.self);
              parts.push(`  - ${s.name || "?"} (ID: ${sId || "?"})`);
            }
          }
          return parts.join("\n");
        }).join("\n---\n");
        return { content: [{ type: "text", text: `${pipelines.length} Pipeline(s):\n\n${text}` }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Fehler: ${error.message}` }], isError: true };
      }
    }
  );

  // Debug tool to see raw API response structure
  server.tool(
    "daylite_debug_raw",
    "Debug: Zeigt die rohe API-Antwort für einen Endpoint (für Troubleshooting)",
    {
      endpoint: z.string().describe("API-Endpoint z.B. /companies, /contacts/123"),
    },
    async ({ endpoint }) => {
      try {
        const data = await client.get(endpoint, { limit: "2" });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2).slice(0, 8000) }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Fehler: ${error.message}` }], isError: true };
      }
    }
  );
}
