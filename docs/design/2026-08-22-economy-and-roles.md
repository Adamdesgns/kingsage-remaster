# Economy and Roles — horses, trade, and the reason to play without fighting

**Date:** 2026-08-22 · **Status:** DESIGN, awaiting Adam
**Brief:** `docs/design/CANONICAL-BRIEF.md`
**Companion:** `docs/superpowers/specs/2026-08-22-combat-and-army-design.md`

**Adam, 2026-08-22:** *"Let's think like KingsAge / World of Warcraft but inside
Roblox. Fully functioning economy and more to do than just war — but that is the
entire point of the game. Take over the world. Some people might just prefer to
become horse breeders and sell to warlords who protect them. Sky's the limit."*

---

## 1. The one idea this document is built on

**You cannot build a protection economy. You can only build the conditions and
get out of the way.**

"Horse breeder pays a warlord for protection" is not a feature. If we shipped a
*Protection Contract* button with an escrow UI, it would be dead in a week —
because the interesting part is the negotiation, the betrayal, the reputation,
and none of that survives being turned into a form.

That relationship appears **on its own** the moment three things are true:

1. **Scarcity with a face** — something valuable that only *some* players can
   make, and making it takes time rather than money.
2. **Transferability** — a way to move it to another player that is real,
   visible, and interruptible.
3. **Vulnerability** — the maker cannot defend it alone, and losing it hurts.

Horses satisfy all three by accident. That is why they are the right first
profession, and why this document is mostly about horses.

Everything else in this file exists to serve those three conditions. If a
proposed feature does not strengthen one of them, it does not belong.

## 2. What this deliberately is NOT

The brief now records this, and it belongs here too. **We are taking WoW's
professions and player economy. We are not taking its themepark.**

No quest chains, no dungeons, no raid tiers, no scripted story, no NPC
questgivers. Those need a content factory — writers, designers, artists,
producing content faster than players consume it. We are one person and Claude.
A themepark would be a treadmill we lose.

A **systems** economy is the opposite: you build the rules once and players
generate the content forever. That we can do.

## 3. Horses — the first profession

**Decided (Adam, 2026-08-22):** you *breed* horses. **Recommended and pending
confirmation:** the Stable comes with its breeding pair when it is built.

### Why the Stable includes the pair

The alternative — buy your first pair — creates a dead end. A new player saves
up, builds a Stable, cannot afford horses, and now owns an expensive building
that does nothing. It also needs a *seller*, which means gating a new system
behind the Market, which is not built. The Stable's cost is already the price of
admission, and fictionally a stable with no horses is not a stable.

Buying and capturing are not lost — they become **additions** once the Market
exists (buy horses) and once cavalry battles resolve (capture from beaten
riders). Neither is required to ship.

### The mechanic

- The Stable holds a **breeding pair** from construction.
- Horses accrue over time at a rate set by **Stable level**, capped by Stable
  level. They are a resource, not a unit — they do not fight and cannot march.
- **Cavalry costs a trained foot soldier + a horse.** Crusaders and Black
  Knights cannot be trained directly; they are *converted* in the Barracks list
  from soldiers you already hold, consuming horses.
- A cavalry unit that dies takes its horse with it.

### Why this is the best thing in the design

**Cavalry becomes rate-limited instead of cash-limited.** A rich player cannot
convert a big bank into 500 Crusaders overnight, because the horses do not exist
yet. Consequences that fall out for free:

- Cavalry stays genuinely elite rather than being what wealth buys.
- Stable level becomes a long-term compounding investment.
- Losing riders hurts twice — the soldier *and* the horse.
- **Raiding a Stable sets someone's cavalry back weeks.** That is a strategic
  target that is not just "steal their wood," and it is the first time in this
  game that *what* you attack matters as much as *whether* you win.

That last point is what creates condition 3 — vulnerability — and therefore the
warlord.

### Open

- Breeding rate per Stable level, and the cap. Must be slow enough that cavalry
  stays scarce, fast enough that a Stable is worth building. **Set by
  simulation, not by guess** — the same method that killed my first ram rule.
- Do horses appear in the settlement visually? (Cheap, and it makes the Stable a
  place worth walking to. Recommended, deferred to the art pass.)

## 4. Trade

Our Market building's own description already claims it *"prepares resource
exchange and alliance coordination."* Neither is built. **The building currently
promises something the game cannot do**, which is its own argument for building
this.

### The mechanic — merchants, borrowed from both source games

- The Market holds **merchants**, count set by Market level.
- Each merchant carries a fixed load of resources.
- A trade is a **march**: merchants travel the map at a real speed, arrive, and
  return. Nothing teleports.
- Merchants in transit are committed and visible.

