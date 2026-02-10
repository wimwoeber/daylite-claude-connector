import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DayliteRestClient } from "../daylite-rest-client.js";

function formatCompany(c: any): string {
  const parts: string[] = [];
  parts.push(`ID: ${c.id}`);
  if (c.name) parts.push(`Name: ${c.name}`);
  if (c.emails?.length > 0) {
    parts.push(`E-Mail: ${c.emails.map((e: any) => e.address || e).join(", ")}`);
  }
  if (c.phones?.length > 0) {
    parts.push(`Telefon: ${c.phones.map((p: any) => p.number || p).join(", ")}`);
  }
  if (c.urls?.length > 0) {
    parts.push(`URL: ${c.urls.map((u: any) => u.address || u.url || u).join(", ")}`);
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
        const companies = Array.isArray(data) ? data : data?.companies || data?.data || [];
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
        const body: any = { name };
        if (email) body.emails = [{ address: email, label: "work" }];
        if (phone) body.phones = [{ number: phone, label: "work" }];
        if (url) body.urls = [{ address: url, label: "work" }];
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
        if (name) body.name = name;
        if (email) body.emails = [{ address: email, label: "work" }];
        if (phone) body.phones = [{ number: phone, label: "work" }];
        if (url) body.urls = [{ address: url, label: "work" }];
        const data = await client.put(`/companies/${id}`, body);
        return { content: [{ type: "text", text: `Firma aktualisiert:\n${formatCompany(data)}` }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Fehler: ${error.message}` }], isError: true };
      }
    }
  );
}
