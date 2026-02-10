import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DayliteCalDAVClient } from "../daylite-client.js";
import type { ParsedTask } from "../types.js";

function formatTask(task: ParsedTask): string {
  const lines: string[] = [];
  lines.push(`Titel: ${task.summary}`);
  lines.push(`URL: ${task.url}`);
  if (task.uid) lines.push(`UID: ${task.uid}`);
  if (task.description) lines.push(`Details: ${task.description}`);

  const statusMap: Record<string, string> = {
    "NEEDS-ACTION": "Offen",
    "IN-PROCESS": "In Bearbeitung",
    "COMPLETED": "Erledigt",
    "CANCELLED": "Abgesagt",
  };
  if (task.status) lines.push(`Status: ${statusMap[task.status] ?? task.status}`);

  if (task.due) lines.push(`Fällig: ${task.due}`);
  if (task.dtstart) lines.push(`Start: ${task.dtstart}`);
  if (task.priority !== undefined) {
    const priorities: Record<number, string> = {
      0: "Nicht definiert",
      1: "Höchste",
      2: "Hoch",
      3: "Hoch",
      4: "Hoch",
      5: "Mittel",
      6: "Niedrig",
      7: "Niedrig",
      8: "Niedrig",
      9: "Niedrigste",
    };
    lines.push(`Priorität: ${priorities[task.priority] ?? task.priority}`);
  }
  if (task.percentComplete !== undefined) lines.push(`Fortschritt: ${task.percentComplete}%`);
  if (task.completed) lines.push(`Erledigt am: ${task.completed}`);
  return lines.join("\n");
}

export function registerTaskTools(server: McpServer, client: DayliteCalDAVClient): void {
  server.tool(
    "daylite_list_tasks",
    "Liste alle Tasks/Aufgaben aus Daylite auf.",
    {
      calendar: z.string().optional().describe("Name des Kalenders (optional, nutzt Standard-Kalender wenn leer)"),
    },
    async (args) => {
      try {
        const tasks = await client.listTasks({ calendarName: args.calendar });

        if (tasks.length === 0) {
          return { content: [{ type: "text", text: "Keine Tasks gefunden." }] };
        }

        const formatted = tasks.map(formatTask).join("\n\n---\n\n");
        return { content: [{ type: "text", text: `${tasks.length} Tasks gefunden:\n\n${formatted}` }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Fehler: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.tool(
    "daylite_get_task",
    "Rufe einen einzelnen Daylite-Task per URL ab.",
    {
      url: z.string().describe("Die CalDAV-URL des Tasks (aus daylite_list_tasks)"),
    },
    async (args) => {
      try {
        const task = await client.getTask(args.url);
        if (!task) {
          return { content: [{ type: "text", text: "Task nicht gefunden." }] };
        }
        return { content: [{ type: "text", text: formatTask(task) }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Fehler: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
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
    async (args) => {
      try {
        const uid = await client.createTask({
          calendarName: args.calendar,
          summary: args.summary,
          description: args.description,
          due: args.due,
          priority: args.priority,
        });
        return { content: [{ type: "text", text: `Task erstellt: "${args.summary}" (UID: ${uid})` }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Fehler: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.tool(
    "daylite_update_task",
    "Aktualisiere einen bestehenden Daylite-Task.",
    {
      url: z.string().describe("Die CalDAV-URL des Tasks (aus daylite_list_tasks)"),
      summary: z.string().optional().describe("Neuer Titel"),
      description: z.string().optional().describe("Neue Beschreibung"),
      due: z.string().optional().describe("Neues Fälligkeitsdatum (ISO 8601)"),
      priority: z.number().min(0).max(9).optional().describe("Neue Priorität (1=höchste, 5=mittel, 9=niedrigste)"),
      status: z.enum(["NEEDS-ACTION", "IN-PROCESS", "COMPLETED", "CANCELLED"]).optional().describe("Neuer Status"),
      completed: z.boolean().optional().describe("Task als erledigt markieren (true)"),
    },
    async (args) => {
      try {
        await client.updateTask({
          url: args.url,
          summary: args.summary,
          description: args.description,
          due: args.due,
          priority: args.priority,
          status: args.status,
          completed: args.completed,
        });
        return { content: [{ type: "text", text: `Task aktualisiert.` }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Fehler: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.tool(
    "daylite_delete_task",
    "Lösche einen Task aus Daylite.",
    {
      url: z.string().describe("Die CalDAV-URL des Tasks (aus daylite_list_tasks)"),
    },
    async (args) => {
      try {
        await client.deleteTask(args.url);
        return { content: [{ type: "text", text: "Task gelöscht." }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Fehler: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );
}
