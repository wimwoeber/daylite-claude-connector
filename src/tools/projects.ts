import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DayliteRestClient } from "../daylite-rest-client.js";

/** Extract numeric ID from self URL like /v1/projects/1003 */
function extractId(self: string | undefined): string | null {
  if (!self) return null;
  const parts = self.split("/");
  return parts[parts.length - 1] || null;
}

function formatProject(p: any): string {
  const parts: string[] = [];
  const id = extractId(p.self);
  if (id) parts.push(`ID: ${id}`);
  if (p.name) parts.push(`Name: ${p.name}`);
  if (p.status) parts.push(`Status: ${p.status}`);
  if (p.priority !== undefined && p.priority > 0) parts.push(`Priorität: ${p.priority}`);
  if (p.category) parts.push(`Kategorie: ${p.category}`);
  if (p.started) parts.push(`Start: ${p.started}`);
  if (p.due) parts.push(`Fällig: ${p.due}`);
  if (p.completed) parts.push(`Abgeschlossen: ${p.completed}`);
  // Pipeline
  if (p.current_pipeline) parts.push(`Pipeline: ${p.current_pipeline}`);
  if (p.current_pipeline_stage) parts.push(`Stufe: ${p.current_pipeline_stage}`);
  // Keywords
  if (p.keywords?.length > 0) {
    parts.push(`Schlagwörter: ${p.keywords.join(", ")}`);
  }
  // Contacts
  if (p.contacts?.length > 0) {
    parts.push(`Kontakte: ${p.contacts.map((co: any) => `${co.contact} (${co.role || ""})`).join(", ")}`);
  }
  // Companies
  if (p.companies?.length > 0) {
    parts.push(`Firmen: ${p.companies.map((co: any) => `${co.company} (${co.role || ""})`).join(", ")}`);
  }
  if (p.flagged) parts.push(`⭐ Markiert`);
  if (p.owner) parts.push(`Besitzer: ${p.owner}`);
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
        const projects = Array.isArray(data) ? data : data?.data || [];
        if (projects.length === 0) {
          return { content: [{ type: "text", text: "Keine Projekte gefunden." }] };
        }
        const display = limit ? projects : projects.slice(0, 50);
        const text = display.map(formatProject).join("\n---\n");
        return { content: [{ type: "text", text: `${projects.length} Projekt(e)${display.length < projects.length ? ` (zeige erste ${display.length})` : ""}:\n\n${text}` }] };
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
        if (details) body.details = details;
        if (start_date) body.started = start_date;
        if (end_date) body.due = end_date;
        if (pipeline_id) body.current_pipeline = `/v1/pipelines/${pipeline_id}`;
        if (stage_id) body.current_pipeline_stage = `/v1/pipeline_stages/${stage_id}`;
        if (contact_id) body.contacts = [{ contact: `/v1/contacts/${contact_id}` }];
        if (company_id) body.companies = [{ company: `/v1/companies/${company_id}` }];
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
        if (name) body.name = name;
        if (stage_id) body.current_pipeline_stage = `/v1/pipeline_stages/${stage_id}`;
        if (details) body.details = details;
        if (status) body.status = status;
        const data = await client.put(`/projects/${id}`, body);
        return { content: [{ type: "text", text: `Projekt aktualisiert:\n${formatProject(data)}` }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Fehler: ${error.message}` }], isError: true };
      }
    }
  );
}
