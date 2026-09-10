import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PRACTICE_NO_GATE_TEAM_PLAN, PRACTICE_WINNING_GATE_PLAN } from "../../packages/game-core/src/practice-siege-fixtures.ts";
import {
  PRACTICE_DEFENSE_PLANS,
  PRACTICE_ENTRY_RULE,
  PRACTICE_ENTRY_TEACHING,
  PRACTICE_OBJECTIVES,
  PRACTICE_SQUADS,
  PracticeSiegeValidationError,
  practiceSiegeLayout,
  resolvePracticeSiege,
  type PracticeSiegeLayout,
  type PracticeSiegeRequest,
} from "../../packages/game-core/src/practice-siege.ts";

const REPO_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));

type LuauContract = {
  checks: number;
  version: number;
  squads: string[];
  objectives: string[];
  defensePlans: string[];
  defaultDefense: string;
  defaultRequest: PracticeSiegeRequest;
  noGateTeamRequest: PracticeSiegeRequest;
  entryRule: string;
  entryTeaching: string;
  layout: PracticeSiegeLayout;
  targets: Array<{ id: string; position: { x: number; y: number }; radius: number }>;
  cases: Array<{ name: string; request: unknown; accepted: boolean }>;
};

let cachedContract: LuauContract | undefined;
function realLuauContract(): LuauContract {
  if (cachedContract) return cachedContract;
  // A missing/denied Lune executable fails this gate explicitly. Compile-only
  // or skipped tests cannot establish agreement between two languages.
  const stdout = execFileSync("lune", ["run", "roblox/scripts/practice-contract-check.luau", "--emit-contract"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 4 * 1024 * 1024,
  });
  cachedContract = JSON.parse(stdout.trim()) as LuauContract;
  return cachedContract;
}

test("real Luau practice vocabulary and fort geometry exactly match game-core v1", () => {
  const contract = realLuauContract();
  assert.equal(contract.version, 1);
  assert.deepEqual(contract.squads, [...PRACTICE_SQUADS]);
  assert.deepEqual(contract.objectives, [...PRACTICE_OBJECTIVES]);
  assert.deepEqual(contract.defensePlans, [...PRACTICE_DEFENSE_PLANS]);
  const layout = practiceSiegeLayout();
  assert.deepEqual(contract.layout, layout, "the drawn range, openings, wall, keep and obstacle use resolver geometry");
  for (const target of contract.targets) {
    const position = target.id === "barricade"
      ? { x: (layout.barricade.minimum.x + layout.barricade.maximum.x) / 2, y: (layout.barricade.minimum.y + layout.barricade.maximum.y) / 2 }
      : layout[target.id as "gate" | "westTower" | "eastTower" | "keep"].position;
    assert.deepEqual(target.position, position, `${target.id} tap target is on the resolved feature`);
  }
});

test("the untouched Roblox default routes resolve as an identical JSON-safe practice replay", () => {
  const contract = realLuauContract();
  assert.equal(contract.defaultDefense, "guardGate", "the one NPC plan exposed in the prototype stays the default");
  assert.equal(contract.defaultRequest.defensePlan, contract.defaultDefense);
  assert.deepEqual(contract.defaultRequest.objectives, { vanguard: "gate", archers: "westTower", riders: "eastTower" });
  const result = resolvePracticeSiege(contract.defaultRequest);
  assert.equal(result.mode, "practice");
  assert.deepEqual(result.validated, contract.defaultRequest, "the core accepts the actual Luau defaults without repairing them");
  assert.deepEqual(resolvePracticeSiege(contract.defaultRequest), result);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  assert.ok(result.phaseEvents.length > 0);
  assert.ok(result.reasons.every((reason) => typeof reason === "string" && reason.length > 0));
});

test("Roblox defaults teach gate-only entry and match the resolver rule", () => {
  const contract = realLuauContract();
  assert.equal(contract.entryRule, PRACTICE_ENTRY_RULE);
  assert.equal(contract.entryTeaching, PRACTICE_ENTRY_TEACHING);
  assert.equal(contract.layout.entryRule, PRACTICE_ENTRY_RULE);
  const result = resolvePracticeSiege(contract.defaultRequest);
  for (const squad of PRACTICE_SQUADS) {
    assert.ok(
      result.phaseEvents.some((entry) => entry.code === "enteredFort" && entry.squad === squad),
      `${squad} default route must enter through the opened gate instead of a tower`,
    );
  }
  assert.ok(result.phaseEvents.some((entry) => entry.code === "objectiveWon" && entry.feature === "gate"));
  assert.ok(result.phaseEvents.some((entry) => entry.code === "enteredFort" && entry.text.includes("open gate")));
  assert.ok(!result.phaseEvents.some((entry) => entry.code === "blockedAtWall"));
  assert.deepEqual(contract.defaultRequest, PRACTICE_WINNING_GATE_PLAN,
    "Roblox Reset must load the pinned winning teaching plan");
  assert.deepEqual(contract.noGateTeamRequest, PRACTICE_NO_GATE_TEAM_PLAN,
    "the one-tap failure lesson must match the pinned no-gate-team plan");
  const closed = resolvePracticeSiege(contract.noGateTeamRequest);
  assert.equal(closed.outcome, "defenderWin");
  assert.ok(closed.phaseEvents.some((entry) => entry.code === "objectiveSkipped" && entry.feature === "gate"));
});

test("executed Luau acceptance and rejection agree with the real resolver at every contract boundary", () => {
  const contract = realLuauContract();
  assert.ok(contract.checks >= 200, "execute malformed native Luau table and finite-number checks as well as JSON cases");
  assert.ok(contract.cases.filter((entry) => entry.accepted).length >= 25);
  assert.ok(contract.cases.filter((entry) => !entry.accepted).length >= 35);
  for (const entry of contract.cases) {
    if (entry.accepted) {
      assert.doesNotThrow(() => resolvePracticeSiege(entry.request), `${entry.name}: Luau accepted a request the world server rejects`);
    } else {
      assert.throws(() => resolvePracticeSiege(entry.request), (error: unknown) =>
        error instanceof PracticeSiegeValidationError && error.code === "INVALID_PRACTICE_SIEGE",
      `${entry.name}: Luau rejected a request the world server accepts`);
    }
  }
});
