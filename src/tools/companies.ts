import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DayliteRestClient } from "../daylite-rest-client.js";

function formatCompany(c: any): string {
  const parts: string[] = [];
  // Daylite API uses PascalCase field names
  const id = c.ID || c.id;
  if (id) parts.push(`ID: ${id}`);
  const name = c.Name || c.name;
  if (name) parts.push(`Name: ${name}`);
  const details = c.Details || c.details;
  if (details) parts.push(`Details: ${details}`);
  const category = c.Category || c.category;
  if (category) parts.push(`Kategorie: ${category}`);
  const industry = c.Industry || c.industry;
  if (industry) parts.push(`Branche: ${industry}`);
  const type = c.Type || c.type;
  if (type) parts.push(`Typ: ${type}`);
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
        const companies = Array.isArray(data) ? data : data?.companies || data?.Companies || data?.data || [];
        if (companies.length === 0) {
          return { content: [{ type: "text", text: "Keine Firmen gefunden." }] };
        }
        const text = companies.map(formatCompany).join("\n---\n");
        return { content: [{ type: "text", text: `${companies.length} Firma(en):\n\n${text}` }] };
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
        const body: any = { Name: name };
        if (email) body.Emails = [{ Address: email, Label: "work" }];
        if (phone) body.Phones = [{ Number: phone, Label: "work" }];
        if (url) body.Urls = [{ Url: url, Label: "work" }];
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
        const body: any = {};
        if (name) body.Name = name;
        if (email) body.Emails = [{ Address: email, Label: "work" }];
        if (phone) body.Phones = [{ Number: phone, Label: "work" }];
        if (url) body.Urls = [{ Url: url, Label: "work" }];
        const data = await client.put(`/companies/${id}`, body);
        return { content: [{ type: "text", text: `Firma aktualisiert:\n${formatCompany(data)}` }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Fehler: ${error.message}` }], isError: true };
      }
    }
  );
}
