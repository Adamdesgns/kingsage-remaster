/**
 * A small, deterministic practice siege.
 *
 * This is deliberately separate from the persistent-world battle engine. It
 * has fixed practice forces, creates no rewards, reads no clock, and stores
 * nothing. The caller can safely serialize both its request and result.
 */

export const PRACTICE_SQUADS = ["vanguard", "archers", "riders"] as const;
export type PracticeSquadId = (typeof PRACTICE_SQUADS)[number];

export const PRACTICE_OBJECTIVES = ["gate", "westTower", "eastTower", "barricade", "keep"] as const;
export type PracticeObjectiveId = (typeof PRACTICE_OBJECTIVES)[number];

export const PRACTICE_DEFENSE_PLANS = ["guardGate", "towerCrossfire", "holdKeep"] as const;
export type PracticeDefensePlanId = (typeof PRACTICE_DEFENSE_PLANS)[number];

/** Phase 1 entry rule: towers stop fire; they do not punch a hole in the wall. */
export const PRACTICE_ENTRY_RULE = "openGateOnly" as const;
export type PracticeEntryRule = typeof PRACTICE_ENTRY_RULE;
export const PRACTICE_ENTRY_TEACHING =
  "Clearing a tower stops its arrows. Only an opened gate lets anyone inside.";

export type PracticePoint = { x: number; y: number };
export type PracticeRoute = PracticePoint[];

export type PracticeSiegeRequest = {
  version: 1;
  routes: Record<PracticeSquadId, PracticeRoute>;
  objectives: Record<PracticeSquadId, PracticeObjectiveId>;
  defensePlan: PracticeDefensePlanId;
};

export type PracticeSiegePhase = "approach" | "wall" | "courtyard" | "keep";
export type PracticeSiegeFeature = PracticeObjectiveId;

export type PracticeSiegeEventCode =
  | "towerFire"
  | "outsideTowerRange"
  | "objectiveWon"
  | "objectiveHeld"
  | "objectiveSkipped"
  | "enteredFort"
  | "blockedAtWall"
  | "barricadeHit"
  | "barricadeAvoided"
  | "siegeWon"
  | "siegeLost";

export type PracticeSiegePhaseEvent = {
  phase: PracticeSiegePhase;
  code: PracticeSiegeEventCode;
  squad: PracticeSquadId | null;
  feature: PracticeSiegeFeature | null;
  position: PracticePoint | null;
  casualties: number;
  text: string;
};

export type PracticeAttackerCounts = Record<PracticeSquadId, number> & { total: number };
export type PracticeDefenderCounts = {
  gate: number;
  westTower: number;
  eastTower: number;
  barricade: number;
  keep: number;
  total: number;
};

export type PracticeSiegeResult = {
  mode: "practice";
  validated: PracticeSiegeRequest;
  fixedForces: {
    attacker: Record<PracticeSquadId, number>;
    defender: Omit<PracticeDefenderCounts, "total">;
  };
  phaseEvents: PracticeSiegePhaseEvent[];
  outcome: "attackerWin" | "defenderWin";
  /** One sentence naming the decisive cause, so a player never has to infer it from ten events. */
  headline: string;
  attackerCasualties: PracticeAttackerCounts;
  attackerSurvivors: PracticeAttackerCounts;
  defenderCasualties: PracticeDefenderCounts;
  reasons: string[];
};

export type PracticeSiegeLayout = {
  size: 100;
  deploymentMaxY: number;
  frontWallY: number;
  entryRule: PracticeEntryRule;
  gate: { position: PracticePoint; openingHalfWidth: number };
  westTower: { position: PracticePoint; range: number };
  eastTower: { position: PracticePoint; range: number };
  barricade: { minimum: PracticePoint; maximum: PracticePoint };
  keep: { position: PracticePoint; finishRadius: number };
};

export class PracticeSiegeValidationError extends Error {
  readonly code = "INVALID_PRACTICE_SIEGE";
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "PracticeSiegeValidationError";
    this.path = path;
  }
}

const LAYOUT: PracticeSiegeLayout = {
  size: 100,
  deploymentMaxY: 12,
  frontWallY: 34,
  entryRule: PRACTICE_ENTRY_RULE,
  gate: { position: { x: 50, y: 34 }, openingHalfWidth: 6 },
  westTower: { position: { x: 28, y: 34 }, range: 24 },
  eastTower: { position: { x: 72, y: 34 }, range: 24 },
  barricade: { minimum: { x: 43, y: 54 }, maximum: { x: 57, y: 60 } },
  keep: { position: { x: 50, y: 88 }, finishRadius: 8 },
};

