#!/usr/bin/env node
/**
 * Type-check gate.
 *
 * WHY THIS EXISTS. Everything in this repo runs TypeScript through
 * `node --experimental-strip-types`, which ERASES type annotations without
 * checking them. That is fast and dependency-free, and it means a genuine type
 * error runs happily until it breaks at runtime.
 *
 * It has already cost us. When the roster grew from eight units to eleven,
 * `emptyArmy()` kept returning an eight-key object literal. Nothing complained;
 * armies simply came back with undefined counts and battles computed NaN. The
 * test suite reported seven failures in unrelated-looking places. `tsc` reports
 * one line naming the three missing properties.
 *
 * SCOPE, STATED HONESTLY. This checks `packages/game-core/src` only - the pure
 * game logic, which imports nothing from Node. The server cannot be checked
 * here because it needs `@types/node`, which is not installed and cannot be
 * without a network fetch. That is a real gap, not an oversight: game-core is
 * where the contracts and the maths live, so it is where a type error does the
 * most damage, but `server/src` is currently unchecked.
 *
 * The compiler is borrowed from `mobile-rebuild/node_modules` rather than added
 * as a new dependency, so this gate costs nothing to install.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRootUrl = new URL("../", import.meta.url);
const repoRoot = fileURLToPath(repoRootUrl);
const candidates = [
  "node_modules/typescript/lib/tsc.js",
  "mobile-rebuild/node_modules/typescript/lib/tsc.js",
];

// Resolve against the REPO ROOT, not this file's directory - resolving against
// import.meta.url looks for scripts/node_modules and silently finds nothing.
const compiler = candidates.map((relative) => fileURLToPath(new URL(relative, repoRootUrl)))
  .find((path) => existsSync(path));

if (!compiler) {
  console.error("check:types SKIPPED — no TypeScript compiler found.");
  console.error("Looked in:\n  " + candidates.join("\n  "));
  console.error("");
  console.error("A skipped gate is a gate that lies, so this exits NON-ZERO rather");
  console.error("than printing a cheerful nothing. Install TypeScript, or delete");
  console.error("this gate deliberately — but do not let it pass silently.");
  process.exit(1);
}

const result = spawnSync(process.execPath, [compiler, "-p", "tsconfig.check.json"], {
  cwd: repoRoot,
  stdio: "inherit",
});

if (result.status !== 0) {
  console.error("");
  console.error("Type check FAILED. These are real errors that `--experimental-strip-types`");
  console.error("would have run anyway, so fix them here rather than discovering them in Studio.");
  process.exit(result.status ?? 1);
}

console.log("Type check passed: packages/game-core/src is type-clean.");
console.log("NOTE: server/src is NOT covered — it needs @types/node, which is not installed.");
