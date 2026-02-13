import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DayliteRestClient } from "../daylite-rest-client.js";

/** Extract numeric ID from self URL like /v1/opportunities/1002 */
function extractId(self: string | undefined): string | null {
  if (!self) return null;
  const parts = self.split("/");
  return parts[parts.length - 1] || null;
}

function formatOpportunity(o: any): string {
  const parts: string[] = [];
  const id = extractId(o.self);
  if (id) parts.push(`ID: ${id}`);
  if (o.name) parts.push(`Name: ${o.name}`);
  if (o.state) parts.push(`Status: ${o.state}`);
  if (o.probability !== undefined) parts.push(`Wahrscheinlichkeit: ${o.probability}%`);
  if (o.total !== undefined) parts.push(`Betrag: ${o.total}€`);
  if (o.priority !== undefined && o.priority > 0) parts.push(`Priorität: ${o.priority}`);
  if (o.category) parts.push(`Kategorie: ${o.category}`);
  if (o.start) parts.push(`Start: ${o.start}`);
  if (o.forecasted) parts.push(`Prognose: ${o.forecasted}`);
  // Pipeline
  if (o.current_pipeline) parts.push(`Pipeline: ${o.current_pipeline}`);
  if (o.current_pipeline_stage) parts.push(`Stufe: ${o.current_pipeline_stage}`);
  // Keywords
  if (o.keywords?.length > 0) {
    parts.push(`Schlagwörter: ${o.keywords.join(", ")}`);
  }
  // Contacts
  if (o.contacts?.length > 0) {
    parts.push(`Kontakte: ${o.contacts.map((co: any) => `${co.contact} (${co.role || ""})`).join(", ")}`);
  }
  // Companies
  if (o.companies?.length > 0) {
    parts.push(`Firmen: ${o.companies.map((co: any) => `${co.company} (${co.role || ""})`).join(", ")}`);
  }
  if (o.flagged) parts.push(`⭐ Markiert`);
  if (o.owner) parts.push(`Besitzer: ${o.owner}`);
  return parts.join("\n");
}

export function registerOpportunityTools(server: McpServer, client: DayliteRestClient) {
  server.tool(
    "daylite_list_opportunities",
    "Verkaufschancen (Opportunities) aus Daylite auflisten",
    {
      limit: z.number().optional().describe("Maximale Anzahl (Standard: 50)"),
      offset: z.number().optional().describe("Offset für Paginierung"),
    },
    async ({ limit, offset }) => {
      try {
        const params: Record<string, string> = {};
        if (limit) params.limit = String(limit);
        if (offset) params.offset = String(offset);
        const data = await client.get("/opportunities", params);
        const opportunities = Array.isArray(data) ? data : data?.data || [];
        if (opportunities.length === 0) {
          return { content: [{ type: "text", text: "Keine Verkaufschancen gefunden." }] };
        }
        const display = limit ? opportunities : opportunities.slice(0, 50);
        const text = display.map(formatOpportunity).join("\n---\n");
        return { content: [{ type: "text", text: `${opportunities.length} Verkaufschance(n)${display.length < opportunities.length ? ` (zeige erste ${display.length})` : ""}:\n\n${text}` }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Fehler: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "daylite_get_opportunity",
    "Eine bestimmte Verkaufschance aus Daylite abrufen",
    {
      id: z.number().describe("Die Daylite Opportunity-ID"),
    },
    async ({ id }) => {
      try {
        const data = await client.get(`/opportunities/${id}`);
        return { content: [{ type: "text", text: formatOpportunity(data) }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Fehler: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "daylite_create_opportunity",
    "Neue Verkaufschance in Daylite anlegen",
    {
      name: z.string().describe("Name der Verkaufschance"),
      amount: z.number().optional().describe("Wert in Euro"),
      pipeline_id: z.number().optional().describe("Pipeline-ID"),
      stage_id: z.number().optional().describe("Stufen-ID"),
      contact_id: z.number().optional().describe("Kontakt-ID"),
      company_id: z.number().optional().describe("Firmen-ID"),
      details: z.string().optional().describe("Beschreibung/Details"),
    },
    async ({ name, amount, pipeline_id, stage_id, contact_id, company_id, details }) => {
      try {
        const body: any = { name };
        if (amount !== undefined) body.total = amount;
        if (details) body.details = details;
        if (pipeline_id) body.current_pipeline = `/v1/pipelines/${pipeline_id}`;
        if (stage_id) body.current_pipeline_stage = `/v1/pipeline_stages/${stage_id}`;
        if (contact_id) body.contacts = [{ contact: `/v1/contacts/${contact_id}` }];
        if (company_id) body.companies = [{ company: `/v1/companies/${company_id}` }];
        const data = await client.post("/opportunities", body);
        return { content: [{ type: "text", text: `Verkaufschance erstellt:\n${formatOpportunity(data)}` }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Fehler: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "daylite_update_opportunity",
    "Bestehende Verkaufschance aktualisieren",
    {
      id: z.number().describe("Die Daylite Opportunity-ID"),
      name: z.string().optional().describe("Neuer Name"),
      amount: z.number().optional().describe("Neuer Wert"),
      stage_id: z.number().optional().describe("Neue Stufen-ID"),
      details: z.string().optional().describe("Neue Details"),
      status: z.string().optional().describe("Neuer Status (z.B. won, lost, pending)"),
    },
    async ({ id, name, amount, stage_id, details, status }) => {
      try {
        const body: any = {};
        if (name) body.name = name;
        if (amount !== undefined) body.total = amount;
        if (stage_id) body.current_pipeline_stage = `/v1/pipeline_stages/${stage_id}`;
        if (details) body.details = details;
        if (status) body.state = status;
        await client.patch(`/opportunities/${id}`, body);
        const updated = await client.get(`/opportunities/${id}`);
        return { content: [{ type: "text", text: `Verkaufschance aktualisiert:\n${formatOpportunity(updated)}` }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Fehler: ${error.message}` }], isError: true };
      }
    }
  );
}
