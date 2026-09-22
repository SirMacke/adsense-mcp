import assert from "node:assert/strict";
import test from "node:test";
import { AdSenseClient } from "../src/adsense.js";

test("generates a report using the configured account and repeated query parameters", async () => {
  let requested = "";
  const client = new AdSenseClient({ accessToken: "token", account: "accounts/pub-1" }, async (url) => {
    requested = String(url);
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
  await client.generateReport({ metrics: ["CLICKS", "PAGE_VIEWS"], dimensions: ["DATE"], dateRange: "LAST_7_DAYS" });
  assert.match(requested, /accounts\/pub-1\/reports:generate/);
  assert.match(requested, /metrics=CLICKS&metrics=PAGE_VIEWS/);
  assert.match(requested, /dimensions=DATE/);
});

test("expands a CUSTOM date range into the nested startDate/endDate query parameters the API expects", async () => {
  let requested = "";
  const client = new AdSenseClient({ accessToken: "token", account: "accounts/pub-1" }, async (url) => {
    requested = String(url);
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
  await client.generateReport({
    metrics: ["CLICKS"],
    dateRange: "CUSTOM",
    startDate: "2024-01-01",
    endDate: "2024-01-31",
  });
  // startDate/endDate are message-typed (Date) fields in the AdSense API, so
  // they must be sent as dotted nested parameters, not flat startDate=YYYY-MM-DD.
  assert.match(requested, /startDate\.year=2024&startDate\.month=1&startDate\.day=1/);
  assert.match(requested, /endDate\.year=2024&endDate\.month=1&endDate\.day=31/);
  assert.doesNotMatch(requested, /[?&]startDate=2024-01-01/);
  assert.doesNotMatch(requested, /[?&]endDate=2024-01-31/);
});

test("rejects a malformed custom start or end date instead of silently sending a bad value", async () => {
  const client = new AdSenseClient({ accessToken: "token", account: "accounts/pub-1" }, async () => new Response(JSON.stringify({}), { status: 200 }));
  await assert.rejects(
    client.generateReport({ metrics: ["CLICKS"], dateRange: "CUSTOM", startDate: "01/01/2024", endDate: "2024-01-31" }),
    /startDate must be a YYYY-MM-DD date/
  );
});

test("lists payments using an explicit account", async () => {
  let requested = "";
  const client = new AdSenseClient({ accessToken: "token" }, async (url) => {
    requested = String(url);
    return new Response(JSON.stringify({ payments: [] }), { status: 200 });
  });
  const result = await client.listPayments("accounts/pub-1");
  assert.equal(requested, "https://adsense.googleapis.com/v2/accounts/pub-1/payments");
  assert.deepEqual(result, { payments: [] });
});

test("discovers an account when listing payments without one", async () => {
  const urls: string[] = [];
  const client = new AdSenseClient({ accessToken: "token" }, async (url) => {
    urls.push(String(url));
    if (String(url).endsWith("/accounts")) return new Response(JSON.stringify({ accounts: [{ name: "accounts/pub-2" }] }), { status: 200 });
    return new Response(JSON.stringify({ payments: [{ name: "accounts/pub-2/payments/unpaid", amount: "$12.34" }] }), { status: 200 });
  });
  const result = await client.listPayments();
  assert.deepEqual(urls, [
    "https://adsense.googleapis.com/v2/accounts",
    "https://adsense.googleapis.com/v2/accounts/pub-2/payments",
  ]);
  assert.deepEqual(result, { payments: [{ name: "accounts/pub-2/payments/unpaid", amount: "$12.34" }] });
});

test("uses the documented account health and site routes", async () => {
  const urls: string[] = [];
  const client = new AdSenseClient({ accessToken: "token" }, async (url) => {
    urls.push(String(url));
    return new Response(JSON.stringify({}), { status: 200 });
  });

  await client.listAccounts({ pageSize: 25, pageToken: "next page" });
  await client.listChildAccounts({ account: "accounts/pub-1", pageSize: 10 });
  await client.getAdBlockingRecoveryTag("accounts/pub-1");
  await client.listAlerts({ account: "accounts/pub-1", languageCode: "sv-SE" });
  await client.listPolicyIssues({ account: "accounts/pub-1", pageToken: "policy-next" });
  await client.getPolicyIssue("accounts/pub-1/policyIssues/issue-1");
  await client.listSites({ account: "accounts/pub-1", pageSize: 50 });
  await client.getSite("accounts/pub-1/sites/site-1");

  assert.deepEqual(urls, [
    "https://adsense.googleapis.com/v2/accounts?pageSize=25&pageToken=next+page",
    "https://adsense.googleapis.com/v2/accounts/pub-1:listChildAccounts?pageSize=10",
    "https://adsense.googleapis.com/v2/accounts/pub-1/adBlockingRecoveryTag",
    "https://adsense.googleapis.com/v2/accounts/pub-1/alerts?languageCode=sv-SE",
    "https://adsense.googleapis.com/v2/accounts/pub-1/policyIssues?pageToken=policy-next",
    "https://adsense.googleapis.com/v2/accounts/pub-1/policyIssues/issue-1",
    "https://adsense.googleapis.com/v2/accounts/pub-1/sites?pageSize=50",
    "https://adsense.googleapis.com/v2/accounts/pub-1/sites/site-1",
  ]);
});

test("uses the documented inventory routes", async () => {
  const urls: string[] = [];
  const client = new AdSenseClient({ accessToken: "token" }, async (url) => {
    urls.push(String(url));
    return new Response(JSON.stringify({}), { status: 200 });
  });
  const adClient = "accounts/pub-1/adclients/ca-pub-1";
  const adUnit = `${adClient}/adunits/unit-1`;
  const customChannel = `${adClient}/customchannels/custom-1`;
  const urlChannel = `${adClient}/urlchannels/url-1`;

  await client.listAdClients({ account: "accounts/pub-1", pageSize: 20 });
  await client.getAdClient(adClient);
  await client.getAdClientAdCode(adClient);
  await client.listAdUnits({ adClient, pageToken: "units-next" });
  await client.getAdUnit(adUnit);
  await client.getAdUnitAdCode(adUnit);
  await client.listLinkedCustomChannels({ adUnit, pageSize: 30 });
  await client.listUrlChannels({ adClient, pageSize: 40 });
  await client.getUrlChannel(urlChannel);
  await client.listCustomChannels({ adClient, pageToken: "channels-next" });
  await client.getCustomChannel(customChannel);
  await client.listLinkedAdUnits({ customChannel, pageSize: 50 });

  assert.deepEqual(urls, [
    "https://adsense.googleapis.com/v2/accounts/pub-1/adclients?pageSize=20",
    "https://adsense.googleapis.com/v2/accounts/pub-1/adclients/ca-pub-1",
    "https://adsense.googleapis.com/v2/accounts/pub-1/adclients/ca-pub-1/adcode",
    "https://adsense.googleapis.com/v2/accounts/pub-1/adclients/ca-pub-1/adunits?pageToken=units-next",
    "https://adsense.googleapis.com/v2/accounts/pub-1/adclients/ca-pub-1/adunits/unit-1",
    "https://adsense.googleapis.com/v2/accounts/pub-1/adclients/ca-pub-1/adunits/unit-1/adcode",
    "https://adsense.googleapis.com/v2/accounts/pub-1/adclients/ca-pub-1/adunits/unit-1:listLinkedCustomChannels?pageSize=30",
    "https://adsense.googleapis.com/v2/accounts/pub-1/adclients/ca-pub-1/urlchannels?pageSize=40",
    "https://adsense.googleapis.com/v2/accounts/pub-1/adclients/ca-pub-1/urlchannels/url-1",
    "https://adsense.googleapis.com/v2/accounts/pub-1/adclients/ca-pub-1/customchannels?pageToken=channels-next",
    "https://adsense.googleapis.com/v2/accounts/pub-1/adclients/ca-pub-1/customchannels/custom-1",
    "https://adsense.googleapis.com/v2/accounts/pub-1/adclients/ca-pub-1/customchannels/custom-1:listLinkedAdUnits?pageSize=50",
  ]);
});

test("discovers an account and exchanges a refresh token when no access token exists", async () => {
  const urls: string[] = [];
  const client = new AdSenseClient({ clientId: "id", clientSecret: "secret", refreshToken: "refresh" }, async (url) => {
    urls.push(String(url));
    if (String(url).includes("oauth2")) return new Response(JSON.stringify({ access_token: "fresh" }), { status: 200 });
    if (String(url).endsWith("/accounts")) return new Response(JSON.stringify({ accounts: [{ name: "accounts/pub-2" }] }), { status: 200 });
    return new Response(JSON.stringify({ totalMatchedRows: "0" }), { status: 200 });
  });
  await client.generateReport({ metrics: ["CLICKS"] });
  assert.equal(urls.length, 3);
  assert.match(urls[2], /accounts\/pub-2\/reports:generate/);
});

test("refreshes an expired token instead of reusing a cached one forever", async () => {
  let tokensIssued = 0;
  const client = new AdSenseClient({ clientId: "id", clientSecret: "secret", refreshToken: "refresh", account: "accounts/pub-1" }, async (url) => {
    if (String(url).includes("oauth2")) {
      tokensIssued += 1;
      return new Response(JSON.stringify({ access_token: `token-${tokensIssued}`, expires_in: 0 }), { status: 200 });
    }
    return new Response(JSON.stringify({ totalMatchedRows: "0" }), { status: 200 });
  });
  await client.generateReport({ metrics: ["CLICKS"] });
  await client.generateReport({ metrics: ["CLICKS"] });
  assert.equal(tokensIssued, 2, "second call should refresh rather than reuse the expired token");
});

test("retries once on a stray 401 from a token that expired mid-lifetime", async () => {
  let calls = 0;
  const client = new AdSenseClient({ clientId: "id", clientSecret: "secret", refreshToken: "refresh", account: "accounts/pub-1" }, async (url) => {
    if (String(url).includes("oauth2")) return new Response(JSON.stringify({ access_token: "fresh", expires_in: 3600 }), { status: 200 });
    calls += 1;
    if (calls === 1) return new Response(JSON.stringify({ error: { status: "UNAUTHENTICATED" } }), { status: 401 });
    return new Response(JSON.stringify({ totalMatchedRows: "0" }), { status: 200 });
  });
  const result = await client.generateReport({ metrics: ["CLICKS"] });
  assert.equal(calls, 2);
  assert.deepEqual(result, { totalMatchedRows: "0" });
});
