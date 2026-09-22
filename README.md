# AdSense MCP

An MCP server that reads payment information and extracts ad-hoc data from the [AdSense Management API v2](https://developers.google.com/adsense/management/reference/rest/v2/). It exposes an unrestricted report interface: any supported AdSense dimensions, metrics, filters, time period, sort order, timezone, language, currency, and limit can be passed through to `accounts.reports.generate`.

The server uses the read-only `https://www.googleapis.com/auth/adsense.readonly` OAuth scope. It does not write to an AdSense account.

## Install

Once published, run it from an MCP client with `npx -y @sirmacke/adsense-mcp`. Configure either `ADSENSE_ACCESS_TOKEN`, or all three of `ADSENSE_CLIENT_ID`, `ADSENSE_CLIENT_SECRET`, and `ADSENSE_REFRESH_TOKEN`.

## Security

OAuth access tokens, refresh tokens, and client secrets are credentials. Keep them out of this repository, issue trackers, shell history, and MCP configuration that is shared with others. If one is exposed, revoke it in Google Cloud immediately; see [SECURITY.md](SECURITY.md).

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
- `adsense_list_payments`
- `adsense_list_child_accounts`
- `adsense_get_ad_blocking_recovery_tag`
- `adsense_list_alerts`
- `adsense_list_policy_issues`
- `adsense_get_policy_issue`
- `adsense_list_sites`
- `adsense_get_site`
- `adsense_generate_report`

`adsense_list_payments` returns the account's paid and unpaid earnings, including each payment's formatted amount and, for paid earnings, the credited date. It does not expose bank or payment-method details.

Example report request: `metrics: ["ESTIMATED_EARNINGS", "PAGE_VIEWS", "CLICKS"]`, `dimensions: ["DATE", "COUNTRY_NAME"]`, `dateRange: "LAST_7_DAYS"`, `orderBy: ["-ESTIMATED_EARNINGS"]`.

## Verify

```sh
npm test
npm run build
```

Live verification also requires the OAuth values above and an AdSense account. The payment and report endpoints are `GET /v2/{account}/payments` and `GET /v2/{account}/reports:generate`; both accept the AdSense read-only OAuth scope.

## Releasing

Releases are published to both npm and the official MCP Registry. The registry stores discovery metadata from `server.json`; the installable server itself is distributed through npm.

1. Update the version consistently in `package.json`, `package-lock.json`, `server.json` (including its npm package entry), `mcpb/manifest.json`, and the MCP server version in `src/index.ts`.
2. Run `npm test` and `npm pack --dry-run` to verify the build and published package contents.
3. Commit and push the release to GitHub.
4. Publish the public scoped package with `npm publish --access public`.
5. Authenticate when necessary with `mcp-publisher login github`, then run `mcp-publisher publish` to publish the matching `server.json` version.

Publish npm before the MCP Registry because registry validation requires the referenced public package version to exist. Published versions are immutable, so corrections require a new version.

## License

[MIT](LICENSE)
