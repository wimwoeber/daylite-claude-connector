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
  if (t.title) parts.push(`Titel: ${t.title}`);
  if (t.details) parts.push(`Details: ${t.details}`);
  if (t.status) parts.push(`Status: ${t.status}`);
  if (t.due) parts.push(`Fällig: ${t.due}`);
  if (t.priority && t.priority !== "no_priority") parts.push(`Priorität: ${t.priority}`);
  if (t.category) parts.push(`Kategorie: ${t.category}`);
  if (t.type && t.type !== "todo") parts.push(`Typ: ${t.type}`);
  if (t.completed) parts.push(`Erledigt am: ${t.completed}`);
  // Projects
  if (t.projects?.length > 0) {
    parts.push(`Projekte: ${t.projects.map((p: any) => p.project).join(", ")}`);
  }
  // Contacts
  if (t.contacts?.length > 0) {
    parts.push(`Kontakte: ${t.contacts.map((co: any) => co.contact).join(", ")}`);
  }
  // Companies
  if (t.companies?.length > 0) {
    parts.push(`Firmen: ${t.companies.map((co: any) => co.company).join(", ")}`);
  }
  // Opportunities
  if (t.opportunities?.length > 0) {
    parts.push(`Verkaufschancen: ${t.opportunities.map((o: any) => o.opportunity).join(", ")}`);
  }
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
        // List endpoint returns only self + title (no details)
        const data = await client.get("/tasks");
        const tasks = Array.isArray(data) ? data : data?.results || data?.data || [];

        if (tasks.length === 0) {
          return { content: [{ type: "text", text: "Keine Tasks gefunden." }] };
        }

        // Return summary list (last 50 for relevance)
        const recent = tasks.slice(-50);
        const text = recent.map((t: any) => {
          const id = extractId(t.self);
          return `ID: ${id} | ${t.title || "(kein Titel)"}`;
        }).join("\n");
        return {
          content: [{
            type: "text",
            text: `${tasks.length} Tasks gesamt (letzte 50 angezeigt):\n\n${text}\n\nFür Details: daylite_get_task mit der ID aufrufen.`
          }]
        };
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
        const body: any = { title: summary };
        if (description) body.details = description;
        if (due) body.due = due;
        if (priority !== undefined && priority > 0) {
          // Map numeric priority to API string values
          if (priority <= 3) body.priority = "high";
          else if (priority <= 6) body.priority = "medium";
          else body.priority = "low";
        }
        const data = await client.post("/tasks", body);
        // POST may not return full object, reload
        const id = extractId(data?.self);
        if (id) {
          const full = await client.get(`/tasks/${id}`);
          return { content: [{ type: "text", text: `Task erstellt:\n${formatTask(full)}` }] };
        }
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
        if (summary) body.title = summary;
        if (description) body.details = description;
        if (due) body.due = due;
        if (priority !== undefined) {
          if (priority === 0) body.priority = "no_priority";
          else if (priority <= 3) body.priority = "high";
          else if (priority <= 6) body.priority = "medium";
          else body.priority = "low";
        }
        if (status) body.status = status;
        if (completed) {
          body.status = "done";
          body.completed = new Date().toISOString();
        }
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
