/**
 * Daylite REST API Client
 * Uses personal token (refresh_token) for authentication.
 * Base URL: https://api.marketcircle.net/v1/
 *
 * Multi-device support: If a persisted (rotated) token fails,
 * automatically falls back to the original token from config.
 * This ensures both Mac and MacBook can work independently.
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const BASE_URL = "https://api.marketcircle.net/v1";
const TOKEN_FILE = join(homedir(), ".daylite-refresh-token");

export interface DayliteRestConfig {
  refreshToken: string;
}

export class DayliteRestClient {
  private configToken: string;      // Original token from env/config (never changes)
  private refreshToken: string;     // Active token (may be rotated)
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(config: DayliteRestConfig) {
    this.configToken = config.refreshToken;

    // Try to load persisted token first, fall back to config
    const persisted = this.loadPersistedToken();
    if (persisted && persisted !== config.refreshToken) {
      console.error(`[Daylite REST] Using persisted refresh token from ${TOKEN_FILE}`);
      this.refreshToken = persisted;
    } else {
      console.error(`[Daylite REST] Using refresh token from environment/config`);
      this.refreshToken = config.refreshToken;
    }
  }

  /**
   * Load refresh token from disk if available.
   */
  private loadPersistedToken(): string | null {
    try {
      if (existsSync(TOKEN_FILE)) {
        const data = readFileSync(TOKEN_FILE, "utf-8").trim();
        if (data.length > 10) {
          return data;
        }
      }
    } catch (e) {
      console.error(`[Daylite REST] Could not read token file: ${e}`);
    }
    return null;
  }

  /**
   * Save refresh token to disk for persistence across restarts.
   */
  private persistToken(token: string): void {
    try {
      writeFileSync(TOKEN_FILE, token, { encoding: "utf-8", mode: 0o600 });
      console.error(`[Daylite REST] Refresh token persisted to ${TOKEN_FILE}`);
    } catch (e) {
      console.error(`[Daylite REST] Could not persist token: ${e}`);
    }
  }

  /**
   * Remove persisted token (e.g. when it's invalid).
   */
  private removePersistedToken(): void {
    try {
      if (existsSync(TOKEN_FILE)) {
        unlinkSync(TOKEN_FILE);
        console.error(`[Daylite REST] Removed invalid persisted token`);
      }
    } catch (e) {
      console.error(`[Daylite REST] Could not remove token file: ${e}`);
    }
  }

  /**
   * Get a valid access token, refreshing if needed.
   */
  private async getAccessToken(): Promise<string> {
    // Refresh 5 minutes before expiry
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 300000) {
      return this.accessToken;
    }
    return this.refreshAccessToken();
  }

  /**
   * Try to refresh with a specific token. Returns null on failure.
   */
  private async tryRefresh(token: string): Promise<any | null> {
    const url = `${BASE_URL}/personal_token/refresh_token?refresh_token=${encodeURIComponent(token)}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[Daylite REST] Token refresh failed (${response.status}): ${text}`);
      return null;
    }

    return response.json();
  }

  private async refreshAccessToken(): Promise<string> {
    // 1. Try with current (possibly rotated) token
    let data = await this.tryRefresh(this.refreshToken);

    // 2. If that failed and we have a different config token, try fallback
    if (!data && this.refreshToken !== this.configToken) {
      console.error(`[Daylite REST] Rotated token failed, trying original config token...`);
      this.removePersistedToken();
      data = await this.tryRefresh(this.configToken);
      if (data) {
        console.error(`[Daylite REST] Fallback to config token succeeded`);
        this.refreshToken = this.configToken;
      }
    }

    if (!data) {
      throw new Error(
        "Token-Refresh fehlgeschlagen mit allen verfügbaren Tokens. " +
        "Bitte neuen Refresh Token generieren: https://developer.daylite.app/reference/personal-token"
      );
    }

    this.accessToken = data.access_token;
    // Store new refresh token if provided (token rotation)
    if (data.refresh_token && data.refresh_token !== this.refreshToken) {
      this.refreshToken = data.refresh_token;
      // Persist to disk so it survives restarts
      this.persistToken(this.refreshToken);
    }
    // Assume 1 hour validity
    this.tokenExpiresAt = Date.now() + 3600000;
    return this.accessToken!;
  }

  /**
   * Make an authenticated API request.
   */
  async request(method: string, path: string, body?: any, queryParams?: Record<string, string>): Promise<any> {
    const token = await this.getAccessToken();
    let url = `${BASE_URL}${path}`;

    if (queryParams) {
      const params = new URLSearchParams(queryParams);
      url += `?${params.toString()}`;
    }

    const options: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    };

    if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    // Handle 401 - token might have expired, try refresh once
    if (response.status === 401 && this.accessToken) {
      this.accessToken = null;
      const newToken = await this.refreshAccessToken();
      options.headers = {
        ...options.headers as Record<string, string>,
        Authorization: `Bearer ${newToken}`,
      };
      const retryResponse = await fetch(url, options);
      if (!retryResponse.ok) {
        const text = await retryResponse.text();
        throw new Error(`API-Fehler (${retryResponse.status}): ${text}`);
      }
      return retryResponse.json();
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API-Fehler (${response.status}): ${text}`);
    }

    // Some endpoints return 204 No Content
    if (response.status === 204) return null;
    return response.json();
  }

  // Convenience methods
  async get(path: string, queryParams?: Record<string, string>): Promise<any> {
    return this.request("GET", path, undefined, queryParams);
  }

  async post(path: string, body: any): Promise<any> {
    return this.request("POST", path, body);
  }

  async put(path: string, body: any): Promise<any> {
    return this.request("PUT", path, body);
  }

  async patch(path: string, body: any): Promise<any> {
    return this.request("PATCH", path, body);
  }

  async delete(path: string): Promise<any> {
    return this.request("DELETE", path);
  }

  /**
   * Get the current refresh token (in case it was rotated).
   */
  getRefreshToken(): string {
    return this.refreshToken;
  }
}
