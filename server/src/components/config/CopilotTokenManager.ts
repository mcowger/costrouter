import { logger } from "../Logger.js";
import { Provider } from "#schemas/src/provider";

const COPILOT_TOKEN_API_URL = "https://api.github.com/copilot_internal/v2/token";

interface CopilotMeta {
  token: string;
  expiresAt: number;
}

// Token cache storing {token, expiresAt} keyed by the provider's OAuth token
const tokenCache = new Map<string, CopilotMeta>();

/**
 * Manages GitHub Copilot bearer tokens on a per-provider basis.
 * This is a stateless utility class; no instance is required.
 */
export class CopilotTokenManager {
  /**
   * Checks if a cached token is still valid, allowing for a 5-minute buffer.
   * @param meta The token metadata from the cache.
   * @returns True if the token is valid, otherwise false.
   */
  private static isTokenValid(meta?: CopilotMeta): boolean {
    if (!meta) return false;
    const bufferDuration = 5 * 60 * 1000; // 5 minutes
    return Date.now() < meta.expiresAt - bufferDuration;
  }

  /**
   * Fetches a new bearer token from the GitHub Copilot API.
   * @param oauthToken The GitHub OAuth token for the provider.
   * @returns The token metadata.
   */
  private static async fetchMeta(oauthToken: string): Promise<CopilotMeta> {
    const res = await fetch(COPILOT_TOKEN_API_URL, {
      method: "GET",
      headers: {
        "User-Agent": "costrouter",
        Authorization: `token ${oauthToken}`,
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch bearer token: ${res.status} ${res.statusText}`);
    }

    const { token, expires_at } = await res.json();
    const expiresAt = new Date(expires_at).getTime();

    return { token, expiresAt };
  }

  /**
   * Refreshes the bearer token and updates the cache.
   * @param oauthToken The GitHub OAuth token for the provider.
   * @returns The newly fetched token metadata.
   */
  private static async refreshMeta(oauthToken: string): Promise<CopilotMeta> {
    logger.debug({ oauthToken: oauthToken.slice(0, 10) }, "Refreshing Copilot bearer token");
    const meta = await this.fetchMeta(oauthToken);
    tokenCache.set(oauthToken, meta);
    return meta;
  }

  /**
   * Gets a valid bearer token for a specific Copilot provider.
   * It uses a cache to avoid unnecessary requests.
   * @param provider The Copilot provider configuration.
   * @returns A valid bearer token.
   */
  public static async getBearerToken(provider: Provider): Promise<string> {
    if (provider.type !== 'copilot' || !provider.oauthToken) {
      throw new Error("Invalid provider or missing OAuth token for Copilot.");
    }

    let meta = tokenCache.get(provider.oauthToken);

    if (!this.isTokenValid(meta)) {
      meta = await this.refreshMeta(provider.oauthToken);
    }

    return meta?.token || "";
  }
}