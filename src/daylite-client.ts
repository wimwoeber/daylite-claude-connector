import { DAVClient, type DAVCalendar, type DAVCalendarObject } from "tsdav";
import type { DayliteConfig, ParsedEvent, ParsedTask } from "./types.js";

// Simple iCalendar parser - extrahiert Properties aus iCal-Strings
function getICalProp(ical: string, prop: string): string | undefined {
  // Handle folded lines (RFC 5545: lines starting with space/tab are continuations)
  const unfolded = ical.replace(/\r?\n[ \t]/g, "");
  const regex = new RegExp(`^${prop}[;:](.*)$`, "m");
  const match = unfolded.match(regex);
  if (!match) return undefined;
  // Strip parameters (everything before the last colon in the property line)
  const value = match[1];
  const colonIdx = value.indexOf(":");
  // If the match came from a line like PROP;PARAM=x:VALUE, extract VALUE
  if (match[0].includes(";") && colonIdx !== -1) {
    return value.substring(colonIdx + 1);
  }
  return value;
}

function parseEvent(obj: DAVCalendarObject): ParsedEvent | null {
  const data = obj.data;
  if (!data || !data.includes("VEVENT")) return null;

  const summary = getICalProp(data, "SUMMARY") ?? "(Kein Titel)";
  const uid = getICalProp(data, "UID") ?? "";
  const dtstart = getICalProp(data, "DTSTART") ?? "";
  const dtend = getICalProp(data, "DTEND");
  const description = getICalProp(data, "DESCRIPTION");
  const location = getICalProp(data, "LOCATION");
  const status = getICalProp(data, "STATUS");

  // Detect all-day events: DATE format without time component
  const allDay = dtstart.length === 8 || data.includes("VALUE=DATE:");

  // Extract attendees
  const attendees: string[] = [];
  const attendeeRegex = /ATTENDEE[^:]*:(.+)/g;
  let attendeeMatch;
  while ((attendeeMatch = attendeeRegex.exec(data)) !== null) {
    attendees.push(attendeeMatch[1].replace("mailto:", ""));
  }

  return {
    uid,
    url: obj.url,
    etag: obj.etag ?? undefined,
    summary,
    description: description?.replace(/\\n/g, "\n"),
    location,
    dtstart,
    dtend: dtend ?? undefined,
    allDay,
    status,
    attendees: attendees.length > 0 ? attendees : undefined,
    raw: data,
  };
}

function parseTask(obj: DAVCalendarObject): ParsedTask | null {
  const data = obj.data;
  if (!data || !data.includes("VTODO")) return null;

  const summary = getICalProp(data, "SUMMARY") ?? "(Kein Titel)";
  const uid = getICalProp(data, "UID") ?? "";
  const due = getICalProp(data, "DUE");
  const dtstart = getICalProp(data, "DTSTART");
  const description = getICalProp(data, "DESCRIPTION");
  const status = getICalProp(data, "STATUS");
  const priorityStr = getICalProp(data, "PRIORITY");
  const percentStr = getICalProp(data, "PERCENT-COMPLETE");
  const completed = getICalProp(data, "COMPLETED");

  return {
    uid,
    url: obj.url,
    etag: obj.etag ?? undefined,
    summary,
    description: description?.replace(/\\n/g, "\n"),
    due: due ?? undefined,
    dtstart: dtstart ?? undefined,
    priority: priorityStr ? parseInt(priorityStr, 10) : undefined,
    status,
    percentComplete: percentStr ? parseInt(percentStr, 10) : undefined,
    completed: completed ?? undefined,
    raw: data,
  };
}

export class DayliteCalDAVClient {
  private davClient: DAVClient;
  private calendars: DAVCalendar[] = [];
  private initialized = false;

  constructor(config: DayliteConfig) {
    this.davClient = new DAVClient({
      serverUrl: config.serverUrl,
      credentials: {
        username: config.username,
        password: config.password,
      },
      authMethod: "Basic",
      defaultAccountType: "caldav",
    });
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    await this.davClient.login();
    this.calendars = await this.davClient.fetchCalendars();
    this.initialized = true;
  }

  async ensureInit(): Promise<void> {
    if (!this.initialized) await this.init();
  }

  // --- Kalender ---

  async getCalendars(): Promise<DAVCalendar[]> {
    await this.ensureInit();
    return this.calendars;
  }

  async refreshCalendars(): Promise<DAVCalendar[]> {
    await this.davClient.login();
    this.calendars = await this.davClient.fetchCalendars();
    return this.calendars;
  }

  private getCalendar(displayName?: string): DAVCalendar {
    if (this.calendars.length === 0) {
      throw new Error("Keine Kalender gefunden. Ist der CalDAV-Zugang korrekt konfiguriert?");
    }
    if (displayName) {
      const cal = this.calendars.find(
        (c) => String(c.displayName ?? "").toLowerCase() === displayName.toLowerCase()
      );
      if (!cal) {
        const available = this.calendars.map((c) => String(c.displayName ?? "")).join(", ");
        throw new Error(
          `Kalender "${displayName}" nicht gefunden. Verfügbar: ${available}`
        );
      }
      return cal;
    }
    return this.calendars[0];
  }

