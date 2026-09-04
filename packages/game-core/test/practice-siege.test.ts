import assert from "node:assert/strict";
import test from "node:test";

import {
  PracticeSiegeValidationError,
  practiceSiegeLayout,
  resolvePracticeSiege,
  type PracticeSiegeRequest,
} from "../src/practice-siege.ts";

function baseRequest(defensePlan: PracticeSiegeRequest["defensePlan"] = "towerCrossfire"): PracticeSiegeRequest {
  return {
    version: 1,
    defensePlan,
    objectives: {
      vanguard: "gate",
      archers: "westTower",
      riders: "eastTower",
    },
    routes: {
      vanguard: [
        { x: 50, y: 5 },
        { x: 50, y: 28 },
        { x: 50, y: 34 },
        { x: 35, y: 48 },
        { x: 35, y: 68 },
        { x: 50, y: 88 },
      ],
      archers: [
        { x: 10, y: 5 },
        { x: 20, y: 20 },
        { x: 28, y: 31 },
        { x: 50, y: 34 },
        { x: 30, y: 68 },
        { x: 50, y: 88 },
      ],
      riders: [
        { x: 90, y: 5 },
        { x: 80, y: 20 },
        { x: 72, y: 31 },
        { x: 50, y: 34 },
        { x: 70, y: 68 },
        { x: 50, y: 88 },
      ],
    },
  };
}

test("the same practice plan always gives the same JSON-safe result", () => {
  const request = baseRequest();
  const first = resolvePracticeSiege(request);
  const second = resolvePracticeSiege(request);

  assert.deepEqual(first, second);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
  assert.equal(first.mode, "practice");
  assert.equal(first.outcome, "attackerWin");
  assert.deepEqual(new Set(first.phaseEvents.map((entry) => entry.phase)), new Set(["approach", "wall", "courtyard", "keep"]));
  assert.ok(first.reasons.every((reason) => typeof reason === "string" && reason.length > 0));

  request.routes.vanguard[0].x = 0;
  request.objectives.vanguard = "keep";
  assert.equal(first.validated.routes.vanguard[0].x, 50, "result must snapshot caller-owned points");
  assert.equal(first.validated.objectives.vanguard, "gate", "result must snapshot caller-owned objectives");
});

test("tower range measures the drawn path, not how many route points it has", () => {
  const direct = baseRequest();
  const exposed = baseRequest();
  exposed.routes.vanguard = [
    { x: 28, y: 5 },
    { x: 10, y: 18 },
    { x: 46, y: 23 },
    { x: 10, y: 28 },
    { x: 50, y: 34 },
    { x: 50, y: 88 },
  ];

  const directResult = resolvePracticeSiege(direct);
  const exposedResult = resolvePracticeSiege(exposed);

  assert.equal(direct.routes.vanguard.length, exposed.routes.vanguard.length);
  assert.ok(exposedResult.attackerCasualties.vanguard > directResult.attackerCasualties.vanguard);
  assert.ok(exposedResult.phaseEvents.some((entry) =>
    entry.phase === "approach" && entry.squad === "vanguard" && entry.text.includes("route steps")));
});

test("a wall crossing works only where the attackers made an opening", () => {
  const throughGate = baseRequest("holdKeep");
  throughGate.objectives.riders = "keep";
  throughGate.routes.riders = [
    { x: 50, y: 5 },
    { x: 50, y: 20 },
    { x: 50, y: 34 },
    { x: 65, y: 48 },
    { x: 65, y: 68 },
    { x: 50, y: 88 },
  ];
  const intoWall = structuredClone(throughGate);
  intoWall.routes.riders[0].x = 40;
  intoWall.routes.riders[1].x = 40;
  intoWall.routes.riders[2].x = 40;

  const openResult = resolvePracticeSiege(throughGate);
  const wallResult = resolvePracticeSiege(intoWall);

  assert.ok(openResult.phaseEvents.some((entry) => entry.code === "enteredFort" && entry.squad === "riders"));
  assert.ok(wallResult.phaseEvents.some((entry) => entry.code === "blockedAtWall" && entry.squad === "riders"));
  assert.ok(wallResult.attackerCasualties.riders > openResult.attackerCasualties.riders);
  assert.equal(openResult.outcome, "attackerWin");
  assert.equal(wallResult.outcome, "defenderWin");
});

test("crossing the barricade costs riders while a route around it does not", () => {
  const crossing = baseRequest();
  crossing.objectives.riders = "keep";
  crossing.routes.riders = [
    { x: 50, y: 5 },
    { x: 50, y: 34 },
    { x: 50, y: 48 },
    { x: 50, y: 60 },
    { x: 50, y: 75 },
    { x: 50, y: 88 },
  ];
  const around = structuredClone(crossing);
  around.routes.riders = [
    { x: 50, y: 5 },
    { x: 50, y: 34 },
    { x: 65, y: 48 },
    { x: 65, y: 65 },
    { x: 55, y: 75 },
    { x: 50, y: 88 },
  ];

  const crossingResult = resolvePracticeSiege(crossing);
  const aroundResult = resolvePracticeSiege(around);

  assert.ok(crossingResult.phaseEvents.some((entry) => entry.code === "barricadeHit" && entry.squad === "riders"));
  assert.ok(aroundResult.phaseEvents.some((entry) => entry.code === "barricadeAvoided" && entry.squad === "riders"));
  assert.ok(crossingResult.attackerCasualties.riders > aroundResult.attackerCasualties.riders);
});

