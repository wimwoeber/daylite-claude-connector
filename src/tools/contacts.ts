import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DayliteRestClient } from "../daylite-rest-client.js";

function formatContact(c: any): string {
  const parts: string[] = [];
  // Daylite API uses PascalCase field names
  const id = c.ID || c.id || c.objectID || c.object_id || c.primaryKeyValue;
  if (id) parts.push(`ID: ${id}`);
  const firstName = c.FirstName || c.first_name || c.firstName;
  const lastName = c.LastName || c.last_name || c.lastName;
  const fullName = c.FullName || c.full_name || c.fullName || c.cachedName || c.name || c.Name;
  if (fullName) {
    parts.push(`Name: ${fullName}`);
  } else if (firstName || lastName) {
    parts.push(`Name: ${[firstName, lastName].filter(Boolean).join(" ")}`);
  }
  const prefix = c.Prefix || c.prefix;
  if (prefix) parts.push(`Anrede: ${prefix}`);
  const title = c.Title || c.title;
  if (title) parts.push(`Titel: ${title}`);
  const category = c.Category || c.category;
  if (category) parts.push(`Kategorie: ${category}`);
  const details = c.Details || c.details;
  if (details) parts.push(`Details: ${details}`);
  // Company info (if available as sub-object)
  const company = c.Company || c.company;
  if (company) {
    if (typeof company === "object") {
      parts.push(`Firma: ${company.Name || company.name || JSON.stringify(company)}`);
    } else {
      parts.push(`Firma: ${company}`);
    }
  }
  // Email sub-objects
  const emails = c.Emails || c.emails;
  if (emails?.length > 0) {
    parts.push(`E-Mail: ${emails.map((e: any) => e.Address || e.address || e).join(", ")}`);
  }
  // Phone sub-objects
  const phones = c.Phones || c.phones || c.PhoneNumbers || c.phoneNumbers;
  if (phones?.length > 0) {
    parts.push(`Telefon: ${phones.map((p: any) => p.Number || p.number || p).join(", ")}`);
  }
  // URL sub-objects
  const urls = c.Urls || c.urls || c.URLs;
  if (urls?.length > 0) {
    parts.push(`URL: ${urls.map((u: any) => u.Url || u.Address || u.url || u.address || u).join(", ")}`);
  }
  // Address sub-objects
  const addresses = c.Addresses || c.addresses;
  if (addresses?.length > 0) {
    const addr = addresses[0];
    if (typeof addr === "object") {
      const street = addr.Street || addr.street;
      const zip = addr.PostalCode || addr.postal_code || addr.zip;
      const city = addr.City || addr.city;
      parts.push(`Adresse: ${[street, zip, city].filter(Boolean).join(", ")}`);
    }
  }
  // Keywords
  const keywords = c.Keywords || c.keywords;
  if (keywords?.length > 0) {
    parts.push(`Schlagwörter: ${keywords.map((k: any) => k.Name || k.name || k).join(", ")}`);
  }
  const self = c.Self || c.self;
  if (self) parts.push(`Self: ${self}`);
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
        
        // Debug: show raw response structure
        let debugInfo = "";
        if (data) {
          const isArr = Array.isArray(data);
          debugInfo += `[DEBUG] Response is array: ${isArr}\n`;
          if (!isArr) {
            debugInfo += `[DEBUG] Top-level keys: ${Object.keys(data).join(", ")}\n`;
          }
        }
        
        const contacts = Array.isArray(data) ? data : data?.contacts || data?.Contacts || data?.data || [];
        
        // Debug: show first contact raw JSON
        if (contacts.length > 0) {
          debugInfo += `[DEBUG] First contact keys: ${Object.keys(contacts[0]).join(", ")}\n`;
          debugInfo += `[DEBUG] First contact RAW:\n${JSON.stringify(contacts[0], null, 2).slice(0, 2000)}\n`;
          if (contacts.length > 1) {
            debugInfo += `[DEBUG] Second contact RAW:\n${JSON.stringify(contacts[1], null, 2).slice(0, 1000)}\n`;
          }
        }
        
        if (contacts.length === 0) {
          return { content: [{ type: "text", text: `${debugInfo}\nKeine Kontakte gefunden.` }] };
        }
        const text = contacts.slice(0, 5).map(formatContact).join("\n---\n");
        return { content: [{ type: "text", text: `${debugInfo}\n${contacts.length} Kontakt(e) (zeige erste 5):\n\n${text}` }] };
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
        const body: any = { LastName: last_name };
        if (first_name) body.FirstName = first_name;
        if (title) body.Title = title;
        if (email) body.Emails = [{ Address: email, Label: "work" }];
        if (phone) body.Phones = [{ Number: phone, Label: "work" }];
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
        if (first_name) body.FirstName = first_name;
        if (last_name) body.LastName = last_name;
        if (title) body.Title = title;
        if (email) body.Emails = [{ Address: email, Label: "work" }];
        if (phone) body.Phones = [{ Number: phone, Label: "work" }];
        const data = await client.put(`/contacts/${id}`, body);
        return { content: [{ type: "text", text: `Kontakt aktualisiert:\n${formatContact(data)}` }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Fehler: ${error.message}` }], isError: true };
      }
    }
  );
}