const OBJECTIVE_CONTACT_RADIUS: Record<PracticeObjectiveId, number> = {
  gate: 7,
  westTower: 7,
  eastTower: 7,
  barricade: 6,
  keep: LAYOUT.keep.finishRadius,
};

const ATTACKER_FORCE: Record<PracticeSquadId, number> = {
  vanguard: 18,
  archers: 14,
  riders: 10,
};

type DefensePlan = Omit<PracticeDefenderCounts, "total">;

const DEFENSE_PLANS: Record<PracticeDefensePlanId, DefensePlan> = {
  guardGate: { gate: 17, westTower: 5, eastTower: 5, barricade: 6, keep: 10 },
  towerCrossfire: { gate: 12, westTower: 8, eastTower: 8, barricade: 5, keep: 8 },
  holdKeep: { gate: 12, westTower: 5, eastTower: 5, barricade: 5, keep: 16 },
};

const TOWER_VULNERABILITY: Record<PracticeSquadId, number> = {
  vanguard: 0.14,
  archers: 0.11,
  riders: 0.08,
};

const SQUAD_ROUTE_SPEED: Record<PracticeSquadId, number> = {
  vanguard: 1,
  archers: 1,
  riders: 1.35,
};

const GATE_ATTACK: Record<PracticeSquadId, number> = {
  vanguard: 1.4,
  archers: 0.65,
  riders: 0.9,
};

const TOWER_ATTACK: Record<PracticeSquadId, number> = {
  vanguard: 0.75,
  archers: 1.25,
  riders: 1,
};

const BARRICADE_ATTACK: Record<PracticeSquadId, number> = {
  vanguard: 1.2,
  archers: 0.55,
  riders: 0.8,
};

const BARRICADE_LOSS: Record<PracticeSquadId, number> = {
  vanguard: 0.22,
  archers: 0.25,
  riders: 0.38,
};

const KEEP_ATTACK: Record<PracticeSquadId, number> = {
  vanguard: 1,
  archers: 0.85,
  riders: 1.2,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], path: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new PracticeSiegeValidationError(path, `expected only ${wanted.join(", ")}`);
  }
}

function objectivePosition(objective: PracticeObjectiveId): PracticePoint {
  if (objective === "barricade") {
    return {
      x: (LAYOUT.barricade.minimum.x + LAYOUT.barricade.maximum.x) / 2,
      y: (LAYOUT.barricade.minimum.y + LAYOUT.barricade.maximum.y) / 2,
    };
  }
  if (objective === "keep") return LAYOUT.keep.position;
  return LAYOUT[objective].position;
}

function distance(a: PracticePoint, b: PracticePoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointToSegmentDistance(point: PracticePoint, a: PracticePoint, b: PracticePoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return distance(point, a);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return distance(point, { x: a.x + dx * t, y: a.y + dy * t });
}

function distanceToRoute(point: PracticePoint, route: PracticeRoute): number {
  let closest = Number.POSITIVE_INFINITY;
  for (let index = 1; index < route.length; index += 1) {
    closest = Math.min(closest, pointToSegmentDistance(point, route[index - 1], route[index]));
  }
  return closest;
}

function validatePoint(value: unknown, path: string): PracticePoint {
  if (!isRecord(value)) throw new PracticeSiegeValidationError(path, "expected an {x, y} point");
  exactKeys(value, ["x", "y"], path);
  const { x, y } = value;
  if (typeof x !== "number" || !Number.isFinite(x) || typeof y !== "number" || !Number.isFinite(y)) {
    throw new PracticeSiegeValidationError(path, "x and y must be finite numbers");
  }
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    throw new PracticeSiegeValidationError(path, "x and y must be whole grid numbers");
  }
  if (x < 0 || x > LAYOUT.size || y < 0 || y > LAYOUT.size) {
    throw new PracticeSiegeValidationError(path, "x and y must stay between 0 and 100");
  }
  return { x: Object.is(x, -0) ? 0 : x, y: Object.is(y, -0) ? 0 : y };
}

