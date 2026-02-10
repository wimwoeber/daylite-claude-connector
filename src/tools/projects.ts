import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DayliteRestClient } from "../daylite-rest-client.js";

function formatProject(p: any): string {
  const parts: string[] = [];
  const id = p.ID || p.id;
  if (id) parts.push(`ID: ${id}`);
  const name = p.Name || p.name;
  if (name) parts.push(`Name: ${name}`);
  const status = p.Status || p.status;
  if (status) parts.push(`Status: ${status}`);
  const priority = p.Priority || p.priority;
  if (priority !== undefined) parts.push(`Priorität: ${priority}`);
  const details = p.Details || p.details;
  if (details) parts.push(`Details: ${details}`);
  const category = p.Category || p.category;
  if (category) parts.push(`Kategorie: ${category}`);
  const started = p.Started || p.started || p.Start || p.start;
  if (started) parts.push(`Start: ${started}`);
  const due = p.Due || p.due;
  if (due) parts.push(`Fällig: ${due}`);
  const completed = p.Completed || p.completed;
  if (completed) parts.push(`Abgeschlossen: ${completed}`);
  // Pipeline info
  const pipeline = p.Pipeline || p.pipeline;
  if (pipeline) {
    if (typeof pipeline === "object") {
      parts.push(`Pipeline: ${pipeline.Name || pipeline.name || JSON.stringify(pipeline)}`);
    } else {
      parts.push(`Pipeline: ${pipeline}`);
    }
  }
  const stage = p.Stage || p.stage || p.PipelineStage || p.pipelineStage;
  if (stage) {
    if (typeof stage === "object") {
      parts.push(`Stufe: ${stage.Name || stage.name || JSON.stringify(stage)}`);
    } else {
      parts.push(`Stufe: ${stage}`);
    }
  }
  const self = p.Self || p.self;
  if (self) parts.push(`Self: ${self}`);
  return parts.join("\n");
}

export function registerProjectTools(server: McpServer, client: DayliteRestClient) {
  server.tool(
    "daylite_list_projects",
    "Projekte aus Daylite auflisten",
    {
      limit: z.number().optional().describe("Maximale Anzahl (Standard: 50)"),
      offset: z.number().optional().describe("Offset für Paginierung"),
    },
    async ({ limit, offset }) => {
      try {
        const params: Record<string, string> = {};
        if (limit) params.limit = String(limit);
        if (offset) params.offset = String(offset);
        const data = await client.get("/projects", params);
        const projects = Array.isArray(data) ? data : data?.projects || data?.Projects || data?.data || [];
        if (projects.length === 0) {
          return { content: [{ type: "text", text: "Keine Projekte gefunden." }] };
        }
        const text = projects.map(formatProject).join("\n---\n");
        return { content: [{ type: "text", text: `${projects.length} Projekt(e):\n\n${text}` }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Fehler: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "daylite_get_project",
    "Ein bestimmtes Projekt aus Daylite abrufen",
    {
      id: z.number().describe("Die Daylite Projekt-ID"),
    },
    async ({ id }) => {
      try {
        const data = await client.get(`/projects/${id}`);
        return { content: [{ type: "text", text: formatProject(data) }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Fehler: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "daylite_create_project",
    "Neues Projekt in Daylite anlegen",
    {
      name: z.string().describe("Projektname"),
      pipeline_id: z.number().optional().describe("Pipeline-ID"),
      stage_id: z.number().optional().describe("Stufen-ID"),
      contact_id: z.number().optional().describe("Kontakt-ID"),
      company_id: z.number().optional().describe("Firmen-ID"),
      details: z.string().optional().describe("Beschreibung/Details"),
      start_date: z.string().optional().describe("Startdatum (ISO 8601)"),
      end_date: z.string().optional().describe("Enddatum (ISO 8601)"),
    },
    async ({ name, pipeline_id, stage_id, contact_id, company_id, details, start_date, end_date }) => {
      try {
        const body: any = { Name: name };
        if (details) body.Details = details;
        if (start_date) body.Started = start_date;
        if (end_date) body.Due = end_date;
        if (pipeline_id) body.Pipeline = pipeline_id;
        if (stage_id) body.PipelineStage = stage_id;
        const data = await client.post("/projects", body);
        return { content: [{ type: "text", text: `Projekt erstellt:\n${formatProject(data)}` }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Fehler: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "daylite_update_project",
    "Bestehendes Projekt aktualisieren",
    {
      id: z.number().describe("Die Daylite Projekt-ID"),
      name: z.string().optional().describe("Neuer Projektname"),
      stage_id: z.number().optional().describe("Neue Stufen-ID"),
      details: z.string().optional().describe("Neue Details"),
      status: z.string().optional().describe("Neuer Status"),
    },
    async ({ id, name, stage_id, details, status }) => {
      try {
        const body: any = {};
        if (name) body.Name = name;
        if (stage_id) body.PipelineStage = stage_id;
        if (details) body.Details = details;
        if (status) body.Status = status;
        const data = await client.put(`/projects/${id}`, body);
        return { content: [{ type: "text", text: `Projekt aktualisiert:\n${formatProject(data)}` }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Fehler: ${error.message}` }], isError: true };
      }
    }
  );
}
