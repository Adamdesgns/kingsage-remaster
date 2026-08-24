// The cross-language contract — the one seam nothing has ever checked.
//
// This game is written in two languages that never meet in a test. Every other
// server test builds its armies in TypeScript with emptyArmy(), and every Luau
// gate checks Luau against itself. So the actual handoff — the army table that
// shared/Buildings.luau constructs and CommandService POSTs to /api/roblox/
// commands — has never been validated against the TypeScript that receives it.
//
// A Luau troop key that game-core does not recognise (a typo, a rename on one
// side only, a stray field) would pass all 39 roblox-layer tests, all 21 Luau
// compiles and all 14 shared rules, and then fail in a live session with the
// world server refusing every attack a player made. That is precisely the class
// of defect that has already cost this project two Studio sessions.
//
// So: ask the REAL Luau what it builds, hand that answer to the REAL routes.
//
// If Lune is not on PATH the test SKIPS loudly rather than passing quietly — a
// gate that silently disappears is worse than no gate.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  emptyArmy,
  REALM_OF_POWER_ON_CAPTURE,
  settlementPoints,
  TROOP_ORDER,
  type BattlePlan,
  type BuildingLevels,
} from "../../packages/game-core/src/index.ts";
import { createWorldHttpServer } from "../src/http.ts";
import { SharedWorldStore } from "../src/store.ts";

const REPO_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const KEY = "test-secret-key-0123456789abcdef";
const ATTACKER_ID = 991101;
const DEFENDER_ID = 991102;

const PLAN: BattlePlan = {
  entry: "West Ridge",
  troops: "Balanced Army",
  time: "Dawn",
  style: "Flanking Strike",
};

/** A garrison with something of everything, so nothing is exercised by accident. */
const GARRISON = {
  spear: 220, sword: 90, axe: 45, archer: 80,
  scout: 4, lightCavalry: 30, ram: 6, noble: 5,
};

type Muster = { army: Record<string, number>; fighting: number; nobles: number };

