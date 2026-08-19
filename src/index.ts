#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { AdSenseClient, configFromEnv } from "./adsense.js";

const client = new AdSenseClient(configFromEnv());
const server = new McpServer({ name: "adsense-mcp", version: "0.1.1" });

function response(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

server.tool("adsense_list_accounts", "List AdSense accounts available to the authenticated user.", {}, async () => response(await client.listAccounts()));

server.tool("adsense_get_account", "Get one AdSense account by resource name, e.g. accounts/pub-123.", {
  account: z.string().regex(/^accounts\//),
}, async ({ account }) => response(await client.getAccount(account)));

server.tool("adsense_generate_report", "Extract any ad-hoc AdSense report. Supply API v2 dimensions, metrics, filters, dates, sorting, and other report parameters. Account is discovered automatically when omitted.", {
  account: z.string().regex(/^accounts\//).optional().describe("Account resource name; optional when one account is accessible."),
  dimensions: z.array(z.string()).optional().describe("Report dimensions, e.g. DATE, AD_UNIT_NAME, COUNTRY_NAME."),
  metrics: z.array(z.string()).min(1).describe("Required metrics, e.g. ESTIMATED_EARNINGS, PAGE_VIEWS, CLICKS."),
  filters: z.array(z.string()).optional().describe("AdSense filters, e.g. AD_CLIENT_ID==ca-pub-..."),
  dateRange: z.string().optional().describe("Preset date range such as TODAY, YESTERDAY, LAST_7_DAYS, MONTH_TO_DATE, CUSTOM."),
  startDate: z.string().optional().describe("Custom start date in YYYY-MM-DD."),
  endDate: z.string().optional().describe("Custom end date in YYYY-MM-DD."),
  orderBy: z.array(z.string()).optional().describe("Columns to sort, e.g. -ESTIMATED_EARNINGS."),
  languageCode: z.string().optional(),
  currencyCode: z.string().length(3).optional(),
  limit: z.number().int().min(1).max(100000).optional(),
  reportingTimeZone: z.string().optional().describe("ACCOUNT_TIME_ZONE or GOOGLE_TIME_ZONE."),
}, async (args) => response(await client.generateReport(args)));

await server.connect(new StdioServerTransport());
