import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const staging = join(root, "build", "mcpb");
const pkg = JSON.parse(await import("node:fs/promises").then((fs) => fs.readFile(join(root, "package.json"), "utf8")));
if (!existsSync(join(root, "dist", "index.js"))) throw new Error("Run npm run build before packaging.");
rmSync(staging, { recursive: true, force: true });
mkdirSync(join(staging, "server"), { recursive: true });
cpSync(join(root, "dist"), join(staging, "server"), { recursive: true });
writeFileSync(join(staging, "server", "package.json"), JSON.stringify({ name: "adsense-mcp-server", version: pkg.version, type: "module", private: true, dependencies: pkg.dependencies }, null, 2));
execFileSync("npm", ["install", "--omit=dev", "--no-package-lock", "--no-audit", "--no-fund"], { cwd: join(staging, "server"), stdio: "inherit", shell: process.platform === "win32" });
cpSync(join(root, "mcpb", "manifest.json"), join(staging, "manifest.json"));
cpSync(join(root, "README.md"), join(staging, "README.md"));
execFileSync("npx", ["--yes", "@anthropic-ai/mcpb@2", "pack", staging, join(root, "build", "adsense-mcp.mcpb")], { stdio: "inherit", shell: process.platform === "win32" });
console.log("Bundle written to build/adsense-mcp.mcpb");
