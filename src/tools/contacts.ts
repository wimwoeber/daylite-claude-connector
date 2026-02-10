import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DayliteRestClient } from "../daylite-rest-client.js";

function formatContact(c: any): string {
  const parts: string[] = [];
  parts.push(`ID: ${c.id}`);
  if (c.first_name || c.last_name) {
    parts.push(`Name: ${[c.first_name, c.last_name].filter(Boolean).join(" ")}`);
  }
  if (c.company) parts.push(`Firma: ${typeof c.company === "object" ? c.company.name : c.company}`);
  if (c.title) parts.push(`Titel: ${c.title}`);
  if (c.emails?.length > 0) {
    parts.push(`E-Mail: ${c.emails.map((e: any) => e.address || e).join(", ")}`);
  }
  if (c.phones?.length > 0) {
    parts.push(`Telefon: ${c.phones.map((p: any) => p.number || p).join(", ")}`);
  }
  if (c.addresses?.length > 0) {
    const addr = c.addresses[0];
    if (typeof addr === "object") {
      parts.push(`Adresse: ${[addr.street, addr.zip || addr.postal_code, addr.city].filter(Boolean).join(", ")}`);
    }
  }
  if (c.keywords?.length > 0) {
    parts.push(`Schlagwörter: ${c.keywords.map((k: any) => k.name || k).join(", ")}`);
  }
  if (c.categories?.length > 0) {
    parts.push(`Kategorien: ${c.categories.map((k: any) => k.name || k).join(", ")}`);
  }
  return parts.join("\n");
}

export function registerContactTools(server: McpServer, client: DayliteRestClient) {
  server.tool(
    "daylite_list_contacts",
    "Kontakte aus Daylite auflisten (REST API)",
    {
      limit: z.number().optional().describe("Maximale Anzahl (Standard: 50)"),
      offset: z.number().optional().describe("Offset für Paginierung"),
    },
    async ({ limit, offset }) => {
      try {
        const params: Record<string, string> = {};
        if (limit) params.limit = String(limit);
        if (offset) params.offset = String(offset);
        const data = await client.get("/contacts", params);
        const contacts = Array.isArray(data) ? data : data?.contacts || data?.data || [];
        if (contacts.length === 0) {
          return { content: [{ type: "text", text: "Keine Kontakte gefunden." }] };
        }
        const text = contacts.map(formatContact).join("\n---\n");
        return { content: [{ type: "text", text: `${contacts.length} Kontakt(e):\n\n${text}` }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Fehler: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "daylite_get_contact",
    "Einen bestimmten Kontakt aus Daylite abrufen",
    {
      id: z.number().describe("Die Daylite Kontakt-ID"),
    },
    async ({ id }) => {
      try {
        const data = await client.get(`/contacts/${id}`);
        return { content: [{ type: "text", text: formatContact(data) }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Fehler: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "daylite_create_contact",
    "Neuen Kontakt in Daylite anlegen",
    {
      first_name: z.string().optional().describe("Vorname"),
      last_name: z.string().describe("Nachname"),
      company_name: z.string().optional().describe("Firmenname"),
      title: z.string().optional().describe("Titel/Position"),
      email: z.string().optional().describe("E-Mail-Adresse"),
      phone: z.string().optional().describe("Telefonnummer"),
    },
    async ({ first_name, last_name, company_name, title, email, phone }) => {
      try {
        const body: any = { last_name };
        if (first_name) body.first_name = first_name;
        if (company_name) body.company = { name: company_name };
        if (title) body.title = title;
        if (email) body.emails = [{ address: email, label: "work" }];
        if (phone) body.phones = [{ number: phone, label: "work" }];
        const data = await client.post("/contacts", body);
        return { content: [{ type: "text", text: `Kontakt erstellt:\n${formatContact(data)}` }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Fehler: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "daylite_update_contact",
    "Bestehenden Kontakt in Daylite aktualisieren",
    {
      id: z.number().describe("Die Daylite Kontakt-ID"),
      first_name: z.string().optional().describe("Neuer Vorname"),
      last_name: z.string().optional().describe("Neuer Nachname"),
      title: z.string().optional().describe("Neuer Titel/Position"),
      email: z.string().optional().describe("Neue E-Mail-Adresse"),
      phone: z.string().optional().describe("Neue Telefonnummer"),
    },
    async ({ id, first_name, last_name, title, email, phone }) => {
      try {
        const body: any = {};
        if (first_name) body.first_name = first_name;
        if (last_name) body.last_name = last_name;
        if (title) body.title = title;
        if (email) body.emails = [{ address: email, label: "work" }];
        if (phone) body.phones = [{ number: phone, label: "work" }];
        const data = await client.put(`/contacts/${id}`, body);
        return { content: [{ type: "text", text: `Kontakt aktualisiert:\n${formatContact(data)}` }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Fehler: ${error.message}` }], isError: true };
      }
    }
  );
}
