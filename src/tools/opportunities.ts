import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DayliteRestClient } from "../daylite-rest-client.js";

function formatOpportunity(o: any): string {
  const parts: string[] = [];
  const id = o.ID || o.id;
  if (id) parts.push(`ID: ${id}`);
  const name = o.Name || o.name;
  if (name) parts.push(`Name: ${name}`);
  const state = o.State || o.state || o.Status || o.status;
  if (state) parts.push(`Status: ${state}`);
  const probability = o.Probability || o.probability;
  if (probability !== undefined) parts.push(`Wahrscheinlichkeit: ${probability}%`);
  const amount = o.Amount || o.amount;
  if (amount !== undefined) parts.push(`Betrag: ${amount}€`);
  const details = o.Details || o.details;
  if (details) parts.push(`Details: ${details}`);
  const priority = o.Priority || o.priority;
  if (priority !== undefined) parts.push(`Priorität: ${priority}`);
  const category = o.Category || o.category;
  if (category) parts.push(`Kategorie: ${category}`);
  const start = o.Start || o.start;
  if (start) parts.push(`Start: ${start}`);
  const end = o.End || o.end;
  if (end) parts.push(`Ende: ${end}`);
  const forecasted = o.Forecasted || o.forecasted;
  if (forecasted) parts.push(`Prognose: ${forecasted}`);
  // Pipeline info
  const pipeline = o.Pipeline || o.pipeline;
  if (pipeline) {
    if (typeof pipeline === "object") {
      parts.push(`Pipeline: ${pipeline.Name || pipeline.name || JSON.stringify(pipeline)}`);
    } else {
      parts.push(`Pipeline: ${pipeline}`);
    }
  }
  const stage = o.Stage || o.stage || o.PipelineStage || o.pipelineStage;
  if (stage) {
    if (typeof stage === "object") {
      parts.push(`Stufe: ${stage.Name || stage.name || JSON.stringify(stage)}`);
    } else {
      parts.push(`Stufe: ${stage}`);
    }
  }
  const self = o.Self || o.self;
  if (self) parts.push(`Self: ${self}`);
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
        const opportunities = Array.isArray(data) ? data : data?.opportunities || data?.Opportunities || data?.data || [];
        if (opportunities.length === 0) {
          return { content: [{ type: "text", text: "Keine Verkaufschancen gefunden." }] };
        }
        const text = opportunities.map(formatOpportunity).join("\n---\n");
        return { content: [{ type: "text", text: `${opportunities.length} Verkaufschance(n):\n\n${text}` }] };
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
        const body: any = { Name: name };
        if (amount !== undefined) body.Amount = amount;
        if (details) body.Details = details;
        if (pipeline_id) body.Pipeline = pipeline_id;
        if (stage_id) body.PipelineStage = stage_id;
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
        if (name) body.Name = name;
        if (amount !== undefined) body.Amount = amount;
        if (stage_id) body.PipelineStage = stage_id;
        if (details) body.Details = details;
        if (status) body.State = status;
        const data = await client.put(`/opportunities/${id}`, body);
        return { content: [{ type: "text", text: `Verkaufschance aktualisiert:\n${formatOpportunity(data)}` }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Fehler: ${error.message}` }], isError: true };
      }
    }
  );
}