test("clearing a tower stops its later fire along the same route", () => {
  const clearTower = baseRequest();
  const ignoreTower = structuredClone(clearTower);
  ignoreTower.objectives.archers = "keep";

  const clearResult = resolvePracticeSiege(clearTower);
  const ignoreResult = resolvePracticeSiege(ignoreTower);

  assert.ok(clearResult.phaseEvents.some((entry) =>
    entry.code === "objectiveWon" && entry.feature === "westTower" && entry.text.includes("stopped its fire")));
  assert.ok(clearResult.attackerCasualties.archers < ignoreResult.attackerCasualties.archers);
});

test("clearing the barricade helps every route that crosses it", () => {
  const ignored = baseRequest();
  ignored.routes.vanguard = [
    { x: 50, y: 5 },
    { x: 50, y: 34 },
    { x: 50, y: 48 },
    { x: 50, y: 57 },
    { x: 50, y: 72 },
    { x: 50, y: 88 },
  ];
  const cleared = structuredClone(ignored);
  cleared.objectives.riders = "barricade";
  cleared.routes.riders = [
    { x: 50, y: 5 },
    { x: 50, y: 25 },
    { x: 50, y: 34 },
    { x: 50, y: 48 },
    { x: 50, y: 57 },
    { x: 50, y: 88 },
  ];

  const ignoredResult = resolvePracticeSiege(ignored);
  const clearedResult = resolvePracticeSiege(cleared);

  assert.ok(ignoredResult.phaseEvents.some((entry) => entry.code === "barricadeHit" && entry.squad === "vanguard"));
  assert.ok(clearedResult.phaseEvents.some((entry) => entry.code === "objectiveWon" && entry.feature === "barricade"));
  assert.ok(!clearedResult.phaseEvents.some((entry) => entry.code === "barricadeHit"));
});

test("the layout is normalized and each caller gets its own copy", () => {
  const first = practiceSiegeLayout();
  const second = practiceSiegeLayout();
  assert.equal(first.size, 100);
  assert.equal(first.gate.position.x, 50);
  assert.equal(first.westTower.breachHalfWidth, 5);
  assert.equal(first.eastTower.breachHalfWidth, 5);
  first.gate.position.x = 1;
  first.westTower.breachHalfWidth = 99;
  assert.equal(second.gate.position.x, 50);
  assert.equal(second.westTower.breachHalfWidth, 5);
  assert.equal(practiceSiegeLayout().gate.position.x, 50);
  assert.equal(practiceSiegeLayout().westTower.breachHalfWidth, 5);
});

test("the saved defense priority changes the same attack", () => {
  const crossfire = resolvePracticeSiege(baseRequest("towerCrossfire"));
  const keepReserve = resolvePracticeSiege(baseRequest("holdKeep"));

  assert.ok(crossfire.fixedForces.defender.westTower > keepReserve.fixedForces.defender.westTower);
  assert.ok(crossfire.attackerCasualties.total > keepReserve.attackerCasualties.total);
  assert.ok(keepReserve.fixedForces.defender.keep > crossfire.fixedForces.defender.keep);
});

test("bad routes and unknown saved plans are rejected before simulation", () => {
  const cases: Array<{ name: string; mutate: (request: any) => void; path: string }> = [
    { name: "wrong version", mutate: (request) => { request.version = 2; }, path: "version" },
    { name: "unknown plan", mutate: (request) => { request.defensePlan = "surprise"; }, path: "defensePlan" },
    { name: "extra request key", mutate: (request) => { request.reward = 100; }, path: "request" },
    { name: "more than six points", mutate: (request) => { request.routes.vanguard.push({ x: 50, y: 90 }); }, path: "routes.vanguard" },
    { name: "outside map", mutate: (request) => { request.routes.vanguard[0].x = -1; }, path: "routes.vanguard[0]" },
    { name: "not finite", mutate: (request) => { request.routes.vanguard[0].x = Number.NaN; }, path: "routes.vanguard[0]" },
    { name: "decimal grid point", mutate: (request) => { request.routes.vanguard[0].x = 50.5; }, path: "routes.vanguard[0]" },
    { name: "starts inside fort", mutate: (request) => { request.routes.vanguard[0].y = 20; }, path: "routes.vanguard[0]" },
    { name: "turns backward", mutate: (request) => { request.routes.vanguard[3].y = 30; }, path: "routes.vanguard[3]" },
    { name: "misses objective", mutate: (request) => { request.objectives.vanguard = "westTower"; }, path: "routes.vanguard" },
    { name: "misses keep", mutate: (request) => { request.routes.vanguard[5] = { x: 20, y: 70 }; }, path: "routes.vanguard" },
  ];

  for (const entry of cases) {
    const request: any = baseRequest();
    entry.mutate(request);
    assert.throws(
      () => resolvePracticeSiege(request),
      (error: unknown) => error instanceof PracticeSiegeValidationError
        && error.code === "INVALID_PRACTICE_SIEGE"
        && error.path === entry.path,
      entry.name,
    );
  }
});
