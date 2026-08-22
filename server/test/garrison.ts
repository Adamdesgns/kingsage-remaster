import { emptyArmy, type Army } from "../../packages/game-core/src/index.ts";
import type { SharedWorldStore } from "../src/store.ts";

/**
 * The army every kingdom used to be handed for free at world creation.
 *
 * Adam's ruling, 2026-08-22: *"I should start with no troops if I'm starting
 * the game from beginning to finish."* He is right - a real player builds up
 * from nothing, and a fixture that gifts a full garrison hides whether the
 * economy and the barracks actually work.
 *
 * So `startingArmy()` is now empty, and the tests that USED to lean on that
 * gift say so out loud by calling `garrisonEveryVillage`. A test that needs
 * troops should assert that it needs them; it should not inherit them from a
 * generous world fixture. Sixteen tests were quietly doing the latter.
 */
export const LEGACY_STARTING_ARMY: Army = {
  ...emptyArmy(),
  spear: 30,
  sword: 12,
  archer: 10,
  scout: 4,
};

/**
 * Give every village in the world the same garrison, so a test can get on with
 * testing marches, battles and intel instead of running an economy first.
 *
 * Writes straight to the row on purpose: this is scaffolding, not gameplay, and
 * routing it through commands would make every warfare test depend on the
 * recruitment path it is not testing.
 */
export function garrisonEveryVillage(store: SharedWorldStore, army: Army = LEGACY_STARTING_ARMY): void {
  store.db.prepare("UPDATE local_villages SET army_json = ?").run(JSON.stringify(army));
}
