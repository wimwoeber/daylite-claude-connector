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
  if (a.subject) parts.push(`Titel: ${a.subject}`);
  if (a.local_start) parts.push(`Start: ${a.local_start}`);
  if (a.local_end) parts.push(`Ende: ${a.local_end}`);
  if (a.timezone) parts.push(`Zeitzone: ${a.timezone}`);
  if (a.all_day) parts.push(`Ganztägig: Ja`);
  if (a.location) parts.push(`Ort: ${a.location}`);
  if (a.details) parts.push(`Details: ${a.details}`);
  if (a.type && a.type !== "appointment") parts.push(`Typ: ${a.type}`);
  if (a.status) parts.push(`Status: ${a.status}`);
  if (a.show_as) parts.push(`Anzeigen als: ${a.show_as}`);
  // Contacts
  if (a.contacts?.length > 0) {
    parts.push(`Kontakte: ${a.contacts.map((co: any) => co.contact).join(", ")}`);
  }
  // Companies
  if (a.companies?.length > 0) {
    parts.push(`Firmen: ${a.companies.map((co: any) => co.company).join(", ")}`);
  }
  // Opportunities
  if (a.opportunities?.length > 0) {
    parts.push(`Verkaufschancen: ${a.opportunities.map((o: any) => o.opportunity).join(", ")}`);
  }
  if (a.owner) parts.push(`Besitzer: ${a.owner}`);
  return parts.join("\n");
}

/** Short format for list view (no details, no contacts) */
function formatAppointmentShort(a: any): string {
  const parts: string[] = [];
  const id = extractId(a.self);
  if (id) parts.push(`ID: ${id}`);
  if (a.subject) parts.push(`Titel: ${a.subject}`);
  if (a.local_start) parts.push(`Start: ${a.local_start}`);
  if (a.local_end) parts.push(`Ende: ${a.local_end}`);
  if (a.all_day) parts.push(`Ganztägig: Ja`);
  if (a.location) parts.push(`Ort: ${a.location}`);
  if (a.type && a.type !== "appointment") parts.push(`Typ: ${a.type}`);
  return parts.join(" | ");
}

/**
 * Fetch full details for multiple appointments in parallel batches.
 * The list endpoint only returns self+subject, so we need individual GETs.
 */
async function fetchAppointmentDetails(
  client: DayliteRestClient,
  ids: string[],
  batchSize = 20
): Promise<any[]> {
  const results: any[] = [];
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const promises = batch.map((id) =>
      client.get(`/appointments/${id}`).catch(() => null)
    );
    const batchResults = await Promise.all(promises);
    results.push(...batchResults.filter(Boolean));
  }
  return results;
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
        // List endpoint returns only self + subject (no dates)
        const data = await client.get("/appointments");
        const list = Array.isArray(data) ? data : data?.results || data?.data || [];

        if (list.length === 0) {
          return { content: [{ type: "text", text: "Keine Termine gefunden." }] };
        }

        // If date filter is requested, we need to fetch individual appointments
        // to get their dates. We fetch the most recent ones (end of list).
        if (start_after || start_before) {
          // Take the last 100 appointments (most recent) for filtering
          const recentIds = list.slice(-100).map((a: any) => extractId(a.self)).filter(Boolean) as string[];
          const detailed = await fetchAppointmentDetails(client, recentIds);

          let filtered = detailed;
          if (start_after) {
            const after = new Date(start_after).getTime();
            filtered = filtered.filter((a: any) => {
              const start = a.utc_start || a.local_start;
              return start && new Date(start).getTime() >= after;
            });
          }
          if (start_before) {
            const before = new Date(start_before).getTime();
            filtered = filtered.filter((a: any) => {
              const start = a.utc_start || a.local_start;
              return start && new Date(start).getTime() <= before;
            });
          }

          // Sort by start date
          filtered.sort((a: any, b: any) => {
            const aStart = new Date(a.utc_start || a.local_start || 0).getTime();
            const bStart = new Date(b.utc_start || b.local_start || 0).getTime();
            return aStart - bStart;
          });

          if (filtered.length === 0) {
            return { content: [{ type: "text", text: "Keine Termine im angegebenen Zeitraum gefunden (letzte 100 Termine geprüft)." }] };
          }
          const text = filtered.map(formatAppointmentShort).join("\n\n");
          return { content: [{ type: "text", text: `${filtered.length} Termine gefunden:\n\n${text}` }] };
        }

        // No filter: return summary list (last 50 for relevance)
        const recent = list.slice(-50);
        const text = recent.map((a: any) => {
          const id = extractId(a.self);
          return `ID: ${id} | ${a.subject || "(kein Titel)"}`;
        }).join("\n");
        return {
          content: [{
            type: "text",
            text: `${list.length} Termine gesamt (letzte 50 angezeigt):\n\n${text}\n\nFür Details: daylite_get_appointment mit der ID aufrufen.`
          }]
        };
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
          subject: summary,
          local_start: dtstart,
          local_end: dtend,
          timezone: "Europe/Berlin",
        };
        if (description) body.details = description;
        if (location) body.location = location;
        if (all_day) body.all_day = true;
        const data = await client.post("/appointments", body);
        // POST may not return full object, reload
        const id = extractId(data?.self);
        if (id) {
          const full = await client.get(`/appointments/${id}`);
          return { content: [{ type: "text", text: `Termin erstellt:\n${formatAppointment(full)}` }] };
        }
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
        if (summary) body.subject = summary;
        if (dtstart) body.local_start = dtstart;
        if (dtend) body.local_end = dtend;
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
