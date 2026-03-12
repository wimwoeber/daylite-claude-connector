import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DayliteRestClient } from "../daylite-rest-client.js";

/** Extract numeric ID from self URL like /v1/tasks/3000 */
function extractId(self: string | undefined): string | null {
  if (!self) return null;
  const parts = self.split("/");
  return parts[parts.length - 1] || null;
}

function formatTask(t: any): string {
  const parts: string[] = [];
  const id = extractId(t.self);
  if (id) parts.push(`ID: ${id}`);
  if (t.name) parts.push(`Titel: ${t.name}`);
  if (t.details) parts.push(`Details: ${t.details}`);
  if (t.status) parts.push(`Status: ${t.status}`);
  if (t.due) parts.push(`Fällig: ${t.due}`);
  if (t.start) parts.push(`Start: ${t.start}`);
  if (t.priority !== undefined && t.priority > 0) parts.push(`Priorität: ${t.priority}`);
  if (t.category) parts.push(`Kategorie: ${t.category}`);
  if (t.completed) parts.push(`Erledigt am: ${t.completed}`);
  // Contacts
  if (t.contacts?.length > 0) {
    parts.push(`Kontakte: ${t.contacts.map((co: any) => `${co.contact} (${co.role || ""})`).join(", ")}`);
  }
  // Companies
  if (t.companies?.length > 0) {
    parts.push(`Firmen: ${t.companies.map((co: any) => `${co.company} (${co.role || ""})`).join(", ")}`);
  }
  // Keywords
  if (t.keywords?.length > 0) {
    parts.push(`Schlagwörter: ${t.keywords.join(", ")}`);
  }
  if (t.flagged) parts.push(`Markiert`);
  if (t.owner) parts.push(`Besitzer: ${t.owner}`);
  return parts.join("\n");
}

export function registerTaskTools(server: McpServer, client: DayliteRestClient): void {
  server.tool(
    "daylite_list_tasks",
    "Liste alle Tasks/Aufgaben aus Daylite auf.",
    {
      calendar: z.string().optional().describe("Name des Kalenders (optional, nutzt Standard-Kalender wenn leer)"),
    },
    async () => {
      try {
        const params: Record<string, string> = { limit: "200" };
        const data = await client.get("/tasks", params);
        const tasks = Array.isArray(data) ? data : data?.data || [];

        if (tasks.length === 0) {
          return { content: [{ type: "text", text: "Keine Tasks gefunden." }] };
        }

        const text = tasks.map(formatTask).join("\n\n---\n\n");
        return { content: [{ type: "text", text: `${tasks.length} Tasks gefunden:\n\n${text}` }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Fehler: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "daylite_get_task",
    "Rufe einen einzelnen Daylite-Task per URL ab.",
    {
      url: z.string().describe("Die ID des Tasks (aus daylite_list_tasks)"),
    },
    async ({ url }) => {
      try {
        const id = url.match(/\d+$/)?.[0] || url;
        const data = await client.get(`/tasks/${id}`);
        return { content: [{ type: "text", text: formatTask(data) }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Fehler: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "daylite_create_task",
    "Erstelle einen neuen Task in Daylite.",
    {
      summary: z.string().describe("Titel des Tasks"),
      description: z.string().optional().describe("Beschreibung/Details des Tasks"),
      due: z.string().optional().describe("Fälligkeitsdatum (ISO 8601, z.B. 2025-12-31 oder 2025-12-31T17:00:00)"),
      priority: z.number().min(0).max(9).optional().describe("Priorität (1=höchste, 5=mittel, 9=niedrigste, 0=nicht definiert)"),
      calendar: z.string().optional().describe("Name des Kalenders (optional)"),
    },
    async ({ summary, description, due, priority }) => {
      try {
        const body: any = { name: summary };
        if (description) body.details = description;
        if (due) body.due = due;
        if (priority !== undefined) body.priority = priority;
        const data = await client.post("/tasks", body);
        return { content: [{ type: "text", text: `Task erstellt:\n${formatTask(data)}` }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Fehler: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "daylite_update_task",
    "Aktualisiere einen bestehenden Daylite-Task.",
    {
      url: z.string().describe("Die ID des Tasks (aus daylite_list_tasks)"),
      summary: z.string().optional().describe("Neuer Titel"),
      description: z.string().optional().describe("Neue Beschreibung"),
      due: z.string().optional().describe("Neues Fälligkeitsdatum (ISO 8601)"),
      priority: z.number().min(0).max(9).optional().describe("Neue Priorität (1=höchste, 5=mittel, 9=niedrigste)"),
      status: z.string().optional().describe("Neuer Status"),
      completed: z.boolean().optional().describe("Task als erledigt markieren (true)"),
    },
    async ({ url, summary, description, due, priority, status, completed }) => {
      try {
        const id = url.match(/\d+$/)?.[0] || url;
        const body: any = {};
        if (summary) body.name = summary;
        if (description) body.details = description;
        if (due) body.due = due;
        if (priority !== undefined) body.priority = priority;
        if (status) body.status = status;
        if (completed) body.completed = new Date().toISOString();
        await client.patch(`/tasks/${id}`, body);
        const updated = await client.get(`/tasks/${id}`);
        return { content: [{ type: "text", text: `Task aktualisiert:\n${formatTask(updated)}` }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Fehler: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "daylite_delete_task",
    "Lösche einen Task aus Daylite.",
    {
      url: z.string().describe("Die ID des Tasks (aus daylite_list_tasks)"),
    },
    async ({ url }) => {
      try {
        const id = url.match(/\d+$/)?.[0] || url;
        await client.delete(`/tasks/${id}`);
        return { content: [{ type: "text", text: "Task gelöscht." }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Fehler: ${error.message}` }], isError: true };
      }
    }
  );
}