  // --- Events (VEVENT) ---

  async listEvents(options?: {
    calendarName?: string;
    timeRangeStart?: string;
    timeRangeEnd?: string;
  }): Promise<ParsedEvent[]> {
    await this.ensureInit();
    const calendar = this.getCalendar(options?.calendarName);

    const fetchOptions: Parameters<typeof this.davClient.fetchCalendarObjects>[0] = {
      calendar,
    };

    if (options?.timeRangeStart || options?.timeRangeEnd) {
      fetchOptions.timeRange = {
        start: options.timeRangeStart ?? "19700101T000000Z",
        end: options.timeRangeEnd ?? "20991231T235959Z",
      };
    }

    const objects = await this.davClient.fetchCalendarObjects(fetchOptions);
    return objects.map(parseEvent).filter((e): e is ParsedEvent => e !== null);
  }

  async getEvent(url: string): Promise<ParsedEvent | null> {
    await this.ensureInit();
    const objects = await this.davClient.fetchCalendarObjects({
      calendar: this.calendars[0],
      objectUrls: [url],
    });
    if (objects.length === 0) return null;
    return parseEvent(objects[0]);
  }

  async createEvent(options: {
    calendarName?: string;
    summary: string;
    dtstart: string;
    dtend: string;
    description?: string;
    location?: string;
    allDay?: boolean;
  }): Promise<string> {
    await this.ensureInit();
    const calendar = this.getCalendar(options.calendarName);
    const uid = crypto.randomUUID();

    let dtStartProp: string;
    let dtEndProp: string;

    if (options.allDay) {
      // All-day: VALUE=DATE, format YYYYMMDD
      const startDate = options.dtstart.replace(/[-:T]/g, "").substring(0, 8);
      const endDate = options.dtend.replace(/[-:T]/g, "").substring(0, 8);
      dtStartProp = `DTSTART;VALUE=DATE:${startDate}`;
      dtEndProp = `DTEND;VALUE=DATE:${endDate}`;
    } else {
      // DateTime: ISO -> iCal format
      const startDt = options.dtstart.replace(/[-:]/g, "").replace(/\.\d+/, "");
      const endDt = options.dtend.replace(/[-:]/g, "").replace(/\.\d+/, "");
      dtStartProp = `DTSTART:${startDt}`;
      dtEndProp = `DTEND:${endDt}`;
    }

    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Daylite MCP Server//DE",
      "BEGIN:VEVENT",
      `UID:${uid}`,
      dtStartProp,
      dtEndProp,
      `SUMMARY:${options.summary}`,
    ];
    if (options.description) lines.push(`DESCRIPTION:${options.description.replace(/\n/g, "\\n")}`);
    if (options.location) lines.push(`LOCATION:${options.location}`);
    lines.push(`DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "")}`);
    lines.push("END:VEVENT", "END:VCALENDAR");

    const iCalString = lines.join("\r\n");

    await this.davClient.createCalendarObject({
      calendar,
      filename: `${uid}.ics`,
      iCalString,
    });

