# Daylite MCP Server

MCP-Server für [Daylite CRM](https://www.daylite.app/) – verbindet Claude Desktop mit deinen Daylite-Daten.

## Features

### CalDAV (Tasks & Termine)
- Aufgaben auflisten, erstellen, bearbeiten, löschen
- Termine auflisten, erstellen, bearbeiten, löschen
- Kalender verwalten

### REST API (CRM-Daten)
- **Kontakte**: Suchen, anzeigen, erstellen, aktualisieren
- **Firmen**: Suchen, anzeigen, erstellen, aktualisieren
- **Verkaufschancen (Opportunities)**: Verwalten mit Pipeline-Stufen
- **Projekte**: Verwalten mit Pipeline-Stufen
- **Pipelines**: Verfügbare Pipelines und Stufen anzeigen
- **Übergreifende Suche**: Über alle Entitäten hinweg suchen

## Setup

### 1. Projekt klonen & bauen

```bash
git clone https://github.com/wimwoeber/daylite-claude-connector.git
cd daylite-claude-connector
npm install
npm run build
```

### 2. Zugangsdaten konfigurieren

#### CalDAV (für Tasks & Termine)
In Daylite: Einstellungen → Kalender und Kontakte Integration → + Neue App-Anmeldung

#### REST API (für Kontakte, Firmen, Opportunities, Projekte)
1. Gehe zu https://developer.daylite.app/reference/personal-token
2. Klicke auf "here" um dich zu autorisieren
3. Speichere den `refresh_token` sicher ab

### 3. Claude Desktop konfigurieren

In `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "daylite": {
      "command": "node",
      "args": ["/Users/DEIN_USER/daylite-claude-connector/build/index.js"],
      "env": {
        "DAYLITE_USERNAME": "dein-caldav-username",
        "DAYLITE_PASSWORD": "dein-caldav-passwort",
        "DAYLITE_REFRESH_TOKEN": "dein-refresh-token"
      }
    }
  }
}
```

**Hinweis:** Du kannst CalDAV und REST API unabhängig voneinander nutzen. Wenn nur `DAYLITE_REFRESH_TOKEN` gesetzt ist, stehen nur die REST-Tools zur Verfügung. Wenn nur `DAYLITE_USERNAME` und `DAYLITE_PASSWORD` gesetzt sind, nur die CalDAV-Tools.

### 4. Claude Desktop neu starten

Nach dem Neustart solltest du in den Entwicklereinstellungen sehen, dass der Daylite-Server läuft.

## Verfügbare Tools

### CalDAV
| Tool | Beschreibung |
|------|-------------|
| `daylite_list_tasks` | Aufgaben auflisten |
| `daylite_get_task` | Aufgabe abrufen |
| `daylite_create_task` | Aufgabe erstellen |
| `daylite_update_task` | Aufgabe aktualisieren |
| `daylite_delete_task` | Aufgabe löschen |
| `daylite_list_appointments` | Termine auflisten |
| `daylite_get_appointment` | Termin abrufen |
| `daylite_create_appointment` | Termin erstellen |
| `daylite_update_appointment` | Termin aktualisieren |
| `daylite_delete_appointment` | Termin löschen |
| `daylite_list_calendars` | Kalender auflisten |

### REST API
| Tool | Beschreibung |
|------|-------------|
| `daylite_list_contacts` | Kontakte auflisten |
| `daylite_get_contact` | Kontakt abrufen |
| `daylite_create_contact` | Kontakt erstellen |
| `daylite_update_contact` | Kontakt aktualisieren |
| `daylite_list_companies` | Firmen auflisten |
| `daylite_get_company` | Firma abrufen |
| `daylite_create_company` | Firma erstellen |
| `daylite_update_company` | Firma aktualisieren |
| `daylite_list_opportunities` | Verkaufschancen auflisten |
| `daylite_get_opportunity` | Verkaufschance abrufen |
| `daylite_create_opportunity` | Verkaufschance erstellen |
| `daylite_update_opportunity` | Verkaufschance aktualisieren |
| `daylite_list_projects` | Projekte auflisten |
| `daylite_get_project` | Projekt abrufen |
| `daylite_create_project` | Projekt erstellen |
| `daylite_update_project` | Projekt aktualisieren |
| `daylite_search` | Übergreifende Suche |
| `daylite_list_pipelines` | Pipelines anzeigen |

## Token-Rotation

Der REST API Client handhabt Token-Rotation automatisch:
- Access Tokens laufen nach 1 Stunde ab
- Der Client refresht automatisch über den Refresh Token
- Neue Refresh Tokens werden automatisch übernommen

## Lizenz

MIT
