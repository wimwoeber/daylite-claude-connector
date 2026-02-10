import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DayliteRestClient } from "../daylite-rest-client.js";

export function registerSearchTools(server: McpServer, client: DayliteRestClient) {
  server.tool(
    "daylite_search",
    "Übergreifend in Daylite suchen (Kontakte, Firmen, Opportunities, Projekte)",
    {
      query: z.string().describe("Suchbegriff"),
      type: z.enum(["contacts", "companies", "opportunities", "projects", "all"]).optional()
        .describe("Typ einschränken (Standard: all)"),
      limit: z.number().optional().describe("Maximale Ergebnisse pro Typ (Standard: 10)"),
    },
    async ({ query, type, limit }) => {
      try {
        const maxResults = limit || 10;
        const searchTypes = type === "all" || !type 
          ? ["contacts", "companies", "opportunities", "projects"] 
          : [type];

        const results: string[] = [];

        for (const searchType of searchTypes) {
          try {
            // Try the search endpoint first
            const params: Record<string, string> = {
              q: query,
              limit: String(maxResults),
            };
            const data = await client.get(`/${searchType}`, params);
            const items = Array.isArray(data) ? data : data?.[searchType] || data?.data || [];
            
            if (items.length > 0) {
              const formatted = items.map((item: any) => {
                const parts: string[] = [`  ID: ${item.id}`];
                if (item.name) parts.push(`  Name: ${item.name}`);
                if (item.first_name || item.last_name) {
                  parts.push(`  Name: ${[item.first_name, item.last_name].filter(Boolean).join(" ")}`);
                }
                if (item.title) parts.push(`  Titel: ${item.title}`);
                if (item.emails?.length > 0) {
                  parts.push(`  E-Mail: ${item.emails.map((e: any) => e.address || e).join(", ")}`);
                }
                if (item.status) parts.push(`  Status: ${item.status}`);
                if (item.amount || item.value) parts.push(`  Wert: ${item.amount || item.value}`);
                return parts.join("\n");
              }).join("\n  ---\n");
              
              const typeLabels: Record<string, string> = {
                contacts: "Kontakte",
                companies: "Firmen",
                opportunities: "Verkaufschancen",
                projects: "Projekte",
              };
              results.push(`### ${typeLabels[searchType] || searchType} (${items.length}):\n${formatted}`);
            }
          } catch {
            // Skip types that fail (e.g., search not supported for that type)
          }
        }

        if (results.length === 0) {
          return { content: [{ type: "text", text: `Keine Ergebnisse für "${query}" gefunden.` }] };
        }

        return { content: [{ type: "text", text: `Suchergebnisse für "${query}":\n\n${results.join("\n\n")}` }] };
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
        const pipelines = Array.isArray(data) ? data : data?.pipelines || data?.data || [];
        if (pipelines.length === 0) {
          return { content: [{ type: "text", text: "Keine Pipelines gefunden." }] };
        }
        const text = pipelines.map((p: any) => {
          const parts = [`ID: ${p.id}`, `Name: ${p.name}`];
          if (p.stages?.length > 0) {
            parts.push(`Stufen: ${p.stages.map((s: any) => `${s.name} (ID: ${s.id})`).join(" → ")}`);
          }
          return parts.join("\n");
        }).join("\n---\n");
        return { content: [{ type: "text", text: `${pipelines.length} Pipeline(s):\n\n${text}` }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Fehler: ${error.message}` }], isError: true };
      }
    }
  );
}