function validateRoute(value: unknown, squad: PracticeSquadId, objective: PracticeObjectiveId): PracticeRoute {
  const path = `routes.${squad}`;
  if (!Array.isArray(value)) throw new PracticeSiegeValidationError(path, "expected a list of route points");
  if (value.length < 2 || value.length > 6) {
    throw new PracticeSiegeValidationError(path, "a route needs 2 to 6 points");
  }
  const route = value.map((point, index) => validatePoint(point, `${path}[${index}]`));
  if (route[0].y > LAYOUT.deploymentMaxY) {
    throw new PracticeSiegeValidationError(`${path}[0]`, "start in the deployment area at y 12 or lower");
  }
  for (let index = 1; index < route.length; index += 1) {
    const previous = route[index - 1];
    const current = route[index];
    if (current.y < previous.y) {
      throw new PracticeSiegeValidationError(`${path}[${index}]`, "routes cannot turn back toward the deployment area");
    }
    if (current.x === previous.x && current.y === previous.y) {
      throw new PracticeSiegeValidationError(`${path}[${index}]`, "two neighboring route points cannot be the same");
    }
  }
  if (distance(route[route.length - 1], LAYOUT.keep.position) > LAYOUT.keep.finishRadius) {
    throw new PracticeSiegeValidationError(path, "finish at the keep doors");
  }
  if (distanceToRoute(objectivePosition(objective), route) > OBJECTIVE_CONTACT_RADIUS[objective]) {
    throw new PracticeSiegeValidationError(path, `the route must reach its ${featureName(objective)} objective`);
  }
  return route;
}

function validateRequest(value: unknown): PracticeSiegeRequest {
  if (!isRecord(value)) throw new PracticeSiegeValidationError("request", "expected an object");
  exactKeys(value, ["version", "routes", "objectives", "defensePlan"], "request");
  if (value.version !== 1) throw new PracticeSiegeValidationError("version", "expected version 1");
  if (!isRecord(value.routes)) throw new PracticeSiegeValidationError("routes", "expected all three squad routes");
  if (!isRecord(value.objectives)) throw new PracticeSiegeValidationError("objectives", "expected all three squad objectives");
  exactKeys(value.routes, PRACTICE_SQUADS, "routes");
  exactKeys(value.objectives, PRACTICE_SQUADS, "objectives");
  if (typeof value.defensePlan !== "string" || !PRACTICE_DEFENSE_PLANS.includes(value.defensePlan as PracticeDefensePlanId)) {
    throw new PracticeSiegeValidationError("defensePlan", `choose ${PRACTICE_DEFENSE_PLANS.join(", ")}`);
  }

  const objectives = {} as Record<PracticeSquadId, PracticeObjectiveId>;
  for (const squad of PRACTICE_SQUADS) {
    const objective = value.objectives[squad];
    if (typeof objective !== "string" || !PRACTICE_OBJECTIVES.includes(objective as PracticeObjectiveId)) {
      throw new PracticeSiegeValidationError(`objectives.${squad}`, `choose ${PRACTICE_OBJECTIVES.join(", ")}`);
    }
    objectives[squad] = objective as PracticeObjectiveId;
  }

  const routes = {} as Record<PracticeSquadId, PracticeRoute>;
  for (const squad of PRACTICE_SQUADS) routes[squad] = validateRoute(value.routes[squad], squad, objectives[squad]);
  return { version: 1, routes, objectives, defensePlan: value.defensePlan as PracticeDefensePlanId };
}

function segmentLengthInsideCircle(a: PracticePoint, b: PracticePoint, center: PracticePoint, radius: number): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const segmentLengthSquared = dx * dx + dy * dy;
  if (segmentLengthSquared === 0) return 0;
  const fx = a.x - center.x;
  const fy = a.y - center.y;
  const bTerm = 2 * (fx * dx + fy * dy);
  const cTerm = fx * fx + fy * fy - radius * radius;
  const discriminant = bTerm * bTerm - 4 * segmentLengthSquared * cTerm;
  if (discriminant < 0) return cTerm <= 0 ? Math.sqrt(segmentLengthSquared) : 0;
  const root = Math.sqrt(discriminant);
  const first = (-bTerm - root) / (2 * segmentLengthSquared);
  const second = (-bTerm + root) / (2 * segmentLengthSquared);
  const low = Math.max(0, Math.min(first, second));
  const high = Math.min(1, Math.max(first, second));
  return high > low ? (high - low) * Math.sqrt(segmentLengthSquared) : 0;
}

