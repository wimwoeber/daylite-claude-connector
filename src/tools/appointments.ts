import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DayliteRestClient } from "../daylite-rest-client.js";

/** Extract numeric ID from self URL like /v1/appointments/5000 */
function extractId(self: string | undefined): string | null {
  if (!self) return null;
  const parts = self.split("/");
  return parts[parts.length - 1] || null;
}

function formatAppointment(a: any): string {
  const parts: string[] = [];
  const id = extractId(a.self);
  if (id) parts.push(`ID: ${id}`);
  if (a.name) parts.push(`Titel: ${a.name}`);
  if (a.start) parts.push(`Start: ${a.start}`);
  if (a.end) parts.push(`Ende: ${a.end}`);
  if (a.all_day) parts.push(`Ganztägig: Ja`);
  if (a.location) parts.push(`Ort: ${a.location}`);
  if (a.details) parts.push(`Details: ${a.details}`);
  if (a.status) parts.push(`Status: ${a.status}`);
  if (a.category) parts.push(`Kategorie: ${a.category}`);
  // Contacts
  if (a.contacts?.length > 0) {
    parts.push(`Kontakte: ${a.contacts.map((co: any) => `${co.contact} (${co.role || ""})`).join(", ")}`);
  }
  // Companies
  if (a.companies?.length > 0) {
    parts.push(`Firmen: ${a.companies.map((co: any) => `${co.company} (${co.role || ""})`).join(", ")}`);
  }
  // Keywords
  if (a.keywords?.length > 0) {
    parts.push(`Schlagwörter: ${a.keywords.join(", ")}`);
  }
  if (a.flagged) parts.push(`Markiert`);
  if (a.owner) parts.push(`Besitzer: ${a.owner}`);
  return parts.join("\n");
}

export function registerAppointmentTools(server: McpServer, client: DayliteRestClient): void {
  server.tool(
    "daylite_list_appointments",
    "Liste Termine aus Daylite auf. Optional filterbar nach Zeitraum.",
    {
      start_after: z.string().optional().describe("Nur Termine nach diesem Zeitpunkt (ISO 8601, z.B. 2025-01-01T00:00:00Z)"),
      start_before: z.string().optional().describe("Nur Termine vor diesem Zeitpunkt (ISO 8601, z.B. 2025-12-31T23:59:59Z)"),
      calendar: z.string().optional().describe("Name des Kalenders (optional)"),
    },
    async ({ start_after, start_before }) => {
      try {
        const params: Record<string, string> = { limit: "200" };
        const data = await client.get("/appointments", params);
        let appointments = Array.isArray(data) ? data : data?.data || [];

        // Client-side time range filter
        if (start_after) {
          const after = new Date(start_after).getTime();
          appointments = appointments.filter((a: any) => a.start && new Date(a.start).getTime() >= after);
        }
        if (start_before) {
          const before = new Date(start_before).getTime();
          appointments = appointments.filter((a: any) => a.start && new Date(a.start).getTime() <= before);
        }

        if (appointments.length === 0) {
          return { content: [{ type: "text", text: "Keine Termine gefunden." }] };
        }
        const text = appointments.map(formatAppointment).join("\n\n---\n\n");
        return { content: [{ type: "text", text: `${appointments.length} Termine gefunden:\n\n${text}` }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Fehler: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "daylite_get_appointment",
    "Rufe einen einzelnen Daylite-Termin per ID ab.",
    {
      url: z.string().describe("Die ID des Termins (aus daylite_list_appointments)"),
    },
    async ({ url }) => {
      try {
        const id = url.match(/\d+$/)?.[0] || url;
        const data = await client.get(`/appointments/${id}`);
        return { content: [{ type: "text", text: formatAppointment(data) }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Fehler: ${error.message}` }], isError: true };
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
    async ({ summary, dtstart, dtend, description, location, all_day }) => {
      try {
        const body: any = {
          name: summary,
          start: dtstart,
          end: dtend,
        };
        if (description) body.details = description;
        if (location) body.location = location;
        if (all_day) body.all_day = true;
        const data = await client.post("/appointments", body);
        return { content: [{ type: "text", text: `Termin erstellt:\n${formatAppointment(data)}` }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Fehler: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "daylite_update_appointment",
    "Aktualisiere einen bestehenden Daylite-Termin.",
    {
      url: z.string().describe("Die ID des Termins (aus daylite_list_appointments)"),
      summary: z.string().optional().describe("Neuer Titel"),
      dtstart: z.string().optional().describe("Neue Startzeit (ISO 8601)"),
      dtend: z.string().optional().describe("Neue Endzeit (ISO 8601)"),
      description: z.string().optional().describe("Neue Beschreibung"),
      location: z.string().optional().describe("Neuer Ort"),
    },
    async ({ url, summary, dtstart, dtend, description, location }) => {
      try {
        const id = url.match(/\d+$/)?.[0] || url;
        const body: any = {};
        if (summary) body.name = summary;
        if (dtstart) body.start = dtstart;
        if (dtend) body.end = dtend;
        if (description) body.details = description;
        if (location) body.location = location;
        await client.patch(`/appointments/${id}`, body);
        const updated = await client.get(`/appointments/${id}`);
        return { content: [{ type: "text", text: `Termin aktualisiert:\n${formatAppointment(updated)}` }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Fehler: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "daylite_delete_appointment",
    "Lösche einen Termin aus Daylite.",
    {
      url: z.string().describe("Die ID des Termins (aus daylite_list_appointments)"),
    },
    async ({ url }) => {
      try {
        const id = url.match(/\d+$/)?.[0] || url;
        await client.delete(`/appointments/${id}`);
        return { content: [{ type: "text", text: "Termin gelöscht." }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Fehler: ${error.message}` }], isError: true };
      }
    }
  );
}