/** Runs the real shared Luau and returns exactly what it would dispatch. */
function musterViaLuau(garrison: Record<string, number>, withNobles: boolean): Muster | null {
  try {
    const stdout = execFileSync(
      "lune",
      ["run", "roblox/scripts/muster-cli.luau", JSON.stringify(garrison), String(withNobles)],
      { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    return JSON.parse(stdout.trim()) as Muster;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw error;
  }
}

const probe = musterViaLuau({ spear: 1 }, false);
const LUNE_AVAILABLE = probe !== null;

if (!LUNE_AVAILABLE) {
  test("CROSS-LANGUAGE CONTRACT SKIPPED — Lune is not on PATH", (t) => {
    t.diagnostic("Install Lune (winget install --id Lune.Lune) and re-run.");
    t.diagnostic("Note: Lune IS installed on Adam's PC; a shell opened before");
    t.diagnostic("it joined the user PATH will not see it. Open a fresh terminal.");
    t.skip("lune not runnable from this shell");
  });
}

test("the army Luau builds names exactly the troops game-core knows — no more, no less", { skip: !LUNE_AVAILABLE }, () => {
  const raid = musterViaLuau(GARRISON, false)!;
  const conquest = musterViaLuau(GARRISON, true)!;

  const expected = [...TROOP_ORDER].sort();
  for (const [label, muster] of [["raid", raid], ["conquest", conquest]] as const) {
    const keys = Object.keys(muster.army).sort();
    assert.deepEqual(keys, expected,
      `${label}: Luau's army keys must match game-core's TroopType set exactly`);
    for (const troop of TROOP_ORDER) {
      assert.equal(typeof muster.army[troop], "number", `${label}: ${troop} is a number`);
      assert.ok(Number.isInteger(muster.army[troop]), `${label}: ${troop} is a whole number`);
      assert.ok(muster.army[troop] >= 0, `${label}: ${troop} is not negative`);
    }
  }

  // The declaration is the ONLY difference between the two armies.
  assert.equal(raid.army.noble, 0, "a raid leaves the Noblemen at home");
  assert.equal(conquest.army.noble, GARRISON.noble, "a conquest takes every Nobleman");
  assert.equal(raid.army.scout, 0, "scouts never march on an attack");
  assert.equal(conquest.army.scout, 0, "not even on a conquest");
  for (const troop of TROOP_ORDER) {
    if (troop === "noble") continue;
    assert.equal(raid.army[troop], conquest.army[troop],
      `declaring a conquest must not change how many ${troop} march`);
  }
});

test("the world server ACCEPTS the army Luau builds, and it lands as a conquest", { skip: !LUNE_AVAILABLE }, async () => {
  const directory = mkdtempSync(join(tmpdir(), "kingsage-contract-"));
  let now = new Date("2026-08-22T09:00:00.000Z");
  const store = new SharedWorldStore(join(directory, "world.sqlite"), {
    now: () => now,
    marchDurationMs: 60,
    returnDurationMs: 60,
    autoResolveMs: 200,
  });
  const app = createWorldHttpServer({ store, robloxKey: KEY });
  await new Promise<void>((done) => app.server.listen(0, "127.0.0.1", done));
  const port = (app.server.address() as { port: number }).port;
  const post = (path: string, body: unknown) => fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-kingsage-key": KEY },
    body: JSON.stringify(body),
  });
  const state = async (id: number) =>
    (await (await post("/api/roblox/state", { robloxUserIds: [id] })).json()).states[String(id)];

  try {
    await post("/api/roblox/session", { robloxUserId: ATTACKER_ID, displayName: "Attacker" });
    const defender = await (await post("/api/roblox/session", { robloxUserId: DEFENDER_ID, displayName: "Defender" })).json();
    const opening = await state(ATTACKER_ID);
    const home = opening.world.villages.find((v: any) => v.kingdomId === opening.kingdom.id && v.isCapital);
    const target = opening.world.villages.find((v: any) => v.kingdomId === defender.kingdomId);
    assert.ok(home && target, "both kingdoms hold a village");

    // Pose the world, then read the attacker's garrison back out — the army we
    // send must be built from what the SNAPSHOT says, exactly as the war table
    // would, not from the literal we posed with.
    store.db.prepare("UPDATE local_villages SET army_json = ?, state_version = state_version + 1 WHERE id = ?")
      .run(JSON.stringify({ ...emptyArmy(), ...GARRISON }), home.id);
    // Realm of Power: seed already at 1 so one surviving Count finishes the
    // campaign. Maximum is the settlement's own point score; one Count acts
    // per attack and never removes more than 50% of that maximum, so an
    // untouched hold always takes two waves. This test is the Luau→HTTP
    // contract, not the curve — the target is posed already on the last step.
    store.db.prepare("UPDATE local_villages SET army_json = ?, realm_of_power = 1, realm_of_power_at = ?, state_version = state_version + 1 WHERE id = ?")
      .run(JSON.stringify({ ...emptyArmy(), spear: 8 }), now.toISOString(), target.id);

    const beforeScout = await state(ATTACKER_ID);
    const scoutResponse = await post("/api/roblox/commands", {
      robloxUserId: ATTACKER_ID, commandId: "x-scout", expectedWorldVersion: beforeScout.world.version,
      command: { type: "march.launch", payload: { fromVillageId: home.id, targetVillageId: target.id, kind: "scout", army: { ...emptyArmy(), scout: 1 } } },
    });
    assert.equal((await scoutResponse.json()).type, "command.accepted", "the scouts got away");
    now = new Date(now.getTime() + 300);
    const scouted = await state(ATTACKER_ID);
    assert.ok(scouted.scoutReports.length > 0, "the scouts reported back");

    // THE SEAM: the garrison comes from the live snapshot, the army is built by
    // the real shared Luau, and nothing in TypeScript touches it in between.
    const snapshotHome = scouted.world.villages.find((v: any) => v.id === home.id);
    const muster = musterViaLuau(snapshotHome.army, true)!;
    assert.ok(muster.nobles > 0, "the Luau muster is carrying Noblemen");

    const attack = await post("/api/roblox/commands", {
      robloxUserId: ATTACKER_ID, commandId: "x-attack", expectedWorldVersion: scouted.world.version,
      command: { type: "march.launch", payload: { fromVillageId: home.id, targetVillageId: target.id, kind: "attack", army: muster.army, plan: PLAN } },
    });
    const attackBody = await attack.json();
    assert.equal(attackBody.type, "command.accepted",
      `the world server accepted an army built entirely by Luau (${JSON.stringify(attackBody)})`);

    now = new Date(now.getTime() + 600);
    await state(ATTACKER_ID);

    const after = store.db.prepare("SELECT kingdom_id, realm_of_power, buildings_json FROM local_villages WHERE id = ?").get(target.id) as {
      kingdom_id: string;
      realm_of_power: number;
      buildings_json: string;
    };
    // Maximum is read AFTER the fight: rams can raze the wall first, and
    // applyConquest scores the settlement from the buildings that remain.
    const capturedMax = settlementPoints(JSON.parse(String(after.buildings_json)) as BuildingLevels);
    assert.equal(String(after.kingdom_id), opening.kingdom.id,
      "the village changed hands — a Luau-built army completed a conquest end to end");
    assert.equal(
      Number(after.realm_of_power),
      Math.max(1, Math.round(capturedMax * REALM_OF_POWER_ON_CAPTURE)),
      "and reset to a fragile 30% of the settlement's own maximum",
    );
  } finally {
    await app.close();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