function towerExposureBeforeWall(
  route: PracticeRoute,
  center: PracticePoint,
  radius: number,
  travelLimit = Number.POSITIVE_INFINITY,
): number {
  let exposure = 0;
  let distanceTraveled = 0;
  for (let index = 1; index < route.length; index += 1) {
    const a = route[index - 1];
    const b = route[index];
    if (a.y >= LAYOUT.frontWallY) break;
    let end = b;
    if (b.y > LAYOUT.frontWallY) {
      const t = (LAYOUT.frontWallY - a.y) / (b.y - a.y);
      end = { x: a.x + (b.x - a.x) * t, y: LAYOUT.frontWallY };
    }
    const availableLength = distance(a, end);
    const remainingLength = travelLimit - distanceTraveled;
    if (remainingLength <= 0) break;
    if (availableLength > remainingLength) {
      const t = remainingLength / availableLength;
      end = { x: a.x + (end.x - a.x) * t, y: a.y + (end.y - a.y) * t };
    }
    exposure += segmentLengthInsideCircle(a, end, center, radius);
    distanceTraveled += distance(a, end);
    if (b.y >= LAYOUT.frontWallY || distanceTraveled >= travelLimit) break;
  }
  return exposure;
}

function distanceUntilCircle(route: PracticeRoute, center: PracticePoint, radius: number): number {
  let traveled = 0;
  for (let index = 1; index < route.length; index += 1) {
    const a = route[index - 1];
    const b = route[index];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const segmentLength = Math.hypot(dx, dy);
    if (segmentLength === 0) continue;
    if (distance(a, center) <= radius) return traveled;
    const fx = a.x - center.x;
    const fy = a.y - center.y;
    const aTerm = dx * dx + dy * dy;
    const bTerm = 2 * (fx * dx + fy * dy);
    const cTerm = fx * fx + fy * fy - radius * radius;
    const discriminant = bTerm * bTerm - 4 * aTerm * cTerm;
    if (discriminant >= 0) {
      const root = Math.sqrt(discriminant);
      const first = (-bTerm - root) / (2 * aTerm);
      const second = (-bTerm + root) / (2 * aTerm);
      const entry = Math.min(first, second);
      const exit = Math.max(first, second);
      if (exit >= 0 && entry <= 1) return traveled + Math.max(0, entry) * segmentLength;
    }
    traveled += segmentLength;
  }
  return Number.POSITIVE_INFINITY;
}

function wallCrossingX(route: PracticeRoute): number {
  for (let index = 1; index < route.length; index += 1) {
    const a = route[index - 1];
    const b = route[index];
    if (a.y <= LAYOUT.frontWallY && b.y >= LAYOUT.frontWallY && b.y > a.y) {
      const t = (LAYOUT.frontWallY - a.y) / (b.y - a.y);
      return a.x + (b.x - a.x) * t;
    }
  }
  throw new PracticeSiegeValidationError("routes", "every route must cross the front wall");
}

function segmentLengthInsideRectangle(
  a: PracticePoint,
  b: PracticePoint,
  minimum: PracticePoint,
  maximum: PracticePoint,
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return 0;
  let low = 0;
  let high = 1;
  const clips: Array<[number, number]> = [
    [-dx, a.x - minimum.x],
    [dx, maximum.x - a.x],
    [-dy, a.y - minimum.y],
    [dy, maximum.y - a.y],
  ];
  for (const [p, q] of clips) {
    if (p === 0) {
      if (q < 0) return 0;
      continue;
    }
    const t = q / p;
    if (p < 0) low = Math.max(low, t);
    else high = Math.min(high, t);
    if (low > high) return 0;
  }
  return Math.max(0, high - low) * length;
}

function routeLengthInsideBarricade(route: PracticeRoute): number {
  let length = 0;
  for (let index = 1; index < route.length; index += 1) {
    length += segmentLengthInsideRectangle(
      route[index - 1],
      route[index],
      LAYOUT.barricade.minimum,
      LAYOUT.barricade.maximum,
    );
  }
  return length;
}

function featureName(feature: PracticeSiegeFeature): string {
  const names: Record<PracticeSiegeFeature, string> = {
    gate: "gate",
    westTower: "west tower",
    eastTower: "east tower",
    barricade: "courtyard barricade",
    keep: "keep doors",
  };
  return names[feature];
}

function squadName(squad: PracticeSquadId): string {
  return squad === "vanguard" ? "Vanguard" : squad === "archers" ? "Archers" : "Riders";
}

