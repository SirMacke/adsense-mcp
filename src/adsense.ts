const API_ROOT = "https://adsense.googleapis.com/v2";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export type FetchLike = typeof fetch;

export interface AdSenseConfig {
  accessToken?: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  account?: string;
}

export function configFromEnv(env = process.env): AdSenseConfig {
  return {
    accessToken: env.ADSENSE_ACCESS_TOKEN,
    clientId: env.ADSENSE_CLIENT_ID,
    clientSecret: env.ADSENSE_CLIENT_SECRET,
    refreshToken: env.ADSENSE_REFRESH_TOKEN,
    account: env.ADSENSE_ACCOUNT,
  };
}

export class AdSenseClient {
  private token?: string;
  private tokenExpiresAt = 0;
  constructor(private readonly config: AdSenseConfig, private readonly fetchImpl: FetchLike = fetch) {
    this.token = config.accessToken;
    if (this.token) this.tokenExpiresAt = Infinity; // caller-supplied token: no refresh_token to renew it with
  }

  async listAccounts() {
    return this.request("/accounts");
  }

  async getAccount(account: string) {
    return this.request(`/${account}`);
  }

  async generateReport(input: Record<string, unknown>) {
    const account = String(input.account ?? (await this.defaultAccount()));
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(input)) {
      if (key === "account" || value === undefined) continue;
      const values = Array.isArray(value) ? value : [value];
      for (const item of values) {
        if (item !== undefined && item !== null) params.append(key, String(item));
      }
    }
    const query = params.toString();
    return this.request(`/${account}/reports:generate${query ? `?${query}` : ""}`);
  }

  private async defaultAccount(): Promise<string> {
    if (this.config.account) return this.config.account;
    const result = (await this.listAccounts()) as { accounts?: Array<{ name?: string }> };
    const account = result.accounts?.[0]?.name;
    if (!account) throw new Error("No AdSense accounts are available. Set ADSENSE_ACCOUNT or authorize an account with the AdSense API.");
    return account;
  }

  private async request(path: string) {
    const token = await this.getToken();
    const response = await this.fetchImpl(`${API_ROOT}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 401 && this.canRefresh()) {
      // access token expired mid-lifetime (or was revoked) — refresh once and retry
      this.token = undefined;
      const retryToken = await this.getToken();
      const retry = await this.fetchImpl(`${API_ROOT}${path}`, { headers: { Authorization: `Bearer ${retryToken}` } });
      if (!retry.ok) throw new Error(`AdSense API request failed (${retry.status}): ${await retry.text()}`);
      return retry.json();
    }
    if (!response.ok) throw new Error(`AdSense API request failed (${response.status}): ${await response.text()}`);
    return response.json();
  }

  private canRefresh(): boolean {
    return Boolean(this.config.clientId && this.config.clientSecret && this.config.refreshToken);
  }

  private async getToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiresAt) return this.token;
    const { clientId, clientSecret, refreshToken } = this.config;
    if (!clientId || !clientSecret || !refreshToken) {
      if (this.token) return this.token; // expired caller-supplied token and nothing to refresh it with — let the API 401
      throw new Error("Configure ADSENSE_ACCESS_TOKEN or ADSENSE_CLIENT_ID, ADSENSE_CLIENT_SECRET, and ADSENSE_REFRESH_TOKEN.");
    }
    const response = await this.fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
    });
    if (!response.ok) throw new Error(`OAuth token refresh failed (${response.status}): ${await response.text()}`);
    const result = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!result.access_token) throw new Error("OAuth token response did not contain access_token.");
    this.token = result.access_token;
    // refresh 60s early so a near-expiry token never gets used for a real request
    this.tokenExpiresAt = Date.now() + Math.max((result.expires_in ?? 3600) - 60, 0) * 1000;
    return this.token;
  }
}
