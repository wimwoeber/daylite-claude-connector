import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DayliteRestClient } from "../daylite-rest-client.js";

function formatOpportunity(o: any): string {
  const parts: string[] = [];
  parts.push(`ID: ${o.id}`);
  if (o.name || o.title) parts.push(`Name: ${o.name || o.title}`);
  if (o.amount || o.value) parts.push(`Wert: ${o.amount || o.value}`);
  if (o.pipeline) {
    const pName = typeof o.pipeline === "object" ? o.pipeline.name : o.pipeline;
    parts.push(`Pipeline: ${pName}`);
  }
  if (o.stage) {
    const sName = typeof o.stage === "object" ? o.stage.name : o.stage;
    parts.push(`Stufe: ${sName}`);
  }
  if (o.status) parts.push(`Status: ${o.status}`);
  if (o.probability) parts.push(`Wahrscheinlichkeit: ${o.probability}%`);
  if (o.close_date || o.expected_close) parts.push(`Abschlussdatum: ${o.close_date || o.expected_close}`);
  if (o.contact) {
    const cName = typeof o.contact === "object" 
      ? [o.contact.first_name, o.contact.last_name].filter(Boolean).join(" ") 
      : o.contact;
    parts.push(`Kontakt: ${cName}`);
  }
  if (o.company) {
    const coName = typeof o.company === "object" ? o.company.name : o.company;
    parts.push(`Firma: ${coName}`);
  }
  if (o.keywords?.length > 0) {
    parts.push(`Schlagwörter: ${o.keywords.map((k: any) => k.name || k).join(", ")}`);
  }
  if (o.details || o.description) parts.push(`Details: ${o.details || o.description}`);
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
        const opps = Array.isArray(data) ? data : data?.opportunities || data?.data || [];
        if (opps.length === 0) {
          return { content: [{ type: "text", text: "Keine Verkaufschancen gefunden." }] };
        }
        const text = opps.map(formatOpportunity).join("\n---\n");
        return { content: [{ type: "text", text: `${opps.length} Verkaufschance(n):\n\n${text}` }] };
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
        if (amount !== undefined) body.amount = amount;
        if (pipeline_id) body.pipeline = { id: pipeline_id };
        if (stage_id) body.stage = { id: stage_id };
        if (contact_id) body.contact = { id: contact_id };
        if (company_id) body.company = { id: company_id };
        if (details) body.details = details;
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
      status: z.string().optional().describe("Neuer Status (z.B. won, lost, pending)"),
      details: z.string().optional().describe("Neue Details"),
    },
    async ({ id, name, amount, stage_id, status, details }) => {
      try {
        const body: any = {};
        if (name) body.name = name;
        if (amount !== undefined) body.amount = amount;
        if (stage_id) body.stage = { id: stage_id };
        if (status) body.status = status;
        if (details) body.details = details;
        const data = await client.put(`/opportunities/${id}`, body);
        return { content: [{ type: "text", text: `Verkaufschance aktualisiert:\n${formatOpportunity(data)}` }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Fehler: ${error.message}` }], isError: true };
      }
    }
  );
}
