// Daylite CalDAV Integration Typen

export interface DayliteConfig {
  serverUrl: string;
  username: string;
  password: string;
}

export interface ParsedEvent {
  uid: string;
  url: string;
  etag?: string;
  summary: string;
  description?: string;
  location?: string;
  dtstart: string;
  dtend?: string;
  allDay: boolean;
  status?: string;
  attendees?: string[];
  raw: string;
}

export interface ParsedTask {
  uid: string;
  url: string;
  etag?: string;
  summary: string;
  description?: string;
  due?: string;
  dtstart?: string;
  priority?: number;
  status?: string; // NEEDS-ACTION, IN-PROCESS, COMPLETED, CANCELLED
  percentComplete?: number;
  completed?: string;
  raw: string;
}
