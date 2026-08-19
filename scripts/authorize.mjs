/**
 * One-time OAuth authorization for AdSense. This is intentionally separate
 * from the stdio MCP process: browsers must never be opened by an MCP server.
 *
 * Required environment variables:
 *   ADSENSE_OAUTH_CLIENT_FILE=/path/to/downloaded-desktop-client.json
 *   ADSENSE_TOKEN_FILE=/private/path/adsense-oauth.json
 */
import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes, createHash } from "node:crypto";
import { spawn } from "node:child_process";

const clientFile = process.env.ADSENSE_OAUTH_CLIENT_FILE;
const tokenFile = process.env.ADSENSE_TOKEN_FILE;
if (!clientFile || !tokenFile) throw new Error("Set ADSENSE_OAUTH_CLIENT_FILE and ADSENSE_TOKEN_FILE before running this command.");
const client = JSON.parse(readFileSync(clientFile, "utf8")).installed;
if (!client?.client_id || !client?.client_secret) throw new Error("Expected a downloaded OAuth Desktop client JSON with an installed client ID and secret.");

const state = randomBytes(32).toString("base64url");
const verifier = randomBytes(64).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");
const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", redirectUri);
  if (url.pathname !== "/oauth2callback" || url.searchParams.get("state") !== state) return response.writeHead(400).end("Invalid OAuth callback.");
  const code = url.searchParams.get("code");
  if (!code) return response.writeHead(400).end(`Authorization failed: ${url.searchParams.get("error") ?? "no authorization code"}`);
  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: client.client_id, client_secret: client.client_secret, redirect_uri: redirectUri, grant_type: "authorization_code", code_verifier: verifier }),
    });
    if (!tokenResponse.ok) throw new Error(`Token exchange failed (${tokenResponse.status}): ${await tokenResponse.text()}`);
    const token = await tokenResponse.json();
    if (!token.refresh_token) throw new Error("Google did not return a refresh token. Revoke this app's access and retry, or ensure consent is requested with prompt=consent.");
    writeFileSync(tokenFile, JSON.stringify({ client_id: client.client_id, client_secret: client.client_secret, refresh_token: token.refresh_token }, null, 2), { mode: 0o600 });
    response.writeHead(200, { "Content-Type": "text/html" }).end("<h1>AdSense authorization complete.</h1><p>You may close this tab and return to the terminal.</p>");
    console.log(`Authorization complete. Saved private credentials to ${tokenFile}`);
    server.close();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    response.writeHead(500).end("Authorization failed; see the terminal.");
    server.close();
    process.exitCode = 1;
  }
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authorizationUrl.search = new URLSearchParams({ client_id: client.client_id, redirect_uri: redirectUri, response_type: "code", scope: "https://www.googleapis.com/auth/adsense.readonly", access_type: "offline", prompt: "consent", state, code_challenge: challenge, code_challenge_method: "S256" }).toString();
console.log(`Open this URL in a browser and sign in with the AdSense account:\n${authorizationUrl}`);
if (process.platform === "win32") spawn("cmd", ["/c", "start", "", authorizationUrl.toString()], { detached: true, stdio: "ignore", windowsHide: true }).unref();
