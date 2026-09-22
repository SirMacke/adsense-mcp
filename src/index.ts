#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { AdSenseClient, configFromEnv } from "./adsense.js";

const client = new AdSenseClient(configFromEnv());
const server = new McpServer({ name: "adsense-mcp", version: "0.2.0" });

const readOnlyToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

function response(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

const accountSchema = z.string().regex(/^accounts\/[^/]+$/);
const adClientSchema = z.string().regex(/^accounts\/[^/]+\/adclients\/[^/]+$/);
const adUnitSchema = z.string().regex(/^accounts\/[^/]+\/adclients\/[^/]+\/adunits\/[^/]+$/);
const customChannelSchema = z.string().regex(/^accounts\/[^/]+\/adclients\/[^/]+\/customchannels\/[^/]+$/);
const urlChannelSchema = z.string().regex(/^accounts\/[^/]+\/adclients\/[^/]+\/urlchannels\/[^/]+$/);
const paginationSchema = {
  pageSize: z.number().int().min(1).max(10000).optional().describe("Maximum number of resources to return."),
  pageToken: z.string().min(1).optional().describe("Token from a previous response for the next page."),
};
const reportSettingsSchema = {
  dateRange: z.string().optional().describe("Preset date range such as TODAY, YESTERDAY, LAST_7_DAYS, MONTH_TO_DATE, CUSTOM."),
  startDate: z.string().optional().describe("Custom start date in YYYY-MM-DD."),
  endDate: z.string().optional().describe("Custom end date in YYYY-MM-DD."),
  languageCode: z.string().optional(),
  currencyCode: z.string().length(3).optional(),
  reportingTimeZone: z.string().optional().describe("ACCOUNT_TIME_ZONE or GOOGLE_TIME_ZONE."),
};

server.tool("adsense_list_accounts", "List AdSense accounts available to the authenticated user.", paginationSchema, readOnlyToolAnnotations, async (args) => response(await client.listAccounts(args)));

server.tool("adsense_get_account", "Get one AdSense account by resource name, e.g. accounts/pub-123.", {
  account: accountSchema,
}, readOnlyToolAnnotations, async ({ account }) => response(await client.getAccount(account)));

server.tool("adsense_list_payments", "List paid and unpaid earnings for an AdSense account. Account is discovered automatically when omitted.", {
  account: accountSchema.optional().describe("Account resource name; optional when one account is accessible."),
}, readOnlyToolAnnotations, async ({ account }) => response(await client.listPayments(account)));

server.tool("adsense_list_child_accounts", "List accounts directly managed by an AdSense account.", {
  account: accountSchema.optional().describe("Parent account resource name; discovered automatically when omitted."),
  ...paginationSchema,
}, readOnlyToolAnnotations, async (args) => response(await client.listChildAccounts(args)));

server.tool("adsense_get_ad_blocking_recovery_tag", "Get the ad-blocking recovery tag for an AdSense account.", {
  account: accountSchema.optional().describe("Account resource name; discovered automatically when omitted."),
}, readOnlyToolAnnotations, async ({ account }) => response(await client.getAdBlockingRecoveryTag(account)));

server.tool("adsense_list_alerts", "List account alerts, including their severity, type, and localized message.", {
  account: accountSchema.optional().describe("Account resource name; discovered automatically when omitted."),
  languageCode: z.string().optional().describe("IETF BCP-47 language code for alert messages."),
}, readOnlyToolAnnotations, async (args) => response(await client.listAlerts(args)));

server.tool("adsense_list_policy_issues", "List policy issues involving an AdSense account and its AFP child accounts.", {
  account: accountSchema.optional().describe("Account resource name; discovered automatically when omitted."),
  ...paginationSchema,
}, readOnlyToolAnnotations, async (args) => response(await client.listPolicyIssues(args)));

server.tool("adsense_get_policy_issue", "Get one AdSense policy issue by resource name.", {
  name: z.string().regex(/^accounts\/[^/]+\/policyIssues\/[^/]+$/),
}, readOnlyToolAnnotations, async ({ name }) => response(await client.getPolicyIssue(name)));

server.tool("adsense_list_sites", "List sites in an AdSense account, including readiness and Auto Ads state.", {
  account: accountSchema.optional().describe("Account resource name; discovered automatically when omitted."),
  ...paginationSchema,
}, readOnlyToolAnnotations, async (args) => response(await client.listSites(args)));

server.tool("adsense_get_site", "Get one AdSense site by resource name.", {
  name: z.string().regex(/^accounts\/[^/]+\/sites\/[^/]+$/),
}, readOnlyToolAnnotations, async ({ name }) => response(await client.getSite(name)));

server.tool("adsense_list_ad_clients", "List ad clients in an AdSense account.", {
  account: accountSchema.optional().describe("Account resource name; discovered automatically when omitted."),
  ...paginationSchema,
}, readOnlyToolAnnotations, async (args) => response(await client.listAdClients(args)));

server.tool("adsense_get_ad_client", "Get one AdSense ad client by resource name.", {
  name: adClientSchema,
}, readOnlyToolAnnotations, async ({ name }) => response(await client.getAdClient(name)));

server.tool("adsense_get_ad_client_ad_code", "Get the ad code for an AdSense ad client.", {
  name: adClientSchema,
}, readOnlyToolAnnotations, async ({ name }) => response(await client.getAdClientAdCode(name)));

server.tool("adsense_list_ad_units", "List ad units under an AdSense ad client.", {
  adClient: adClientSchema.describe("Parent ad client resource name."),
  ...paginationSchema,
}, readOnlyToolAnnotations, async (args) => response(await client.listAdUnits(args)));

server.tool("adsense_get_ad_unit", "Get one AdSense ad unit by resource name.", {
  name: adUnitSchema,
}, readOnlyToolAnnotations, async ({ name }) => response(await client.getAdUnit(name)));

server.tool("adsense_get_ad_unit_ad_code", "Get the ad code for an AdSense ad unit.", {
  name: adUnitSchema,
}, readOnlyToolAnnotations, async ({ name }) => response(await client.getAdUnitAdCode(name)));

server.tool("adsense_list_linked_custom_channels", "List custom channels linked to an AdSense ad unit.", {
  adUnit: adUnitSchema.describe("Parent ad unit resource name."),
  ...paginationSchema,
}, readOnlyToolAnnotations, async (args) => response(await client.listLinkedCustomChannels(args)));

server.tool("adsense_list_url_channels", "List active URL channels under an AdSense ad client.", {
  adClient: adClientSchema.describe("Parent ad client resource name."),
  ...paginationSchema,
}, readOnlyToolAnnotations, async (args) => response(await client.listUrlChannels(args)));

server.tool("adsense_get_url_channel", "Get one AdSense URL channel by resource name.", {
  name: urlChannelSchema,
}, readOnlyToolAnnotations, async ({ name }) => response(await client.getUrlChannel(name)));

server.tool("adsense_list_custom_channels", "List custom channels under an AdSense ad client.", {
  adClient: adClientSchema.describe("Parent ad client resource name."),
  ...paginationSchema,
}, readOnlyToolAnnotations, async (args) => response(await client.listCustomChannels(args)));

server.tool("adsense_get_custom_channel", "Get one AdSense custom channel by resource name.", {
  name: customChannelSchema,
}, readOnlyToolAnnotations, async ({ name }) => response(await client.getCustomChannel(name)));

server.tool("adsense_list_linked_ad_units", "List ad units linked to an AdSense custom channel.", {
  customChannel: customChannelSchema.describe("Parent custom channel resource name."),
  ...paginationSchema,
}, readOnlyToolAnnotations, async (args) => response(await client.listLinkedAdUnits(args)));

server.tool("adsense_list_saved_reports", "List reports saved in an AdSense account.", {
  account: accountSchema.optional().describe("Account resource name; discovered automatically when omitted."),
  ...paginationSchema,
}, readOnlyToolAnnotations, async (args) => response(await client.listSavedReports(args)));

server.tool("adsense_get_saved_report", "Get one saved AdSense report's metadata by resource name.", {
  name: z.string().regex(/^accounts\/[^/]+\/reports\/[^/]+$/),
}, readOnlyToolAnnotations, async ({ name }) => response(await client.getSavedReport(name)));

server.tool("adsense_generate_saved_report", "Generate a saved AdSense report as structured JSON.", {
  name: z.string().regex(/^accounts\/[^/]+\/reports\/[^/]+$/),
  ...reportSettingsSchema,
}, readOnlyToolAnnotations, async (args) => response(await client.generateSavedReport(args)));

server.tool("adsense_generate_report", "Extract any ad-hoc AdSense report. Supply API v2 dimensions, metrics, filters, dates, sorting, and other report parameters. Account is discovered automatically when omitted.", {
  account: accountSchema.optional().describe("Account resource name; optional when one account is accessible."),
  dimensions: z.array(z.string()).optional().describe("Report dimensions, e.g. DATE, AD_UNIT_NAME, COUNTRY_NAME."),
  metrics: z.array(z.string()).min(1).describe("Required metrics, e.g. ESTIMATED_EARNINGS, PAGE_VIEWS, CLICKS."),
  filters: z.array(z.string()).optional().describe("AdSense filters, e.g. AD_CLIENT_ID==ca-pub-..."),
  orderBy: z.array(z.string()).optional().describe("Columns to sort, e.g. -ESTIMATED_EARNINGS."),
  limit: z.number().int().min(1).max(100000).optional(),
  ...reportSettingsSchema,
}, readOnlyToolAnnotations, async (args) => response(await client.generateReport(args)));

await server.connect(new StdioServerTransport());
