import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DayliteCalDAVClient } from "../daylite-client.js";
import type { ParsedEvent } from "../types.js";

function formatEvent(event: ParsedEvent): string {
  const lines: string[] = [];
  lines.push(`Titel: ${event.summary}`);
  lines.push(`URL: ${event.url}`);
  if (event.uid) lines.push(`UID: ${event.uid}`);
  lines.push(`Start: ${event.dtstart}`);
  if (event.dtend) lines.push(`Ende: ${event.dtend}`);
  if (event.allDay) lines.push(`Ganztägig: Ja`);
  if (event.description) lines.push(`Details: ${event.description}`);
  if (event.location) lines.push(`Ort: ${event.location}`);
  if (event.status) lines.push(`Status: ${event.status}`);
  if (event.attendees && event.attendees.length > 0) {
    lines.push(`Teilnehmer: ${event.attendees.join(", ")}`);
  }
  return lines.join("\n");
}

export function registerAppointmentTools(server: McpServer, client: DayliteCalDAVClient): void {
  server.tool(
    "daylite_list_calendars",
    "Liste alle verfügbaren Daylite-Kalender auf.",
    {},
    async () => {
      try {
        const calendars = await client.getCalendars();
        if (calendars.length === 0) {
          return { content: [{ type: "text", text: "Keine Kalender gefunden." }] };
        }
        const formatted = calendars
          .map((c, i) => `${i + 1}. ${c.displayName ?? "(Unbenannt)"} - ${c.url}`)
          .join("\n");
        return { content: [{ type: "text", text: `${calendars.length} Kalender gefunden:\n\n${formatted}` }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Fehler: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.tool(
    "daylite_list_appointments",
    "Liste Termine aus Daylite auf. Optional filterbar nach Zeitraum.",
    {
      start_after: z.string().optional().describe("Nur Termine nach diesem Zeitpunkt (ISO 8601, z.B. 2025-01-01T00:00:00Z)"),
      start_before: z.string().optional().describe("Nur Termine vor diesem Zeitpunkt (ISO 8601, z.B. 2025-12-31T23:59:59Z)"),
      calendar: z.string().optional().describe("Name des Kalenders (optional)"),
    },
    async (args) => {
      try {
        const events = await client.listEvents({
          calendarName: args.calendar,
          timeRangeStart: args.start_after,
          timeRangeEnd: args.start_before,
        });

        if (events.length === 0) {
          return { content: [{ type: "text", text: "Keine Termine gefunden." }] };
        }

        const formatted = events.map(formatEvent).join("\n\n---\n\n");
        return { content: [{ type: "text", text: `${events.length} Termine gefunden:\n\n${formatted}` }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Fehler: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.tool(
    "daylite_get_appointment",
    "Rufe einen einzelnen Daylite-Termin per URL ab.",
    {
      url: z.string().describe("Die CalDAV-URL des Termins (aus daylite_list_appointments)"),
    },
    async (args) => {
      try {
        const event = await client.getEvent(args.url);
        if (!event) {
          return { content: [{ type: "text", text: "Termin nicht gefunden." }] };
        }
        return { content: [{ type: "text", text: formatEvent(event) }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Fehler: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.tool(
    "daylite_create_appointment",
    "Erstelle einen neuen Termin in Daylite.",
    {
      summary: z.string().describe("Titel des Termins"),
      dtstart: z.string().describe("Startzeit (ISO 8601, z.B. 2025-06-15T10:00:00)"),
      dtend: z.string().describe("Endzeit (ISO 8601, z.B. 2025-06-15T11:00:00)"),
      description: z.string().optional().describe("Beschreibung des Termins"),
      location: z.string().optional().describe("Ort des Termins"),
      all_day: z.boolean().optional().describe("Ganztägiger Termin (true/false)"),
      calendar: z.string().optional().describe("Name des Kalenders (optional)"),
    },
    async (args) => {
      try {
        const uid = await client.createEvent({
          calendarName: args.calendar,
          summary: args.summary,
          dtstart: args.dtstart,
          dtend: args.dtend,
          description: args.description,
          location: args.location,
          allDay: args.all_day,
        });
        return { content: [{ type: "text", text: `Termin erstellt: "${args.summary}" (UID: ${uid})` }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Fehler: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.tool(
    "daylite_update_appointment",
    "Aktualisiere einen bestehenden Daylite-Termin.",
    {
      url: z.string().describe("Die CalDAV-URL des Termins (aus daylite_list_appointments)"),
      summary: z.string().optional().describe("Neuer Titel"),
      dtstart: z.string().optional().describe("Neue Startzeit (ISO 8601)"),
      dtend: z.string().optional().describe("Neue Endzeit (ISO 8601)"),
      description: z.string().optional().describe("Neue Beschreibung"),
      location: z.string().optional().describe("Neuer Ort"),
    },
    async (args) => {
      try {
        await client.updateEvent({
          url: args.url,
          summary: args.summary,
          dtstart: args.dtstart,
          dtend: args.dtend,
          description: args.description,
          location: args.location,
        });
        return { content: [{ type: "text", text: "Termin aktualisiert." }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Fehler: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.tool(
    "daylite_delete_appointment",
    "Lösche einen Termin aus Daylite.",
    {
      url: z.string().describe("Die CalDAV-URL des Termins (aus daylite_list_appointments)"),
    },
    async (args) => {
      try {
        await client.deleteEvent(args.url);
        return { content: [{ type: "text", text: "Termin gelöscht." }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Fehler: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );
}