Trade being a march is important — it reuses the marching, timing and arrival
machinery we have already built and tested, and it means a caravan is a thing
that exists in the world for a while. Which makes it a thing that can be
*interrupted*, later, if we want caravan raiding.

### Anti-abuse — the part that actually needs care

Free resource transfer between accounts is the classic exploit in this genre:
make a second account, feed everything to the main, and the economy stops
meaning anything. On a 13+ Roblox game there is a second problem — resource
trading is a well-known scam vector (*"send me your iron and I'll protect
you"*), and Roblox has a long history of exactly this.

Three rules, taken from the source games, that solve it structurally rather
than by policing:

1. **Trade is a ratio-bounded exchange, not a gift.** You offer resources *for*
   resources within a bounded ratio. You cannot send 10,000 wood for 1 iron.
   This kills alt-account farming as a *mechanic* — there is no way to express
   "give everything to my main."
2. **Donation is alliance-only**, and only once alliances exist with a real join
   cost and a leave cooldown. One-way giving is the abuse vector; it must be
   gated behind a social structure that has friction.
3. **Merchants take time.** Nothing moves instantly, so a bad trade is visible
   before it lands and a scam has a window in which it can be seen.

⚠️ **Consequence Adam must accept:** rule 2 means **donation waits on
alliances**, which are in the schema and not built. Trade can ship before them;
donation cannot.

### Scam safety is a design property, not a moderation problem

The safest trade system is one where the dangerous trade **cannot be
expressed**. Ratio bounds do that. We should not ship a free-form "send
anything to anyone" and then try to moderate it — on this platform, with this
audience, that is a known losing position.

## 5. What "more to do than war" actually means

Horses are the template, not the whole answer. The pattern that makes a
profession work here:

> Something that takes **time** rather than money to produce, that a fighter
> **needs**, that its maker **cannot protect alone**.

Candidates that fit the pattern and use systems we already have — **named to
show the shape, not proposed for building:**

- **Horses** → cavalry. *(this document)*
- **Armour** → the Smithy already upgrades it; make the upgrades tradeable and
  a smith becomes a supplier.
- **Siege engines** → the Workshop builds rams and trebuchets, which are slow,
  expensive and useless to the person who built them if they never attack.
- **Caravans** → a merchant specialist who moves other people's goods, and can
  be robbed.

Each one is a profession only because it is scarce, transferable and vulnerable.
**Do not add a profession that fails one of the three.** A "farmer" who produces
wood faster is not a profession — wood is not scarce and everyone makes it.

## 6. Sequencing — the honest part

This document plus the combat spec now describes a substantially larger game
than the one that exists. Written plainly so nobody has to guess:

**Nothing from the conquest slice has been seen in Studio.** Twenty-five drills
are written; nine have dated passes. The game has zero external players and no
telemetry.

Ambition is not the risk. **Building six systems before proving one is fun** is
the risk, and it is how projects like this die.

Proposed order, each independently shippable:

| # | What | Why here |
|---|---|---|
| 0 | **Run the conquest drills in Studio** | The cheapest possible check, and it is owed. Everything below assumes the current game works, which nobody has confirmed. |
| 1 | **Roster + three-class combat + wall** | Server-only. Makes all 11 troops mean something. The foundation everything else sits on. |
| 2 | **Recruitment for all 11, one list, at the Barracks** | Without it, phase 1 is theoretical. Ships *with* phase 1, per the earlier red team. |
| 3 | **Horses + cavalry conversion** | The first profession. Small, and it makes the Stable real. |
| 4 | **Siege — rams and trebuchets** | Completes the combat model. |
| 5 | **Trade (ratio-bounded)** | Makes horses transferable — condition 2. **The protection economy becomes possible here and not before.** |
| 6 | **Settlement points + Realm of Power** | Correct conquest. |
| 7 | **Freeholds** | The on-ramp. |
| 8 | **Alliances, then donation** | Donation is gated on alliances existing. |

**Step 5 is the moment the vision turns on.** Before it, horses are a private
resource. After it, a breeder can sell to a warlord — and every emergent
relationship Adam described becomes available without another line of code
written to enable it.

## 7. Open questions

1. **Confirm: the Stable ships with its breeding pair?** (Recommended — the
   alternative creates a dead end and depends on an unbuilt Market.)
2. **Confirm: donation waits on alliances.** Trade does not.
3. **Are ratio-bounded trades acceptable**, knowing they make pure gifting
   impossible between non-allies? That is the anti-farming rule doing its job,
   and it will occasionally annoy honest players.
4. **Step 0** — the conquest drills. They need a hand on Play, and everything
   in this document is built on the assumption that what exists works.
