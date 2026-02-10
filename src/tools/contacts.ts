import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DayliteRestClient } from "../daylite-rest-client.js";

/** Extract numeric ID from self URL like /v1/contacts/1000 */
function extractId(self: string | undefined): string | null {
  if (!self) return null;
  const parts = self.split("/");
  return parts[parts.length - 1] || null;
}

function formatContact(c: any): string {
  const parts: string[] = [];
  const id = extractId(c.self);
  if (id) parts.push(`ID: ${id}`);
  const name = c.full_name || [c.first_name, c.last_name].filter(Boolean).join(" ");
  if (name) parts.push(`Name: ${name}`);
  if (c.individual_salutation) parts.push(`Anrede: ${c.individual_salutation}`);
  if (c.category) parts.push(`Kategorie: ${c.category}`);
  if (c.birthday) parts.push(`Geburtstag: ${c.birthday}`);
  // Email addresses
  if (c.email_addresses?.length > 0) {
    parts.push(`E-Mail: ${c.email_addresses.map((e: any) => `${e.address || (typeof e === "string" ? e : "")} (${e.label || ""})`).join(", ")}`);
  }
  // Phone numbers
  if (c.phone_numbers?.length > 0) {
    parts.push(`Telefon: ${c.phone_numbers.map((p: any) => `${p.number || (typeof p === "string" ? p : "")} (${p.label || ""})`).join(", ")}`);
  }
  // URLs
  if (c.urls?.length > 0) {
    parts.push(`URL: ${c.urls.map((u: any) => u.url || u.address || (typeof u === "string" ? u : "")).join(", ")}`);
  }
  // Address
  if (c.addresses?.length > 0) {
    const addr = c.addresses[0];
    if (typeof addr === "object") {
      parts.push(`Adresse: ${[addr.street, addr.postal_code, addr.city].filter(Boolean).join(", ")}`);
    }
  }
  // Companies
  if (c.companies?.length > 0) {
    parts.push(`Firmen: ${c.companies.map((co: any) => `${co.company} (${co.role || ""})`).join(", ")}`);
  }
  // Keywords
  if (c.keywords?.length > 0) {
    parts.push(`Schlagwörter: ${c.keywords.join(", ")}`);
  }
  if (c.flagged) parts.push(`⭐ Markiert`);
  if (c.owner) parts.push(`Besitzer: ${c.owner}`);
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
        const contacts = Array.isArray(data) ? data : data?.data || [];
        if (contacts.length === 0) {
          return { content: [{ type: "text", text: "Keine Kontakte gefunden." }] };
        }
        const display = limit ? contacts : contacts.slice(0, 50);
        const text = display.map(formatContact).join("\n---\n");
        return { content: [{ type: "text", text: `${contacts.length} Kontakt(e)${display.length < contacts.length ? ` (zeige erste ${display.length})` : ""}:\n\n${text}` }] };
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
        if (title) body.individual_salutation = title;
        if (email) body.email_addresses = [{ address: email, label: "work" }];
        if (phone) body.phone_numbers = [{ number: phone, label: "work" }];
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
        // Bestehenden Kontakt laden, um Arrays nicht zu überschreiben
        const existing = await client.get(`/contacts/${id}`);
        const body: any = {};
        if (first_name) body.first_name = first_name;
        if (last_name) body.last_name = last_name;
        if (title) body.individual_salutation = title;
        if (email) {
          const existingEmails = existing?.email_addresses || [];
          const alreadyExists = existingEmails.some((e: any) => e.address === email);
          body.email_addresses = alreadyExists ? existingEmails : [...existingEmails, { address: email, label: "work" }];
        }
        if (phone) {
          const existingPhones = existing?.phone_numbers || [];
          const alreadyExists = existingPhones.some((p: any) => p.number === phone);
          body.phone_numbers = alreadyExists ? existingPhones : [...existingPhones, { number: phone, label: "work" }];
        }
        const data = await client.put(`/contacts/${id}`, body);
        return { content: [{ type: "text", text: `Kontakt aktualisiert:\n${formatContact(data)}` }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Fehler: ${error.message}` }], isError: true };
      }
    }
  );
}
