# Daylite Claude Connector

MCP-Server (Model Context Protocol), der [Daylite CRM](https://www.daylite.app/) mit [Claude Code](https://docs.anthropic.com/en/docs/claude-code) verbindet. Nutzt die CalDAV-Schnittstelle von Daylite, um Tasks und Termine direkt aus Claude Code heraus zu verwalten.

## Features

- **Tasks (VTODO):** Auflisten, erstellen, bearbeiten, als erledigt markieren, löschen
- **Termine (VEVENT):** Auflisten (mit Zeitraum-Filter), erstellen, bearbeiten, löschen
- **Kalender:** Alle verfügbaren Daylite-Kalender anzeigen
- **CalDAV:** Nutzt den bestehenden Daylite CalDAV-Zugang - kein separater API-Antrag nötig

## Voraussetzungen

- Node.js 18+
- Ein Daylite-Account mit CalDAV-Zugang
- Claude Code

## Installation

```bash
git clone https://github.com/wimwoeber/daylite-claude-connector.git
cd daylite-claude-connector
npm install
npm run build
```

## Daylite CalDAV-Zugangsdaten

1. Daylite öffnen > Einstellungen > **Kalender und Kontakte Integration**
2. Auf **"+ Neue App-Anmeldung"** klicken
3. Benutzername und Passwort notieren
4. Serveradresse: `https://caldav.marketcircle.net`

## In Claude Code registrieren

```bash
claude mcp add daylite \
  -e DAYLITE_USERNAME=dein-benutzername \
  -e DAYLITE_PASSWORD=dein-passwort \
  -- node /pfad/zu/daylite-claude-connector/build/index.js
```

Falls die Serveradresse abweicht:

```bash
claude mcp add daylite \
  -e DAYLITE_USERNAME=dein-benutzername \
  -e DAYLITE_PASSWORD=dein-passwort \
  -e DAYLITE_SERVER_URL=https://deine-server-url \
  -- node /pfad/zu/daylite-claude-connector/build/index.js
```

Nach der Registrierung Claude Code neu starten.

## Verfügbare Tools

| Tool | Beschreibung |
|---|---|
| `daylite_list_calendars` | Alle verfügbaren Kalender auflisten |
| `daylite_list_tasks` | Tasks auflisten |
| `daylite_get_task` | Task per URL abrufen |
| `daylite_create_task` | Neuen Task erstellen |
| `daylite_update_task` | Task aktualisieren / abschließen |
| `daylite_delete_task` | Task löschen |
| `daylite_list_appointments` | Termine auflisten (Zeitraum-Filter) |
| `daylite_get_appointment` | Termin per URL abrufen |
| `daylite_create_appointment` | Neuen Termin erstellen |
| `daylite_update_appointment` | Termin aktualisieren |
| `daylite_delete_appointment` | Termin löschen |

## Verwendungsbeispiele in Claude Code

```
"Zeig mir meine Daylite-Kalender"
"Was sind meine offenen Tasks?"
"Erstelle einen Task: Angebot an Firma X senden, fällig am Freitag"
"Welche Termine habe ich diese Woche?"
"Erstelle morgen um 14 Uhr einen Termin mit Titel Kundengespräch"
"Markiere den Task XY als erledigt"
```

## Technik

- **TypeScript** mit MCP SDK (`@modelcontextprotocol/sdk`)
- **tsdav** als CalDAV-Client
- **stdio** Transport (lokaler MCP-Server)
- iCalendar-Parsing für VTODO und VEVENT

## Einschränkungen

Der CalDAV-Zugang bietet Zugriff auf Kalender, Termine und Tasks. Andere Daylite-Objekte (Kontakte, Opportunities, Projekte, Pipelines) sind darüber nicht verfügbar - dafür wäre der separate [Daylite REST API](https://developer.daylite.app/) Zugang nötig.

## Lizenz

MIT
