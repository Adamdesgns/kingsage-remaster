import type { TroopType } from "./contracts.ts";

/**
 * Horses — the first profession.
 *
 * [Adam, 2026-08-22] *"Some people might just prefer to become horse breeders
 * and sell to warlords who protect them."*
 *
 * That relationship is not a feature you can build. A Protection Contract
 * button with an escrow UI would be dead in a week, because the interesting
 * part is the negotiation and the betrayal, and neither survives being turned
 * into a form. It appears on its own once three things are true, and horses
 * satisfy all three by accident:
 *
 *  1. **Scarcity with a face** — only players with a Stable make them, and
 *     making them takes TIME rather than money.
 *  2. **Transferability** — they can be moved to another player (needs the
 *     Market; not built yet).
 *  3. **Vulnerability** — the breeder cannot defend the herd alone, and raiding
 *     a Stable sets someone's cavalry back weeks.
 *
 * **The load-bearing consequence: cavalry becomes rate-limited instead of
 * cash-limited.** A rich player cannot turn a big bank into 500 Crusaders,
 * because the horses do not exist yet. Cavalry stays elite because it is slow,
 * not because it is expensive — and that is a thing wealth cannot shortcut.
 */

/**
 * A Stable is built with its breeding pair.
 *
 * The alternative — buy your first pair — is a dead end: you save up, build an
 * expensive Stable, cannot afford horses, and own a building that does nothing.
 * It would also gate a brand-new system behind the Market, which does not
 * exist. And fictionally, a stable with no horses is not a stable.
 */
export const BREEDING_PAIR = 2;

/**
 * Horses bred per hour at a given Stable level. **[OURS]**
 *
 * Deliberately slow. A level 1 Stable is about ten horses a day: enough that
 * the herd visibly grows, nowhere near enough to field cavalry as your army.
 * A maxed Stable is a genuine industry, which is the point of a profession.
 */
export function horsesPerHour(stableLevel: number): number {
  const level = Math.max(0, Math.floor(stableLevel));
  if (level < 1) return 0;
  return level * 0.4;
}

/**
 * How many horses a Stable can hold. **[OURS]**
 *
 * The cap is not a limitation, it is the pressure that creates a market. A
 * breeder sitting at capacity loses production every hour they do not spend or
 * sell, which makes "sell to a warlord" something they WANT rather than
 * something the game asks them to do.
 */
export function horseCapacity(stableLevel: number): number {
  const level = Math.max(0, Math.floor(stableLevel));
  if (level < 1) return 0;
  return 5 * level + BREEDING_PAIR;
}

/**
 * Bring a herd up to date. Time is the only input.
 *
 * Never goes backwards: a Stable razed to level 0 stops BREEDING, it does not
 * kill the animals already standing in it. Losing the herd is something an
 * attacker does, not something arithmetic does quietly.
 */
export function accrueHorses(input: { horses: number; stableLevel: number; hours: number }): number {
  const held = Math.max(0, Math.floor(input.horses));
  const hours = Math.max(0, input.hours);
  const rate = horsesPerHour(input.stableLevel);
  if (rate <= 0 || hours <= 0) return held;
  const capacity = horseCapacity(input.stableLevel);
  // Whole animals only, and never above what the Stable can hold.
  return Math.min(Math.max(capacity, held), Math.floor(held + rate * hours));
}


/**
 * Which foot soldier becomes which rider. **[Adam, 2026-08-22]** *"the stables
 * is to add horses to the troops to create cavalry."*
 *
 * Crusaders and Black Knights cannot be trained directly. They are converted in
 * the Barracks list from soldiers you already hold, consuming a horse each — so
 * a rider costs you the time you spent on the soldier AND the time the Stable
 * spent on the horse.
 *
 * The pairing follows the armour: the Berserker is the aggressive infantryman
 * and becomes the aggressive rider; the Templar is the armoured one and becomes
 * the Black Knight.
 */
const CONVERSIONS: Partial<Record<TroopType, { from: TroopType; horses: number }>> = {
  lightCavalry: { from: "axe", horses: 1 },
  heavyCavalry: { from: "sword", horses: 1 },
};

export function cavalryConversion(unit: TroopType): { from: TroopType; horses: number } | null {
  return CONVERSIONS[unit] ?? null;
}

export type ConversionPlan = {
  converted: number;
  soldiersUsed: number;
  horsesUsed: number;
  /** What ran out first, so the refusal can name it instead of mumbling. */
  shortfall: "soldiers" | "horses" | null;
};

/**
 * How many riders can actually be made, and what stopped it.
 *
 * Naming the shortfall matters more than it looks: the first time a player is
 * told "you have the men, you are short of horses" is the moment a breeder
 * becomes someone worth knowing. A generic "insufficient resources" would hide
 * the entire profession.
 */
export function planConversion(input: {
  unit: TroopType;
  quantity: number;
  soldiers: number;
  horses: number;
}): ConversionPlan {
  const recipe = cavalryConversion(input.unit);
  const idle: ConversionPlan = { converted: 0, soldiersUsed: 0, horsesUsed: 0, shortfall: null };
  if (!recipe) return idle;

  const wanted = Math.max(0, Math.floor(input.quantity));
  const soldiers = Math.max(0, Math.floor(input.soldiers));
  const horses = Math.max(0, Math.floor(input.horses));
  if (wanted < 1) return idle;

  const bySoldiers = soldiers;
  const byHorses = Math.floor(horses / recipe.horses);
  const converted = Math.min(wanted, bySoldiers, byHorses);

  let shortfall: ConversionPlan["shortfall"] = null;
  if (converted < wanted) {
    // Whichever ran out FIRST. Ties name horses, because horses are the one
    // you cannot fix by spending money.
    shortfall = byHorses <= bySoldiers ? "horses" : "soldiers";
  }

  return {
    converted,
    soldiersUsed: converted,
    horsesUsed: converted * recipe.horses,
    shortfall,
  };
}