    return uid;
  }

  async updateEvent(options: {
    url: string;
    etag?: string;
    summary?: string;
    dtstart?: string;
    dtend?: string;
    description?: string;
    location?: string;
  }): Promise<void> {
    await this.ensureInit();

    // Fetch current event
    const objects = await this.davClient.fetchCalendarObjects({
      calendar: this.calendars[0],
      objectUrls: [options.url],
    });
    if (objects.length === 0) throw new Error(`Event nicht gefunden: ${options.url}`);

    let data = objects[0].data;
    if (!data) throw new Error("Event-Daten konnten nicht gelesen werden");

    // Update fields in iCal data
    if (options.summary) data = data.replace(/SUMMARY:.*/m, `SUMMARY:${options.summary}`);
    if (options.description) data = data.replace(/DESCRIPTION:.*/m, `DESCRIPTION:${options.description.replace(/\n/g, "\\n")}`);
    if (options.location) data = data.replace(/LOCATION:.*/m, `LOCATION:${options.location}`);
    if (options.dtstart) {
      const dt = options.dtstart.replace(/[-:]/g, "").replace(/\.\d+/, "");
      data = data.replace(/DTSTART[^:]*:.*/m, `DTSTART:${dt}`);
    }
    if (options.dtend) {
      const dt = options.dtend.replace(/[-:]/g, "").replace(/\.\d+/, "");
      data = data.replace(/DTEND[^:]*:.*/m, `DTEND:${dt}`);
    }

    await this.davClient.updateCalendarObject({
      calendarObject: {
        url: options.url,
        data,
        etag: options.etag ?? objects[0].etag ?? "",
      },
    });
  }

  async deleteEvent(url: string, etag?: string): Promise<void> {
    await this.ensureInit();

    const objects = await this.davClient.fetchCalendarObjects({
      calendar: this.calendars[0],
      objectUrls: [url],
    });

    await this.davClient.deleteCalendarObject({
      calendarObject: {
        url,
        data: objects[0]?.data ?? "",
        etag: etag ?? objects[0]?.etag ?? "",
      },
    });
  }

  // --- Tasks (VTODO) ---

  async listTasks(options?: {
    calendarName?: string;
  }): Promise<ParsedTask[]> {
    await this.ensureInit();
    const calendar = this.getCalendar(options?.calendarName);

    // Fetch with VTODO filter
    const objects = await this.davClient.fetchCalendarObjects({
      calendar,
      filters: {
        "comp-filter": {
          _attributes: { name: "VCALENDAR" },
          "comp-filter": {
            _attributes: { name: "VTODO" },
          },
        },
      } as any,
    });

    return objects.map(parseTask).filter((t): t is ParsedTask => t !== null);
  }

  async getTask(url: string): Promise<ParsedTask | null> {
    await this.ensureInit();
    const objects = await this.davClient.fetchCalendarObjects({
      calendar: this.calendars[0],
      objectUrls: [url],
    });
    if (objects.length === 0) return null;
    return parseTask(objects[0]);
  }

  async createTask(options: {
    calendarName?: string;
    summary: string;
    description?: string;
    due?: string;
    priority?: number;
  }): Promise<string> {
    await this.ensureInit();
    const calendar = this.getCalendar(options.calendarName);
    const uid = crypto.randomUUID();

    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Daylite MCP Server//DE",
      "BEGIN:VTODO",
      `UID:${uid}`,
      `SUMMARY:${options.summary}`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "")}`,
      "STATUS:NEEDS-ACTION",
    ];
    if (options.description) lines.push(`DESCRIPTION:${options.description.replace(/\n/g, "\\n")}`);
    if (options.due) {
      const dt = options.due.replace(/[-:]/g, "").replace(/\.\d+/, "");
      lines.push(`DUE:${dt}`);
    }
    if (options.priority !== undefined) lines.push(`PRIORITY:${options.priority}`);
    lines.push("END:VTODO", "END:VCALENDAR");

    const iCalString = lines.join("\r\n");

    await this.davClient.createCalendarObject({
      calendar,
      filename: `${uid}.ics`,
      iCalString,
    });

    return uid;
  }

  async updateTask(options: {
    url: string;
    etag?: string;
    summary?: string;
    description?: string;
    due?: string;
    priority?: number;
    status?: string;
    completed?: boolean;
  }): Promise<void> {
    await this.ensureInit();

    const objects = await this.davClient.fetchCalendarObjects({
      calendar: this.calendars[0],
      objectUrls: [options.url],
    });
    if (objects.length === 0) throw new Error(`Task nicht gefunden: ${options.url}`);

    let data = objects[0].data;
    if (!data) throw new Error("Task-Daten konnten nicht gelesen werden");

    if (options.summary) data = data.replace(/SUMMARY:.*/m, `SUMMARY:${options.summary}`);
    if (options.description) data = data.replace(/DESCRIPTION:.*/m, `DESCRIPTION:${options.description.replace(/\n/g, "\\n")}`);
    if (options.due) {
      const dt = options.due.replace(/[-:]/g, "").replace(/\.\d+/, "");
      if (data.includes("DUE:") || data.includes("DUE;")) {
        data = data.replace(/DUE[^:]*:.*/m, `DUE:${dt}`);
      } else {
        data = data.replace("END:VTODO", `DUE:${dt}\r\nEND:VTODO`);
      }
    }
    if (options.priority !== undefined) {
      if (data.includes("PRIORITY:")) {
        data = data.replace(/PRIORITY:.*/m, `PRIORITY:${options.priority}`);
      } else {
        data = data.replace("END:VTODO", `PRIORITY:${options.priority}\r\nEND:VTODO`);
      }
    }
    if (options.status) {
      data = data.replace(/STATUS:.*/m, `STATUS:${options.status}`);
    }
    if (options.completed) {
      const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
      data = data.replace(/STATUS:.*/m, "STATUS:COMPLETED");
      if (data.includes("COMPLETED:")) {
        data = data.replace(/COMPLETED:.*/m, `COMPLETED:${now}`);
      } else {
        data = data.replace("END:VTODO", `COMPLETED:${now}\r\nEND:VTODO`);
      }
      if (data.includes("PERCENT-COMPLETE:")) {
        data = data.replace(/PERCENT-COMPLETE:.*/m, "PERCENT-COMPLETE:100");
      } else {
        data = data.replace("END:VTODO", "PERCENT-COMPLETE:100\r\nEND:VTODO");
      }
    }

    await this.davClient.updateCalendarObject({
      calendarObject: {
        url: options.url,
        data,
        etag: options.etag ?? objects[0].etag ?? "",
      },
    });
  }

  async deleteTask(url: string, etag?: string): Promise<void> {
    await this.ensureInit();

    const objects = await this.davClient.fetchCalendarObjects({
      calendar: this.calendars[0],
      objectUrls: [url],
    });

    await this.davClient.deleteCalendarObject({
      calendarObject: {
        url,
        data: objects[0]?.data ?? "",
        etag: etag ?? objects[0]?.etag ?? "",
      },
    });
  }
}
