import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DayliteRestClient } from "../daylite-rest-client.js";

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
            // Try search endpoint first
            const params: Record<string, string> = { q: query };
            if (maxResults) params.limit = String(maxResults);
            
            let data;
            try {
              data = await client.get(`/search/${endpoint}`, params);
            } catch {
              // Fallback: try query param on list endpoint
              try {
                data = await client.get(`/${endpoint}`, { search: query, limit: String(maxResults) });
              } catch {
                data = await client.get(`/${endpoint}`, { q: query, limit: String(maxResults) });
              }
            }
            
            const items = Array.isArray(data) ? data : data?.[endpoint] || data?.data || [];
            if (items.length > 0) {
              const label = endpoint === "contacts" ? "Kontakte" : 
                           endpoint === "companies" ? "Firmen" :
                           endpoint === "opportunities" ? "Opportunities" : "Projekte";
              results.push(`### ${label} (${items.length}):`);
              for (const item of items.slice(0, maxResults)) {
                const id = item.ID || item.id;
                const name = item.Name || item.name || item.FullName || item.full_name || 
                            [item.FirstName || item.first_name, item.LastName || item.last_name].filter(Boolean).join(" ");
                const idStr = id ? `ID: ${id}` : "";
                results.push(`  ${idStr}\n  Name: ${name || "(ohne Name)"}\n  ---`);
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
        const pipelines = Array.isArray(data) ? data : data?.pipelines || data?.Pipelines || data?.data || [];
        if (pipelines.length === 0) {
          return { content: [{ type: "text", text: "Keine Pipelines gefunden." }] };
        }
        const text = pipelines.map((p: any) => {
          const parts: string[] = [];
          const id = p.ID || p.id;
          if (id) parts.push(`ID: ${id}`);
          const name = p.Name || p.name;
          if (name) parts.push(`Name: ${name}`);
          // Pipeline stages
          const stages = p.Stages || p.stages || p.PipelineStages || p.pipeline_stages;
          if (stages?.length > 0) {
            parts.push(`Stufen:`);
            for (const s of stages) {
              const sId = s.ID || s.id;
              const sName = s.Name || s.name;
              parts.push(`  - ${sName || "?"} (ID: ${sId || "?"})`);
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
