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

interface PageParams {
  pageSize?: number;
  pageToken?: string;
}

interface AccountPageParams extends PageParams {
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

// The AdSense Management API v2 represents startDate/endDate as a nested Date
// message ({ year, month, day }), not a primitive. Its GET reports:generate
// endpoint uses Google's standard HTTP/JSON transcoding for nested fields:
// dotted query parameter names (startDate.year, startDate.month, startDate.day).
// Passing a flat "startDate=YYYY-MM-DD" query parameter fails with
// "'startDate' is a message type. Parameters can only be bound to primitive types."
const DATE_FIELD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseDateField(key: string, value: string): { year: number; month: number; day: number } {
  if (!DATE_FIELD_PATTERN.test(value)) {
    throw new Error(`${key} must be a YYYY-MM-DD date, got "${value}".`);
  }
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

// Recursively appends a value to the query string, expanding plain objects into
// dotted nested-field parameter names and arrays into repeated parameters — the
// serialization Google's REST APIs expect for message-typed report fields.
function appendParam(params: URLSearchParams, key: string, value: unknown): void {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    for (const item of value) appendParam(params, key, item);
    return;
  }
  if (typeof value === "object") {
    for (const [subKey, subValue] of Object.entries(value as Record<string, unknown>)) {
      appendParam(params, `${key}.${subKey}`, subValue);
    }
    return;
  }
  params.append(key, String(value));
}

function withQuery(path: string, input: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) appendParam(params, key, value);
  const query = params.toString();
  return `${path}${query ? `?${query}` : ""}`;
}

export class AdSenseClient {
  private token?: string;
  private tokenExpiresAt = 0;
  constructor(private readonly config: AdSenseConfig, private readonly fetchImpl: FetchLike = fetch) {
    this.token = config.accessToken;
    if (this.token) this.tokenExpiresAt = Infinity; // caller-supplied token: no refresh_token to renew it with
  }

  async listAccounts(input: PageParams = {}) {
    return this.request(withQuery("/accounts", input));
  }

  async getAccount(account: string) {
    return this.request(`/${account}`);
  }

  async listPayments(account?: string) {
    const resolvedAccount = account ?? (await this.defaultAccount());
    return this.request(`/${resolvedAccount}/payments`);
  }

  async listChildAccounts(input: AccountPageParams = {}) {
    const { account, ...params } = input;
    const resolvedAccount = account ?? (await this.defaultAccount());
    return this.request(withQuery(`/${resolvedAccount}:listChildAccounts`, params));
  }

  async getAdBlockingRecoveryTag(account?: string) {
    const resolvedAccount = account ?? (await this.defaultAccount());
    return this.request(`/${resolvedAccount}/adBlockingRecoveryTag`);
  }

  async listAlerts(input: { account?: string; languageCode?: string } = {}) {
    const { account, ...params } = input;
    const resolvedAccount = account ?? (await this.defaultAccount());
    return this.request(withQuery(`/${resolvedAccount}/alerts`, params));
  }

  async listPolicyIssues(input: AccountPageParams = {}) {
    const { account, ...params } = input;
    const resolvedAccount = account ?? (await this.defaultAccount());
    return this.request(withQuery(`/${resolvedAccount}/policyIssues`, params));
  }

  async getPolicyIssue(name: string) {
    return this.request(`/${name}`);
  }

  async listSites(input: AccountPageParams = {}) {
    const { account, ...params } = input;
    const resolvedAccount = account ?? (await this.defaultAccount());
    return this.request(withQuery(`/${resolvedAccount}/sites`, params));
  }

  async getSite(name: string) {
    return this.request(`/${name}`);
  }

  async generateReport(input: Record<string, unknown>) {
    const account = String(input.account ?? (await this.defaultAccount()));
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(input)) {
      if (key === "account" || value === undefined) continue;
      if ((key === "startDate" || key === "endDate") && typeof value === "string") {
        appendParam(params, key, parseDateField(key, value));
        continue;
      }
      appendParam(params, key, value);
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
