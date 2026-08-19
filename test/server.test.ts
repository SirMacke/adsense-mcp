import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";

test("serves the AdSense tools over the MCP stdio protocol", async () => {
  const child = spawn(process.execPath, ["dist/index.js"], { env: { ...process.env, ADSENSE_ACCESS_TOKEN: "" }, stdio: ["pipe", "pipe", "pipe"] });
  let buffer = "";
  const replies = new Map<number, (message: any) => void>();
  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      if (message.id !== undefined) replies.get(message.id)?.(message);
    }
  });
  const send = (id: number, method: string, params: unknown) => new Promise<any>((resolve, reject) => {
    replies.set(id, resolve);
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), 5000);
  });
  try {
    const initialized = await send(1, "initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    assert.equal(initialized.result.serverInfo.name, "adsense-mcp");
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    const listed = await send(2, "tools/list", {});
    assert.deepEqual(listed.result.tools.map((tool: { name: string }) => tool.name), ["adsense_list_accounts", "adsense_get_account", "adsense_generate_report"]);
  } finally {
    child.kill();
  }
});
