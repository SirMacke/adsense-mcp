# AdSense MCP

An MCP server that extracts ad-hoc data from the [AdSense Management API v2](https://developers.google.com/adsense/management/reference/rest/v2/accounts.reports/generate). It exposes an unrestricted report interface: any supported AdSense dimensions, metrics, filters, time period, sort order, timezone, language, currency, and limit can be passed through to `accounts.reports.generate`.

## Setup

1. In Google Cloud, enable **AdSense Management API** and create an OAuth Desktop client.
2. Obtain a refresh token granted the `https://www.googleapis.com/auth/adsense.readonly` scope. Keep it secret.
3. Copy `.env.example` to your secure environment configuration and populate either `ADSENSE_ACCESS_TOKEN` or the OAuth client ID, secret, and refresh token.
4. Install and build:

```sh
npm install
npm run build
```

### One-time OAuth authorization (without gcloud)

Download the OAuth **Desktop** client JSON from Google Cloud, then run:

```powershell
$env:ADSENSE_OAUTH_CLIENT_FILE = "C:\secure\adsense-client.json"
$env:ADSENSE_TOKEN_FILE = "C:\secure\adsense-oauth.json"
npm run authorize
```

The command opens the Google consent screen on a localhost callback and saves the client ID, client secret, and refresh token only in the private token file. Copy those values to the `ADSENSE_CLIENT_ID`, `ADSENSE_CLIENT_SECRET`, and `ADSENSE_REFRESH_TOKEN` fields of the MCP configuration. Do not leave an External consent screen in Testing: its refresh tokens expire after seven days.

## Claude Desktop

Current Claude Desktop builds use extensions. Run `npm run package`, then install `build/adsense-mcp.mcpb` from Settings → Extensions → Advanced settings → Install extension. It securely prompts for the OAuth values. On installations that support classic configuration, add this instead:

```json
{
  "mcpServers": {
    "adsense": {
      "command": "node",
      "args": ["/absolute/path/to/adsense-mcp/dist/index.js"],
      "env": {
        "ADSENSE_CLIENT_ID": "...",
        "ADSENSE_CLIENT_SECRET": "...",
        "ADSENSE_REFRESH_TOKEN": "..."
      }
    }
  }
}
```

## Codex

Add the equivalent server definition to your Codex MCP configuration, using the same command, arguments, and environment variables. The server uses the standard MCP stdio transport and works in both clients.

## Tools

- `adsense_list_accounts`
- `adsense_get_account`
- `adsense_generate_report`

Example report request: `metrics: ["ESTIMATED_EARNINGS", "PAGE_VIEWS", "CLICKS"]`, `dimensions: ["DATE", "COUNTRY_NAME"]`, `dateRange: "LAST_7_DAYS"`, `orderBy: ["-ESTIMATED_EARNINGS"]`.

## Verify

```sh
npm test
npm run build
```

Live verification also requires the OAuth values above and an AdSense account. The API’s report endpoint is `GET /v2/{account}/reports:generate`; it requires the AdSense or AdSense read-only OAuth scope.
