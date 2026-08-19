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
