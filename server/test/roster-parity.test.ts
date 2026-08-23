import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { TROOP_ORDER, TROOPS } from "../../packages/game-core/src/index.ts";

/**
 * Roster parity between TypeScript and Luau, checked by reading the Luau as
 * TEXT.
 *
 * There IS already a cross-language contract test - and when the roster went
 * from eight units to eleven it did not catch a thing, because it needs Lune
 * and Lune is not on every shell's PATH, so it SKIPPED. A gate that skips is a
 * gate that lies: `npm test` stayed green while the client's troop list and the
 * server's had silently diverged by three units.
 *
 * This test has no such escape hatch. It needs nothing but the file, so it runs
 * everywhere, every time. It is deliberately dumb - text in, list out - because
 * the failure it exists to catch is a dumb one.
 */
function luauSource(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../../roblox/src/shared/${relative}`, import.meta.url)), "utf8");
}

function luauTroopOrder(): string[] {
  const source = luauSource("Buildings.luau");
  const match = /Buildings\.TROOP_ORDER\s*=\s*\{([\s\S]*?)\}/.exec(source);
  assert.ok(match, "Buildings.TROOP_ORDER not found - did the table get renamed?");
  return [...match[1].matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]);
}

test("the client's troop list is the server's troop list", () => {
  assert.deepEqual(luauTroopOrder(), [...TROOP_ORDER]);
});

test("the client can name every troop the server can send", () => {
  const source = luauSource("Buildings.luau");
  const match = /Buildings\.TROOP_NAMES\s*=\s*\{([\s\S]*?)\}/.exec(source);
  assert.ok(match, "Buildings.TROOP_NAMES not found");
  const named = new Set([...match[1].matchAll(/^\s*([A-Za-z]+)\s*=/gm)].map((m) => m[1]));

  for (const troop of TROOP_ORDER) {
    assert.ok(named.has(troop), `the client has no display name for "${troop}" - it would render blank`);
  }
});

test("every troop belongs to exactly one battle squad", () => {
  // The three squads ARE the three combat classes. A troop in no squad cannot
  // be ordered in a live battle; a troop in two would take contradictory
  // orders.
  const source = luauSource("BattleConfig.luau");
  const squads = [...source.matchAll(/troops\s*=\s*\{([^}]*)\}/g)]
    .map((m) => [...m[1].matchAll(/"([A-Za-z]+)"/g)].map((t) => t[1]));
  assert.ok(squads.length >= 3, "expected at least three squads");

  const seen = new Map<string, number>();
  for (const squad of squads) {
    for (const troop of squad) seen.set(troop, (seen.get(troop) ?? 0) + 1);
  }

  for (const troop of TROOP_ORDER) {
    const count = seen.get(troop) ?? 0;
    assert.equal(count, 1, `"${troop}" appears in ${count} squads; it must appear in exactly one`);
  }
});

test("a troop the client cannot afford to describe is still a real troop", () => {
  // Guards the reverse direction: Luau naming something game-core does not know
  // would render a button that dispatches a command the server refuses.
  for (const troop of luauTroopOrder()) {
    assert.ok(TROOPS[troop as keyof typeof TROOPS], `the client lists "${troop}", which game-core has never heard of`);
  }
});
