#!/usr/bin/env node
// Checks that every place the README "Releasing" section lists carries the same version.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(join(root, file), "utf8");
const json = (file) => JSON.parse(read(file));

const pkg = json("package.json");
const lock = json("package-lock.json");
const server = json("server.json");
const manifest = json("mcpb/manifest.json");
const indexSource = read("src/index.ts");
const serverVersion = indexSource.match(/new McpServer\(\{\s*name:\s*"adsense-mcp",\s*version:\s*"([^"]+)"/)?.[1];
const npmPackages = (server.packages ?? []).filter((entry) => entry.registryType === "npm" && entry.identifier === pkg.name);

const found = [
  ["package.json version", pkg.version],
  ["package-lock.json version", lock.version],
  ['package-lock.json packages[""].version', lock.packages?.[""]?.version],
  ["server.json version", server.version],
  ...npmPackages.map((entry) => [`server.json packages[npm ${entry.identifier}].version`, entry.version]),
  ["mcpb/manifest.json version", manifest.version],
  ["src/index.ts McpServer version", serverVersion],
];

const problems = [];
if (npmPackages.length !== 1) problems.push(`server.json must have exactly one npm package entry for ${pkg.name}; found ${npmPackages.length}.`);
for (const [where, version] of found) {
  if (version === undefined) problems.push(`${where}: not found.`);
  else if (version !== pkg.version) problems.push(`${where}: ${version} (expected ${pkg.version}).`);
}

if (problems.length) {
  console.error("Version mismatch. Update every location listed in README > Releasing:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`Version ${pkg.version} matches in ${found.length} places.`);
