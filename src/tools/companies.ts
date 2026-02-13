import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DayliteRestClient } from "../daylite-rest-client.js";

/** Extract numeric ID from self URL like /v1/companies/170006 */
function extractId(self: string | undefined): string | null {
  if (!self) return null;
  const parts = self.split("/");
  return parts[parts.length - 1] || null;
}

function formatCompany(c: any): string {
  const parts: string[] = [];
  const id = extractId(c.self);
  if (id) parts.push(`ID: ${id}`);
  if (c.name) parts.push(`Name: ${c.name}`);
  if (c.category) parts.push(`Kategorie: ${c.category}`);
  if (c.number_of_employees) parts.push(`Mitarbeiter: ${c.number_of_employees}`);
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
  // Addresses
  if (c.addresses?.length > 0) {
    const addr = c.addresses[0];
    if (typeof addr === "object") {
      parts.push(`Adresse: ${[addr.street, addr.postal_code, addr.city].filter(Boolean).join(", ")}`);
    }
  }
  // Contacts
  if (c.contacts?.length > 0) {
    parts.push(`Kontakte: ${c.contacts.map((co: any) => `${co.contact} (${co.role || ""})`).join(", ")}`);
  }
  // Keywords
  if (c.keywords?.length > 0) {
    parts.push(`Schlagwörter: ${c.keywords.join(", ")}`);
  }
  if (c.flagged) parts.push(`⭐ Markiert`);
  if (c.owner) parts.push(`Besitzer: ${c.owner}`);
  return parts.join("\n");
}

export function registerCompanyTools(server: McpServer, client: DayliteRestClient) {
  server.tool(
    "daylite_list_companies",
    "Firmen aus Daylite auflisten (REST API)",
    {
      limit: z.number().optional().describe("Maximale Anzahl (Standard: 50)"),
      offset: z.number().optional().describe("Offset für Paginierung"),
    },
    async ({ limit, offset }) => {
      try {
        const params: Record<string, string> = {};
        if (limit) params.limit = String(limit);
        if (offset) params.offset = String(offset);
        const data = await client.get("/companies", params);
        const companies = Array.isArray(data) ? data : data?.data || [];
        if (companies.length === 0) {
          return { content: [{ type: "text", text: "Keine Firmen gefunden." }] };
        }
        const display = limit ? companies : companies.slice(0, 50);
        const text = display.map(formatCompany).join("\n---\n");
        return { content: [{ type: "text", text: `${companies.length} Firma(en)${display.length < companies.length ? ` (zeige erste ${display.length})` : ""}:\n\n${text}` }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Fehler: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "daylite_get_company",
    "Eine bestimmte Firma aus Daylite abrufen",
    {
      id: z.number().describe("Die Daylite Firmen-ID"),
    },
    async ({ id }) => {
      try {
        const data = await client.get(`/companies/${id}`);
        return { content: [{ type: "text", text: formatCompany(data) }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Fehler: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "daylite_create_company",
    "Neue Firma in Daylite anlegen",
    {
      name: z.string().describe("Firmenname"),
      email: z.string().optional().describe("E-Mail-Adresse"),
      phone: z.string().optional().describe("Telefonnummer"),
      url: z.string().optional().describe("Webseite"),
    },
    async ({ name, email, phone, url }) => {
      try {
        const body: any = { name };
        if (email) body.email_addresses = [{ address: email, label: "work" }];
        if (phone) body.phone_numbers = [{ number: phone, label: "work" }];
        if (url) body.urls = [{ url, label: "work" }];
        const data = await client.post("/companies", body);
        return { content: [{ type: "text", text: `Firma erstellt:\n${formatCompany(data)}` }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Fehler: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "daylite_update_company",
    "Bestehende Firma in Daylite aktualisieren",
    {
      id: z.number().describe("Die Daylite Firmen-ID"),
      name: z.string().optional().describe("Neuer Firmenname"),
      email: z.string().optional().describe("Neue E-Mail"),
      phone: z.string().optional().describe("Neue Telefonnummer"),
      url: z.string().optional().describe("Neue Webseite"),
    },
    async ({ id, name, email, phone, url }) => {
      try {
        // Bestehende Firma laden, um Arrays nicht zu überschreiben
        const existing = await client.get(`/companies/${id}`);
        const body: any = {};
        if (name) body.name = name;
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
        if (url) {
          const existingUrls = existing?.urls || [];
          const alreadyExists = existingUrls.some((u: any) => (u.url || u.address) === url);
          body.urls = alreadyExists ? existingUrls : [...existingUrls, { url, label: "work" }];
        }
        await client.patch(`/companies/${id}`, body);
        const updated = await client.get(`/companies/${id}`);
        return { content: [{ type: "text", text: `Firma aktualisiert:\n${formatCompany(updated)}` }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Fehler: ${error.message}` }], isError: true };
      }
    }
  );
}
