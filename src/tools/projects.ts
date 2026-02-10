import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DayliteRestClient } from "../daylite-rest-client.js";

function formatProject(p: any): string {
  const parts: string[] = [];
  parts.push(`ID: ${p.id}`);
  if (p.name || p.title) parts.push(`Name: ${p.name || p.title}`);
  if (p.status) parts.push(`Status: ${p.status}`);
  if (p.pipeline) {
    const pName = typeof p.pipeline === "object" ? p.pipeline.name : p.pipeline;
    parts.push(`Pipeline: ${pName}`);
  }
  if (p.stage) {
    const sName = typeof p.stage === "object" ? p.stage.name : p.stage;
    parts.push(`Stufe: ${sName}`);
  }
  if (p.start_date) parts.push(`Startdatum: ${p.start_date}`);
  if (p.end_date || p.due_date) parts.push(`Enddatum: ${p.end_date || p.due_date}`);
  if (p.contact) {
    const cName = typeof p.contact === "object" 
      ? [p.contact.first_name, p.contact.last_name].filter(Boolean).join(" ") 
      : p.contact;
    parts.push(`Kontakt: ${cName}`);
  }
  if (p.company) {
    const coName = typeof p.company === "object" ? p.company.name : p.company;
    parts.push(`Firma: ${coName}`);
  }
  if (p.keywords?.length > 0) {
    parts.push(`Schlagwörter: ${p.keywords.map((k: any) => k.name || k).join(", ")}`);
  }
  if (p.details || p.description) parts.push(`Details: ${p.details || p.description}`);
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
        const projects = Array.isArray(data) ? data : data?.projects || data?.data || [];
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
        const body: any = { name };
        if (pipeline_id) body.pipeline = { id: pipeline_id };
        if (stage_id) body.stage = { id: stage_id };
        if (contact_id) body.contact = { id: contact_id };
        if (company_id) body.company = { id: company_id };
        if (details) body.details = details;
        if (start_date) body.start_date = start_date;
        if (end_date) body.end_date = end_date;
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
      status: z.string().optional().describe("Neuer Status"),
      details: z.string().optional().describe("Neue Details"),
    },
    async ({ id, name, stage_id, status, details }) => {
      try {
        const body: any = {};
        if (name) body.name = name;
        if (stage_id) body.stage = { id: stage_id };
        if (status) body.status = status;
        if (details) body.details = details;
        const data = await client.put(`/projects/${id}`, body);
        return { content: [{ type: "text", text: `Projekt aktualisiert:\n${formatProject(data)}` }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Fehler: ${error.message}` }], isError: true };
      }
    }
  );
}