function roundStep(value: number): number {
  return Math.round(value * 10) / 10;
}

function totalAttackerCounts(counts: Record<PracticeSquadId, number>): PracticeAttackerCounts {
  return {
    vanguard: counts.vanguard,
    archers: counts.archers,
    riders: counts.riders,
    total: counts.vanguard + counts.archers + counts.riders,
  };
}

function totalDefenderCounts(counts: Omit<PracticeDefenderCounts, "total">): PracticeDefenderCounts {
  return {
    ...counts,
    total: counts.gate + counts.westTower + counts.eastTower + counts.barricade + counts.keep,
  };
}

function event(
  phase: PracticeSiegePhase,
  code: PracticeSiegeEventCode,
  text: string,
  options: {
    squad?: PracticeSquadId;
    feature?: PracticeSiegeFeature;
    position?: PracticePoint;
    casualties?: number;
  } = {},
): PracticeSiegePhaseEvent {
  return {
    phase,
    code,
    squad: options.squad ?? null,
    feature: options.feature ?? null,
    position: options.position ? { ...options.position } : null,
    casualties: options.casualties ?? 0,
    text,
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

type TowerId = "westTower" | "eastTower";

type ApproachCalculation = {
  survivors: Record<PracticeSquadId, number>;
  casualties: Record<PracticeSquadId, number>;
  exposure: Record<PracticeSquadId, Record<TowerId, number>>;
  lossesByTower: Record<PracticeSquadId, Record<TowerId, number>>;
};

function calculateApproach(
  request: PracticeSiegeRequest,
  defense: DefensePlan,
  towerStopsAt: Record<TowerId, number | null>,
): ApproachCalculation {
  const survivors: Record<PracticeSquadId, number> = { ...ATTACKER_FORCE };
  const casualties: Record<PracticeSquadId, number> = { vanguard: 0, archers: 0, riders: 0 };
  const exposure: ApproachCalculation["exposure"] = {
    vanguard: { westTower: 0, eastTower: 0 },
    archers: { westTower: 0, eastTower: 0 },
    riders: { westTower: 0, eastTower: 0 },
  };
  const lossesByTower: ApproachCalculation["lossesByTower"] = {
    vanguard: { westTower: 0, eastTower: 0 },
    archers: { westTower: 0, eastTower: 0 },
    riders: { westTower: 0, eastTower: 0 },
  };

  for (const squad of PRACTICE_SQUADS) {
    for (const tower of ["westTower", "eastTower"] as const) {
      const layoutTower = LAYOUT[tower];
      const stopAt = towerStopsAt[tower];
      const travelLimit = stopAt === null ? Number.POSITIVE_INFINITY : stopAt * SQUAD_ROUTE_SPEED[squad];
      const stepsInRange = towerExposureBeforeWall(
        request.routes[squad],
        layoutTower.position,
        layoutTower.range,
        travelLimit,
      );
      const wanted = Math.round((stepsInRange * defense[tower] * TOWER_VULNERABILITY[squad]) / 8);
      const losses = Math.min(survivors[squad], Math.max(0, wanted));
      survivors[squad] -= losses;
      casualties[squad] += losses;
      exposure[squad][tower] = stepsInRange;
      lossesByTower[squad][tower] = losses;
    }
  }
  return { survivors, casualties, exposure, lossesByTower };
}

function towerClearTime(
  tower: TowerId,
  request: PracticeSiegeRequest,
  survivors: Record<PracticeSquadId, number>,
  strength: number,
): number | null {
  const arrivals = PRACTICE_SQUADS
    .filter((squad) => request.objectives[squad] === tower && survivors[squad] > 0)
    .map((squad) => ({
      squad,
      power: survivors[squad] * TOWER_ATTACK[squad],
      time: distanceUntilCircle(request.routes[squad], LAYOUT[tower].position, OBJECTIVE_CONTACT_RADIUS[tower])
        / SQUAD_ROUTE_SPEED[squad],
    }))
    .sort((a, b) => a.time - b.time || PRACTICE_SQUADS.indexOf(a.squad) - PRACTICE_SQUADS.indexOf(b.squad));
  let power = 0;
  for (const arrival of arrivals) {
    power += arrival.power;
    if (power >= strength) return arrival.time;
  }
  return null;
}

/** Return a fresh JSON-safe copy so a renderer cannot mutate the rules. */
export function practiceSiegeLayout(): PracticeSiegeLayout {
  return {
    size: LAYOUT.size,
    deploymentMaxY: LAYOUT.deploymentMaxY,
    frontWallY: LAYOUT.frontWallY,
    gate: { position: { ...LAYOUT.gate.position }, openingHalfWidth: LAYOUT.gate.openingHalfWidth },
    entryRule: LAYOUT.entryRule,
    westTower: { position: { ...LAYOUT.westTower.position }, range: LAYOUT.westTower.range },
    eastTower: { position: { ...LAYOUT.eastTower.position }, range: LAYOUT.eastTower.range },
    barricade: { minimum: { ...LAYOUT.barricade.minimum }, maximum: { ...LAYOUT.barricade.maximum } },
    keep: { position: { ...LAYOUT.keep.position }, finishRadius: LAYOUT.keep.finishRadius },
  };
}

/** Resolve one practice attempt. Invalid player-authored plans are rejected. */
export function resolvePracticeSiege(request: PracticeSiegeRequest): PracticeSiegeResult {
  const validated = validateRequest(request);
  const defense = { ...DEFENSE_PLANS[validated.defensePlan] };
  const fullApproach = calculateApproach(validated, defense, { westTower: null, eastTower: null });
  const towerStopsAt: Record<TowerId, number | null> = {
    westTower: towerClearTime("westTower", validated, fullApproach.survivors, defense.westTower),
    eastTower: towerClearTime("eastTower", validated, fullApproach.survivors, defense.eastTower),
  };
  const approach = calculateApproach(validated, defense, towerStopsAt);
  const survivors: Record<PracticeSquadId, number> = { ...approach.survivors };
  const attackerLosses: Record<PracticeSquadId, number> = { ...approach.casualties };
  const defenderLosses: Omit<PracticeDefenderCounts, "total"> = {
    gate: 0,
    westTower: 0,
    eastTower: 0,
    barricade: 0,
    keep: 0,
  };
  const phaseEvents: PracticeSiegePhaseEvent[] = [];

  const takeAttackerLoss = (squad: PracticeSquadId, wanted: number): number => {
    const taken = Math.min(survivors[squad], Math.max(0, Math.floor(wanted)));
    survivors[squad] -= taken;
    attackerLosses[squad] += taken;
    return taken;
  };

  for (const squad of PRACTICE_SQUADS) {
    let totalExposure = 0;
    for (const tower of ["westTower", "eastTower"] as const) {
      const layoutTower = LAYOUT[tower];
      const exposure = approach.exposure[squad][tower];
      totalExposure += exposure;
      const losses = approach.lossesByTower[squad][tower];
      if (losses > 0) {
        phaseEvents.push(event(
          "approach",
          "towerFire",
          `${featureName(tower)} caught the ${squadName(squad).toLowerCase()} in range for ${roundStep(exposure)} route steps and knocked out ${losses}.`,
          { squad, feature: tower, position: layoutTower.position, casualties: losses },
        ));
      }
    }
    if (totalExposure === 0) {
      phaseEvents.push(event(
        "approach",
        "outsideTowerRange",
        `${squadName(squad)} stayed outside both tower ranges on the approach.`,
        { squad },
      ));
    }
  }

  const targetPower = (feature: "gate" | "westTower" | "eastTower", weights: Record<PracticeSquadId, number>): number =>
    PRACTICE_SQUADS.reduce((power, squad) =>
      power + (validated.objectives[squad] === feature ? survivors[squad] * weights[squad] : 0), 0);

  const gatePower = targetPower("gate", GATE_ATTACK);
  const gateOpened = gatePower >= defense.gate;
  if (gatePower === 0) {
    phaseEvents.push(event("wall", "objectiveSkipped", "No squad was sent to open the gate.", {
      feature: "gate",
      position: LAYOUT.gate.position,
    }));
  } else if (gateOpened) {
    defenderLosses.gate = defense.gate;
    phaseEvents.push(event("wall", "objectiveWon", "The gate team broke the gate open.", {
      feature: "gate",
      position: LAYOUT.gate.position,
    }));
  } else {
    defenderLosses.gate = Math.min(defense.gate, Math.floor(gatePower / 2));
    phaseEvents.push(event("wall", "objectiveHeld", "The gate held because its attack team was too small.", {
      feature: "gate",
      position: LAYOUT.gate.position,
    }));
  }

  const towerBroken: Record<"westTower" | "eastTower", boolean> = { westTower: false, eastTower: false };
  for (const tower of ["westTower", "eastTower"] as const) {
    const power = targetPower(tower, TOWER_ATTACK);
    towerBroken[tower] = power >= defense[tower];
    if (power === 0) continue;
    if (towerBroken[tower]) {
      defenderLosses[tower] = defense[tower];
      phaseEvents.push(event("wall", "objectiveWon", `${squadName(PRACTICE_SQUADS.find((squad) => validated.objectives[squad] === tower)!)} cleared the ${featureName(tower)} and stopped its fire.`, {
        feature: tower,
        position: LAYOUT[tower].position,
      }));
    } else {
      defenderLosses[tower] = Math.min(defense[tower], Math.floor(power / 2));
      phaseEvents.push(event("wall", "objectiveHeld", `The ${featureName(tower)} held because its attack team was too small.`, {
        feature: tower,
        position: LAYOUT[tower].position,
      }));
    }
  }

  const gateX = LAYOUT.gate.position.x;
  // The resolver knows exactly why a squad stayed outside; say that instead of
  // hedging with "closed or missed".
  const blockedText = (squad: PracticeSquadId, crossingX: number, atGate: boolean): string => {
    const name = squadName(squad);
    const shownX = roundStep(crossingX);
    if (atGate && gatePower === 0) {
      return `${name} reached the gate at x ${shownX}, but no squad was sent to open it, so the closed gate stopped them like a wall.`;
    }
    if (atGate) {
      return `${name} reached the gate at x ${shownX}, but the gate team was too small to open it, so the closed gate stopped them.`;
    }
    if (gateOpened) {
      return `${name} crossed at x ${shownX} and hit solid wall. The open gate is at x ${gateX} and it is the only way in.`;
    }
    return `${name} crossed at x ${shownX} and hit solid wall. The gate at x ${gateX} is the only way in, and it stayed closed.`;
  };

  const inside: Record<PracticeSquadId, boolean> = { vanguard: false, archers: false, riders: false };
  for (const squad of PRACTICE_SQUADS) {
    if (survivors[squad] === 0) continue;
    const crossingX = wallCrossingX(validated.routes[squad]);
    const atGate = Math.abs(crossingX - gateX) <= LAYOUT.gate.openingHalfWidth;
    inside[squad] = atGate && gateOpened;
    if (inside[squad]) {
      phaseEvents.push(event("wall", "enteredFort", `${squadName(squad)} followed its route through the open gate.`, {
        squad,
        position: { x: roundStep(crossingX), y: LAYOUT.frontWallY },
      }));
    } else {
      const losses = takeAttackerLoss(squad, Math.ceil(survivors[squad] * 0.4));
      phaseEvents.push(event("wall", "blockedAtWall", blockedText(squad, crossingX, atGate), {
        squad,
        position: { x: roundStep(crossingX), y: LAYOUT.frontWallY },
        casualties: losses,
      }));
    }
  }

  const barricadePower = PRACTICE_SQUADS.reduce((power, squad) =>
    power + (inside[squad] && validated.objectives[squad] === "barricade" ? survivors[squad] * BARRICADE_ATTACK[squad] : 0), 0);
  const barricadeBroken = barricadePower >= defense.barricade;
  if (barricadePower > 0) {
    if (barricadeBroken) {
      defenderLosses.barricade = defense.barricade;
      phaseEvents.push(event("courtyard", "objectiveWon", "The courtyard team cleared the barricade for every squad.", {
        feature: "barricade",
        position: objectivePosition("barricade"),
      }));
    } else {
      defenderLosses.barricade = Math.min(defense.barricade, Math.floor(barricadePower / 2));
      phaseEvents.push(event("courtyard", "objectiveHeld", "The courtyard team was too small to clear the barricade.", {
        feature: "barricade",
        position: objectivePosition("barricade"),
      }));
    }
  }

  for (const squad of PRACTICE_SQUADS) {
    if (!inside[squad] || survivors[squad] === 0 || barricadeBroken) continue;
    const blockedLength = routeLengthInsideBarricade(validated.routes[squad]);
    if (blockedLength > 0) {
      const losses = takeAttackerLoss(squad, Math.max(1, Math.round(blockedLength * BARRICADE_LOSS[squad])));
      phaseEvents.push(event("courtyard", "barricadeHit", `${squadName(squad)} crossed ${roundStep(blockedLength)} route steps of barricade and lost ${losses}.`, {
        squad,
        feature: "barricade",
        position: objectivePosition("barricade"),
        casualties: losses,
      }));
    } else {
      phaseEvents.push(event("courtyard", "barricadeAvoided", `${squadName(squad)} routed around the courtyard barricade.`, {
        squad,
        feature: "barricade",
        position: objectivePosition("barricade"),
      }));
    }
  }

  const remainingDefense = {
    gate: defense.gate - defenderLosses.gate,
    westTower: defense.westTower - defenderLosses.westTower,
    eastTower: defense.eastTower - defenderLosses.eastTower,
    barricade: defense.barricade - defenderLosses.barricade,
    keep: defense.keep - defenderLosses.keep,
  };
  const attackStrength = PRACTICE_SQUADS.reduce((power, squad) => {
    if (!inside[squad]) return power;
    const directKeepBonus = validated.objectives[squad] === "keep" ? 1.15 : 1;
    return power + survivors[squad] * KEEP_ATTACK[squad] * directKeepBonus;
  }, 0);
  const defenseStrength = remainingDefense.keep * 1.5
    + remainingDefense.barricade * 0.9
    + remainingDefense.gate * 0.5
    + (remainingDefense.westTower + remainingDefense.eastTower) * 0.35;
  const attackerWon = attackStrength >= defenseStrength && attackStrength > 0;
  const finalLossRate = attackerWon
    ? clamp((defenseStrength / attackStrength) * 0.22, 0.08, 0.3)
    : clamp(0.4 + (defenseStrength / Math.max(1, attackStrength)) * 0.12, 0.5, 0.75);
  let keepLosses = 0;
  for (const squad of PRACTICE_SQUADS) {
    if (!inside[squad] || survivors[squad] === 0) continue;
    keepLosses += takeAttackerLoss(squad, Math.ceil(survivors[squad] * finalLossRate));
  }

  if (attackerWon) {
    defenderLosses.gate = defense.gate;
    defenderLosses.westTower = defense.westTower;
    defenderLosses.eastTower = defense.eastTower;
    defenderLosses.barricade = defense.barricade;
    defenderLosses.keep = defense.keep;
    phaseEvents.push(event("keep", "siegeWon", "Enough attackers reached the keep doors. The practice fort is yours.", {
      feature: "keep",
      position: LAYOUT.keep.position,
      casualties: keepLosses,
    }));
  } else {
    defenderLosses.keep = Math.min(defense.keep, Math.floor(attackStrength / 3));
    phaseEvents.push(event("keep", "siegeLost", attackStrength === 0
      ? "No squad reached the keep doors, so the defenders held the practice fort."
      : "Too few attackers reached the keep doors, so the defenders held the practice fort.", {
      feature: "keep",
      position: LAYOUT.keep.position,
      casualties: keepLosses,
    }));
  }

  const squadsInside = PRACTICE_SQUADS.filter((squad) => inside[squad]).length;
  const attackersAtKeep = totalAttackerCounts(survivors).total;
  const squadWord = (count: number) => `${count} squad${count === 1 ? "" : "s"}`;
  let headline: string;
  if (attackerWon) {
    headline = `The gate opened, ${squadWord(squadsInside)} got inside, and ${attackersAtKeep} attackers reached the keep doors.`;
  } else if (gatePower === 0) {
    headline = "No squad was sent to open the gate, so every squad was stopped at the wall.";
  } else if (!gateOpened) {
    headline = "The gate team was too small to open the gate, so every squad was stopped at the wall.";
  } else if (squadsInside === 0) {
    headline = `The gate opened at x ${gateX}, but every route crossed the wall somewhere else.`;
  } else {
    headline = `${squadWord(squadsInside)} got inside, but too few attackers reached the keep doors to take it.`;
  }

  return {
    mode: "practice",
    validated,
    fixedForces: {
      attacker: { ...ATTACKER_FORCE },
      defender: { ...defense },
    },
    phaseEvents,
    outcome: attackerWon ? "attackerWin" : "defenderWin",
    headline,
    attackerCasualties: totalAttackerCounts(attackerLosses),
    attackerSurvivors: totalAttackerCounts(survivors),
    defenderCasualties: totalDefenderCounts(defenderLosses),
    reasons: phaseEvents.map((entry) => entry.text),
  };
}
