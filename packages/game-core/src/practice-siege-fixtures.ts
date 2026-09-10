/**
 * Pinned Phase 1 teaching plans. Studio and unfamiliar-player checks must
 * use these exact routes. Changing a coordinate is a new fixture, not a
 * silent retune after seeing an inconvenient result.
 */
import type { PracticeSiegeRequest } from "./practice-siege.ts";

function clone<T>(value: T): T {
  return structuredClone(value);
}

/** Default Roblox teaching plan: visit towers on the approach, enter through the gate. */
export const PRACTICE_WINNING_GATE_PLAN: PracticeSiegeRequest = {
  version: 1,
  defensePlan: "guardGate",
  objectives: { vanguard: "gate", archers: "westTower", riders: "eastTower" },
  routes: {
    vanguard: [
      { x: 50, y: 5 },
      { x: 50, y: 34 },
      { x: 50, y: 88 },
    ],
    archers: [
      { x: 10, y: 5 },
      { x: 28, y: 28 },
      { x: 50, y: 34 },
      { x: 50, y: 88 },
    ],
    riders: [
      { x: 90, y: 5 },
      { x: 72, y: 28 },
      { x: 50, y: 34 },
      { x: 50, y: 88 },
    ],
  },
};

/** Same forces and defense, but nobody opens the gate and every route misses it. */
export const PRACTICE_LOSING_CLOSED_GATE_PLAN: PracticeSiegeRequest = {
  version: 1,
  defensePlan: "guardGate",
  objectives: { vanguard: "keep", archers: "westTower", riders: "eastTower" },
  routes: {
    vanguard: [
      { x: 50, y: 5 },
      { x: 20, y: 20 },
      { x: 20, y: 34 },
      { x: 20, y: 60 },
      { x: 35, y: 75 },
      { x: 50, y: 88 },
    ],
    archers: [
      { x: 10, y: 5 },
      { x: 28, y: 28 },
      { x: 28, y: 34 },
      { x: 28, y: 48 },
      { x: 40, y: 68 },
      { x: 50, y: 88 },
    ],
    riders: [
      { x: 90, y: 5 },
      { x: 72, y: 28 },
      { x: 72, y: 34 },
      { x: 72, y: 48 },
      { x: 60, y: 68 },
      { x: 50, y: 88 },
    ],
  },
};

const CAUSALITY_SHARED: PracticeSiegeRequest = {
  version: 1,
  defensePlan: "holdKeep",
  objectives: { vanguard: "gate", archers: "westTower", riders: "keep" },
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
      { x: 50, y: 5 },
      { x: 50, y: 20 },
      { x: 50, y: 34 },
      { x: 65, y: 48 },
      { x: 65, y: 68 },
      { x: 50, y: 88 },
    ],
  },
};

/** Controlled pair: only the Rider wall-crossing X changes. */
export function practiceCausalityPair(): {
  throughGate: PracticeSiegeRequest;
  intoWall: PracticeSiegeRequest;
  changedSquad: "riders";
} {
  const throughGate = clone(CAUSALITY_SHARED);
  const intoWall = clone(CAUSALITY_SHARED);
  intoWall.routes.riders = [
    { x: 40, y: 5 },
    { x: 40, y: 20 },
    { x: 40, y: 34 },
    { x: 65, y: 48 },
    { x: 65, y: 68 },
    { x: 50, y: 88 },
  ];
  return { throughGate, intoWall, changedSquad: "riders" };
}
