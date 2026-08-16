import type { BattlePlan, CommandSquadId } from "../../../packages/game-core/src/contracts";

export type TroopId = CommandSquadId;
export type Plan = BattlePlan;
export type ScoutReport = { recommendedEntry: Plan["entry"]; discovered: string[] };

export type Formation = {
  id: TroopId;
  label: string;
  count: number;
  portrait: string;
  x: number;
  y: number;
};

export const troopDetails: Record<TroopId, Omit<Formation, "x" | "y">> = {
  vanguard: { id: "vanguard", label: "Vanguard", count: 120, portrait: "/art/vanguard-portrait.png" },
  archers: { id: "archers", label: "Archers", count: 90, portrait: "/art/archers-portrait.png" },
  riders: { id: "riders", label: "Riders", count: 48, portrait: "/art/riders-portrait.png" },
};

export const battleScenes = [
  {
    name: "Outer Wall",
    objective: "Break the gate",
    image: "/art/battle-1-outer-wall.png",
    enemy: "Ironwatch Garrison",
    positions: { vanguard: [30, 54], archers: [18, 78], riders: [70, 68] },
  },
  {
    name: "Lower Ward",
    objective: "Take the crossroads",
    image: "/art/battle-2-lower-ward.png",
    enemy: "Ward Defenders",
    positions: { vanguard: [31, 54], archers: [18, 79], riders: [67, 69] },
  },
  {
    name: "Citadel Keep",
    objective: "Capture the keep",
    image: "/art/battle-3-citadel.png",
    enemy: "The King’s Guard",
    positions: { vanguard: [48, 55], archers: [20, 70], riders: [73, 73] },
  },
] as const;

export const entryOptions: readonly Plan["entry"][] = ["West Ridge", "Main Breach", "East Woods"];
export const troopOptions: readonly Plan["troops"][] = ["Vanguard Heavy", "Balanced Army", "Cavalry Wing"];
export const timeOptions: readonly Plan["time"][] = ["Dawn", "Midday", "Night"];
export const styleOptions: readonly Plan["style"][] = ["Siege Push", "Flanking Strike", "Full Assault"];

export const scoutIntel = [
  {
    id: "west-tower",
    label: "West watchtower",
    x: 22,
    y: 25,
    threat: "Medium",
    detail: "Eight archers. Narrow firing angle leaves the ridge partly covered.",
    counter: "Riders can cross the blind side quickly.",
  },
  {
    id: "main-gate",
    label: "Main gatehouse",
    x: 52,
    y: 35,
    threat: "Severe",
    detail: "Reinforced gate, boiling oil, and two overlapping tower positions.",
    counter: "Needs a siege push and heavy Vanguard losses.",
  },
  {
    id: "east-tower",
    label: "East wall tower",
    x: 79,
    y: 28,
    threat: "High",
    detail: "Longbow unit overlooks the woods and the broken outer wall.",
    counter: "Night cover reduces their range advantage.",
  },
  {
    id: "reserve-yard",
    label: "Reserve yard",
    x: 71,
    y: 48,
    threat: "High",
    detail: "Twenty-four defenders wait behind the breach to reinforce either flank.",
    counter: "A dawn flank can pin them before they deploy.",
  },
] as const;

export const scoutLanes: ReadonlyArray<{ name: Plan["entry"]; risk: string; note: string }> = [
  { name: "West Ridge", risk: "Low", note: "Tower blind side" },
  { name: "Main Breach", risk: "Severe", note: "Fastest, heavily defended" },
  { name: "East Woods", risk: "Medium", note: "Cover, then open ground" },
];

export function getPlanScore(plan: Plan) {
  return Number(plan.entry === "West Ridge")
    + Number(plan.troops === "Balanced Army")
    + Number(plan.time === "Dawn")
    + Number(plan.style === "Flanking Strike");
}
export function getPlanRating(plan: Plan) {
  const score = getPlanScore(plan);
  if (score >= 4) return { label: "High", orders: 3, losses: 4 } as const;
  if (score >= 2) return { label: "Steady", orders: 4, losses: 7 } as const;
  return { label: "Risky", orders: 5, losses: 11 } as const;
}

export function getPlanSummary(plan: Plan) {
  return `${plan.time} timing from the ${plan.entry.toLowerCase()} sets up a ${plan.style.toLowerCase()} with a ${plan.troops.toLowerCase()}.`;
}
