import { useEffect, useMemo, useRef, useState } from "react";
import Phaser from "phaser";
import {
  ArrowRightIcon,
  CheckIcon,
  Cross2Icon,
  ExitIcon,
  PauseIcon,
  ResumeIcon,
  TargetIcon,
} from "@radix-ui/react-icons";
import {
  getPlanRating,
  troopDetails,
  type Plan,
  type TroopId,
} from "./game/prototype-data";
import { ScoutScreen } from "./game/CampaignSetup";
import { SharedWorld } from "./game/SharedWorld";
import { FlowStack, MobileScroll, useFlow, type FlowControls } from "./mobile";

type BattleReadout = {
  allied: number;
  enemies: number;
  gate: number;
  progress: number;
  seconds: number;
  event: string;
  squads: Record<TroopId, number>;
};

type BattleController = {
  selectSquad: (squad: TroopId) => void;
  setPaused: (paused: boolean) => void;
  retreat: () => void;
};

type CombatUnit = {
  id: number;
  team: "ally" | "enemy";
  squad: TroopId | "defenders";
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Ellipse;
  healthBar: Phaser.GameObjects.Graphics;
  hp: number;
  maxHp: number;
  speed: number;
  range: number;
  damage: number;
  cooldown: number;
  nextAttack: number;
  dead: boolean;
  baseScaleX: number;
  commandX: number;
  commandY: number;
  commandUntil: number;
};

const battleUnitConfig: Record<TroopId | "defenders", {
  texture: string;
  width: number;
  height: number;
  hp: number;
  speed: number;
  range: number;
  damage: number;
  cooldown: number;
}> = {
  vanguard: { texture: "unit-vanguard", width: 32, height: 35, hp: 82, speed: 24, range: 21, damage: 13, cooldown: 920 },
  archers: { texture: "unit-archer", width: 29, height: 35, hp: 46, speed: 22, range: 104, damage: 9, cooldown: 1260 },
  riders: { texture: "unit-rider", width: 46, height: 43, hp: 104, speed: 35, range: 28, damage: 19, cooldown: 1080 },
  defenders: { texture: "unit-defender", width: 31, height: 34, hp: 92, speed: 20, range: 21, damage: 11, cooldown: 980 },
};

function RealTimeOuterWall({ plan, onWin, onRetreat }: { plan: Plan; onWin: (readout: BattleReadout) => void; onRetreat: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<BattleController | null>(null);
  const winRef = useRef(onWin);
  const retreatRef = useRef(onRetreat);
  const [selected, setSelected] = useState<TroopId | null>("vanguard");
  const [paused, setPaused] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [readout, setReadout] = useState<BattleReadout>({
    allied: 40,
    enemies: 30,
    gate: 100,
    progress: 0,
    seconds: 0,
    event: "The army is advancing",
    squads: { vanguard: 16, archers: 16, riders: 8 },
  });

  winRef.current = onWin;
  retreatRef.current = onRetreat;

  useEffect(() => {
    if (!hostRef.current) return;

    const WIDTH = 390;
    const HEIGHT = 844;
    const GATE = { x: 195, y: 206 };
    const planPower = getPlanRating(plan).label === "High" ? 1.18 : getPlanRating(plan).label === "Steady" ? 1 : 0.86;
    const scene = new Phaser.Scene({ key: "outer-wall-combat" }) as Phaser.Scene & {
      preload: () => void;
      create: () => void;
      update: (time: number, delta: number) => void;
    };
    let units: CombatUnit[] = [];
    let unitId = 0;
    const gateMaxHp = 2000;
    let gateHp = gateMaxHp;
    let selectedSquad: TroopId = "vanguard";
    let battleElapsed = 0;
    let lastUiUpdate = 0;
    let nextTowerShot = 0;
    let reinforcementsSent = false;
    let reserveCounterattackSent = false;
    let retreating = false;
    let won = false;
    let totalEnemySpawned = 30;
    let normalBackground: Phaser.GameObjects.Image;
    let breachedBackground: Phaser.GameObjects.Image;

    const living = (team: "ally" | "enemy") => units.filter((unit) => unit.team === team && !unit.dead);
    const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

    const drawHealth = (unit: CombatUnit) => {
      unit.healthBar.clear();
      if (unit.dead || (unit.hp === unit.maxHp && unit.squad !== selectedSquad)) return;
      const width = unit.team === "ally" ? 24 : 22;
      const ratio = Math.max(0, unit.hp / unit.maxHp);
      unit.healthBar.fillStyle(0x07141b, 0.9).fillRoundedRect(unit.sprite.x - width / 2, unit.sprite.y - unit.sprite.displayHeight * 0.7, width, 4, 2);
      unit.healthBar.fillStyle(unit.team === "ally" ? 0x62e1d4 : 0xff8068, 1).fillRoundedRect(unit.sprite.x - width / 2 + 1, unit.sprite.y - unit.sprite.displayHeight * 0.7 + 1, (width - 2) * ratio, 2, 1);
      unit.healthBar.setDepth(900);
    };

    const syncUnitVisual = (unit: CombatUnit) => {
      unit.sprite.setDepth(Math.round(unit.sprite.y));
      unit.shadow.setPosition(unit.sprite.x, unit.sprite.y + 3).setDepth(Math.round(unit.sprite.y) - 1);
      drawHealth(unit);
    };

    const createUnit = (team: "ally" | "enemy", squad: TroopId | "defenders", x: number, y: number, delay = 0) => {
      const stats = battleUnitConfig[squad];
      const shadow = scene.add.ellipse(x, y + 3, stats.width * 0.64, 8, 0x000000, 0.28).setDepth(y - 1);
      const sprite = scene.add.image(x, y, stats.texture).setOrigin(0.5, 0.78).setDisplaySize(stats.width, stats.height).setDepth(y);
      if (team === "enemy") sprite.setFlipX(true);
      const unit: CombatUnit = {
        id: unitId++, team, squad, sprite, shadow, healthBar: scene.add.graphics(),
        hp: stats.hp, maxHp: stats.hp, speed: stats.speed, range: stats.range,
        damage: stats.damage * (team === "ally" ? planPower : 1), cooldown: stats.cooldown,
        nextAttack: delay, dead: false, baseScaleX: sprite.scaleX, commandX: x, commandY: y, commandUntil: 0,
      };
      units.push(unit);
      scene.tweens.add({ targets: sprite, angle: unit.id % 2 ? 1.4 : -1.4, duration: 430 + (unit.id % 5) * 65, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      return unit;
    };

    const killUnit = (unit: CombatUnit) => {
      if (unit.dead) return;
      unit.dead = true;
      unit.healthBar.clear();
      scene.tweens.killTweensOf(unit.sprite);
      scene.tweens.add({ targets: [unit.sprite, unit.shadow], alpha: 0, angle: unit.team === "ally" ? -72 : 72, y: unit.sprite.y + 11, duration: 520, ease: "Cubic.in", onComplete: () => {
        unit.sprite.destroy(); unit.shadow.destroy(); unit.healthBar.destroy();
      } });
    };

    const damageUnit = (unit: CombatUnit, amount: number) => {
      if (unit.dead || won) return;
      unit.hp -= amount;
      unit.sprite.setTintFill(0xffffff);
      scene.time.delayedCall(70, () => { if (!unit.dead) unit.sprite.clearTint(); });
      if (unit.hp <= 0) killUnit(unit);
      else drawHealth(unit);
    };

    const burst = (x: number, y: number, color: number, count = 7) => {
      for (let i = 0; i < count; i += 1) {
        const particle = scene.add.circle(x, y, 2 + (i % 3), color, 0.9).setDepth(850);
        const angle = (Math.PI * 2 * i) / count;
        scene.tweens.add({ targets: particle, x: x + Math.cos(angle) * (18 + i * 2), y: y + Math.sin(angle) * (12 + i), alpha: 0, scale: 0.25, duration: 360 + i * 24, onComplete: () => particle.destroy() });
      }
    };

    const projectile = (from: CombatUnit | { x: number; y: number }, to: CombatUnit, damage: number, enemyShot = false) => {
      const source = "sprite" in from ? from.sprite : from;
      const bolt = scene.add.ellipse(source.x, source.y - 8, 11, 3, enemyShot ? 0xffa277 : 0xffdf73, 1).setDepth(880).setRotation(Math.atan2(to.sprite.y - source.y, to.sprite.x - source.x));
      scene.tweens.add({ targets: bolt, x: to.sprite.x, y: to.sprite.y - 6, duration: Math.max(180, distance(source, to.sprite) * 2.4), ease: "Linear", onComplete: () => {
        bolt.destroy();
        if (!to.dead) { damageUnit(to, damage); burst(to.sprite.x, to.sprite.y - 5, enemyShot ? 0xff7a55 : 0xf6cf66, 4); }
      } });
    };

    const attackGate = (unit: CombatUnit, now: number) => {
      if (unit.nextAttack > now || gateHp <= 0) return;
      unit.nextAttack = now + unit.cooldown;
      scene.tweens.add({ targets: unit.sprite, y: unit.sprite.y - 8, duration: 95, yoyo: true, ease: "Quad.out" });
      scene.time.delayedCall(100, () => {
        if (gateHp <= 0 || unit.dead) return;
        gateHp = Math.max(0, gateHp - unit.damage * (unit.squad === "riders" ? 1.2 : 1));
        burst(GATE.x + (unit.id % 5 - 2) * 9, GATE.y + 12, 0xd18b46, 5);
        scene.cameras.main.shake(70, 0.0025);
        if (gateHp === 0) {
          scene.tweens.add({ targets: breachedBackground, alpha: 1, duration: 720 });
          scene.tweens.add({ targets: normalBackground, alpha: 0, duration: 720 });
          scene.cameras.main.shake(620, 0.012);
          burst(GATE.x, GATE.y + 12, 0xffc052, 20);
          setReadout((current) => ({ ...current, event: "The gate is down — clear the courtyard" }));
        }
      });
    };

    const attackUnit = (attacker: CombatUnit, target: CombatUnit, now: number) => {
      if (attacker.nextAttack > now || target.dead) return;
      attacker.nextAttack = now + attacker.cooldown;
      if (attacker.squad === "archers") {
        projectile(attacker.sprite, target, attacker.damage);
        scene.tweens.add({ targets: attacker.sprite, scaleX: attacker.sprite.scaleX * 0.92, scaleY: attacker.sprite.scaleY * 1.05, duration: 100, yoyo: true });
      } else {
        const dx = target.sprite.x - attacker.sprite.x;
        const dy = target.sprite.y - attacker.sprite.y;
        scene.tweens.add({ targets: attacker.sprite, x: attacker.sprite.x + dx * 0.22, y: attacker.sprite.y + dy * 0.22, angle: dx > 0 ? 8 : -8, duration: 105, yoyo: true, ease: "Quad.out" });
        scene.time.delayedCall(105, () => {
          if (!attacker.dead && !target.dead) { damageUnit(target, attacker.damage); burst(target.sprite.x, target.sprite.y - 5, 0xffba68, 5); }
        });
      }
    };

    const moveToward = (unit: CombatUnit, x: number, y: number, delta: number, stopAt = 6) => {
      const dx = x - unit.sprite.x;
      const dy = y - unit.sprite.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= stopAt) return true;
      const step = Math.min(dist - stopAt, unit.speed * (delta / 1000));
      unit.sprite.x += (dx / dist) * step;
      unit.sprite.y += (dy / dist) * step;
      unit.sprite.setFlipX(unit.team === "enemy" ? dx < 0 : dx < 0);
      syncUnitVisual(unit);
      return false;
    };

    const nearestUnit = (unit: CombatUnit, candidates: CombatUnit[]) => candidates.reduce<CombatUnit | null>((best, candidate) => {
      if (candidate.dead) return best;
      return !best || distance(unit.sprite, candidate.sprite) < distance(unit.sprite, best.sprite) ? candidate : best;
    }, null);

    const resolveCrowding = (activeUnits: CombatUnit[]) => {
      for (let i = 0; i < activeUnits.length; i += 1) {
        for (let j = i + 1; j < activeUnits.length; j += 1) {
          const first = activeUnits[i];
          const second = activeUnits[j];
          const dx = second.sprite.x - first.sprite.x;
          const dy = second.sprite.y - first.sprite.y;
          const dist = Math.max(0.01, Math.hypot(dx, dy));
          const minimum = first.squad === "riders" || second.squad === "riders" ? 18 : 13;
          if (dist >= minimum) continue;
          const push = (minimum - dist) * 0.32;
          const pushX = (dx / dist) * push;
          const pushY = (dy / dist) * push;
          first.sprite.x = Phaser.Math.Clamp(first.sprite.x - pushX, 26, WIDTH - 26);
          first.sprite.y = Phaser.Math.Clamp(first.sprite.y - pushY, 175, 715);
          second.sprite.x = Phaser.Math.Clamp(second.sprite.x + pushX, 26, WIDTH - 26);
          second.sprite.y = Phaser.Math.Clamp(second.sprite.y + pushY, 175, 715);
          syncUnitVisual(first);
          syncUnitVisual(second);
        }
      }
    };

    const issueOrder = (squad: TroopId, x: number, y: number) => {
      selectedSquad = squad;
      setSelected(squad);
      for (const unit of units) {
        if (!unit.dead && unit.squad === squad) {
          const spread = squad === "riders" ? 28 : 22;
          unit.commandX = Phaser.Math.Clamp(x + ((unit.id % 5) - 2) * spread * 0.42, 32, WIDTH - 32);
          unit.commandY = Phaser.Math.Clamp(y + ((Math.floor(unit.id / 5) % 4) - 1.5) * 12, 175, 695);
          unit.commandUntil = battleElapsed + 8500;
        }
      }
      const marker = scene.add.circle(x, y, 17, 0x1da3a2, 0.22).setStrokeStyle(2, 0xb9fff6, 1).setDepth(920);
      scene.tweens.add({ targets: marker, scale: 2.25, alpha: 0, duration: 780, onComplete: () => marker.destroy() });
      setReadout((current) => ({ ...current, event: `${troopDetails[squad].label} moving to your rally point` }));
    };

    scene.preload = function preload() {
      this.load.image("outer-wall", "/art/outer-wall-empty.png");
      this.load.image("outer-wall-breached", "/art/outer-wall-breached.png");
      this.load.image("unit-vanguard", "/art/unit-vanguard.png");
      this.load.image("unit-archer", "/art/unit-archer.png");
      this.load.image("unit-rider", "/art/unit-rider.png");
      this.load.image("unit-defender", "/art/unit-defender.png");
    };

    scene.create = function create() {
      normalBackground = this.add.image(WIDTH / 2, HEIGHT / 2, "outer-wall").setDisplaySize(WIDTH, HEIGHT).setDepth(-10);
      breachedBackground = this.add.image(WIDTH / 2, HEIGHT / 2, "outer-wall-breached").setDisplaySize(WIDTH, HEIGHT).setDepth(-9).setAlpha(0);
      const allyLayout: Array<[TroopId, number, number, number]> = [
        ["vanguard", 16, 195, 640], ["archers", 16, 92, 690], ["riders", 8, 302, 678],
      ];
      for (const [squad, count, centerX, centerY] of allyLayout) {
        for (let i = 0; i < count; i += 1) {
          const columns = squad === "riders" ? 3 : 4;
          const unit = createUnit("ally", squad, centerX + (i % columns - (columns - 1) / 2) * (squad === "riders" ? 24 : 20), centerY + Math.floor(i / columns) * 22, i * 70);
          unit.commandX = squad === "riders" ? 308 : squad === "archers" ? 128 : 195;
          unit.commandY = squad === "archers" ? 440 : 300;
          unit.commandUntil = battleElapsed + 12000;
        }
      }

      for (let i = 0; i < 30; i += 1) {
        const column = i % 6;
        createUnit("enemy", "defenders", 92 + column * 41 + (Math.floor(i / 6) % 2) * 10, 285 + Math.floor(i / 6) * 32, i * 65);
      }

      this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        if (won || retreating || this.scene.isPaused()) return;
        const allyHit = living("ally").find((unit) => distance(unit.sprite, { x: pointer.worldX, y: pointer.worldY }) < 25);
        if (allyHit && allyHit.squad !== "defenders") {
          const squad = allyHit.squad as TroopId;
          selectedSquad = squad;
          setSelected(squad);
          setReadout((current) => ({ ...current, event: `${troopDetails[squad].label} selected — tap a destination` }));
          return;
        }
        issueOrder(selectedSquad, pointer.worldX, pointer.worldY);
      });

      controllerRef.current = {
        selectSquad: (squad) => {
          selectedSquad = squad;
          setSelected(squad);
          units.forEach(drawHealth);
          setReadout((current) => ({ ...current, event: `${troopDetails[squad].label} selected — tap the battlefield` }));
        },
        setPaused: (shouldPause) => {
          if (shouldPause) game.scene.pause("outer-wall-combat");
          else game.scene.resume("outer-wall-combat");
        },
        retreat: () => {
          if (retreating || won) return;
          retreating = true;
          setWithdrawing(true);
          game.scene.resume("outer-wall-combat");
          setReadout((current) => ({ ...current, event: "Withdrawal ordered — squads are breaking contact" }));
          this.time.delayedCall(4200, () => retreatRef.current());
        },
      };
    };

    scene.update = function update(_gameTime: number, delta: number) {
      battleElapsed += Math.min(delta, 50);
      const time = battleElapsed;
      if (won) return;
      const allies = living("ally");
      const enemies = living("enemy");
      const elapsed = battleElapsed;

      if (retreating) {
        for (const unit of allies) moveToward(unit, unit.sprite.x, 790, delta, 0);
      } else {
        for (const unit of allies) {
          const target = nearestUnit(unit, enemies);
          const targetDistance = target ? distance(unit.sprite, target.sprite) : Number.POSITIVE_INFINITY;
          const followingOrder = unit.commandUntil > time && distance(unit.sprite, { x: unit.commandX, y: unit.commandY }) > 8 && targetDistance > unit.range + 18;
          if (followingOrder) moveToward(unit, unit.commandX, unit.commandY, delta, 6);
          else if (target && targetDistance <= unit.range) attackUnit(unit, target, time);
          else if (target && gateHp <= 0) moveToward(unit, target.sprite.x, target.sprite.y, delta, unit.range * 0.82);
          else if (target && targetDistance < 125) moveToward(unit, target.sprite.x, target.sprite.y, delta, unit.range * 0.82);
          else if (gateHp > 0) {
            if (distance(unit.sprite, GATE) <= unit.range + 23) attackGate(unit, time);
            else moveToward(unit, GATE.x + ((unit.id % 7) - 3) * 8, GATE.y + 18, delta, unit.range + 12);
          } else if (target) moveToward(unit, target.sprite.x, target.sprite.y, delta, unit.range * 0.82);
          syncUnitVisual(unit);
        }

        for (const unit of enemies) {
          const target = nearestUnit(unit, allies);
          if (!target) continue;
          const targetDistance = distance(unit.sprite, target.sprite);
          if (targetDistance <= unit.range) attackUnit(unit, target, time);
          else moveToward(unit, target.sprite.x, target.sprite.y, delta, unit.range * 0.84);
          syncUnitVisual(unit);
        }

        if (time >= nextTowerShot && allies.length) {
          nextTowerShot = time + (plan.entry === "West Ridge" ? 1480 : 1080);
          const target = allies.reduce((weakest, unit) => unit.hp / unit.maxHp < weakest.hp / weakest.maxHp ? unit : weakest);
          const tower = time % 2640 < 1320 ? { x: 78, y: 158 } : { x: 312, y: 158 };
          projectile(tower, target, 12, true);
        }

        if (!reinforcementsSent && elapsed > 16000) {
          reinforcementsSent = true;
          totalEnemySpawned += 8;
          for (let i = 0; i < 8; i += 1) createUnit("enemy", "defenders", 120 + i * 21, 236 - (i % 2) * 10, time + i * 65);
          setReadout((current) => ({ ...current, event: "Ironwatch reserves are pouring through the gate" }));
        }

        if (reinforcementsSent && !reserveCounterattackSent && (gateHp < gateMaxHp * 0.6 || elapsed > 30000)) {
          reserveCounterattackSent = true;
          totalEnemySpawned += 8;
          for (let i = 0; i < 8; i += 1) createUnit("enemy", "defenders", 115 + i * 22, 226 - (i % 2) * 12, time + i * 70);
          setReadout((current) => ({ ...current, event: "Final garrison counterattack — hold the breach" }));
        }
      }

      if (allies.length === 0 && !retreating) {
        retreating = true;
        setWithdrawing(true);
        setReadout((current) => ({ ...current, event: "The assault has broken — retreat" }));
        this.time.delayedCall(2500, () => retreatRef.current());
      }

      resolveCrowding([...allies, ...enemies].filter((unit) => !unit.dead));

      if (!won && gateHp <= 0 && enemies.length === 0 && reserveCounterattackSent) {
        won = true;
        this.cameras.main.flash(500, 245, 202, 112, false);
        const finalReadout: BattleReadout = {
          allied: allies.length, enemies: 0, gate: 0, progress: 100, seconds: Math.round(elapsed / 1000),
          event: "Outer Wall secured",
          squads: {
            vanguard: allies.filter((unit) => unit.squad === "vanguard").length,
            archers: allies.filter((unit) => unit.squad === "archers").length,
            riders: allies.filter((unit) => unit.squad === "riders").length,
          },
        };
        setReadout(finalReadout);
        this.time.delayedCall(900, () => winRef.current(finalReadout));
      }

      if (time - lastUiUpdate > 220) {
        lastUiUpdate = time;
        const gatePercent = Math.round((gateHp / gateMaxHp) * 100);
        const killed = totalEnemySpawned - enemies.length;
        setReadout((current) => ({
          allied: allies.length,
          enemies: enemies.length,
          gate: gatePercent,
          progress: Math.min(99, Math.round((1 - gateHp / gateMaxHp) * 62 + (killed / Math.max(1, totalEnemySpawned)) * 38)),
          seconds: Math.round(elapsed / 1000),
          event: current.event,
          squads: {
            vanguard: allies.filter((unit) => unit.squad === "vanguard").length,
            archers: allies.filter((unit) => unit.squad === "archers").length,
            riders: allies.filter((unit) => unit.squad === "riders").length,
          },
        }));
      }
    };

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: hostRef.current,
      width: WIDTH,
      height: HEIGHT,
      transparent: false,
      render: { antialias: true, pixelArt: false, roundPixels: true },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene,
      banner: false,
    });

    return () => {
      controllerRef.current = null;
      game.destroy(true);
    };
  }, [plan]);

  const togglePause = (next: boolean) => {
    setPaused(next);
    controllerRef.current?.setPaused(next);
  };

  const orderRetreat = () => {
    setPaused(false);
    controllerRef.current?.retreat();
  };

  const planReadout = `${plan.time} · ${plan.style} · ${plan.entry}`;
  const timer = `${Math.floor(readout.seconds / 60)}:${String(readout.seconds % 60).padStart(2, "0")}`;

  return (
    <main className="battle-screen real-combat-screen" data-testid="battle-screen">
      <div ref={hostRef} className="phaser-stage" data-testid="phaser-stage" role="application" aria-label="Live Outer Wall battle. Select a squad, then tap the battlefield to redirect it." />

      <header className="battle-hud live-battle-hud">
        <div className="scene-status"><span>Live assault · {timer}</span><strong>Outer Wall</strong><small>Break the gate and clear the defenders</small></div>
        <div className="battle-progress" aria-label={`${readout.progress} percent secured`}><strong>{readout.progress}%</strong><span>secured</span></div>
        <button type="button" className="hud-icon-button" onClick={() => togglePause(true)} aria-label="Pause battle"><PauseIcon aria-hidden="true" /></button>
      </header>

      <section className="combat-status" aria-label="Live battle status">
        <div><span>Army</span><strong>{readout.allied}</strong></div>
        <div><span>Defenders</span><strong>{readout.enemies}</strong></div>
        <div className="gate-health"><span>Gate</span><strong>{readout.gate}%</strong><i><b style={{ width: `${readout.gate}%` }} /></i></div>
      </section>

      <div className="plan-ribbon live-plan-ribbon"><span>Battle plan</span><strong>{planReadout}</strong></div>
      <div className="combat-event" data-selected={selected ? "true" : "false"}><TargetIcon aria-hidden="true" />{readout.event}</div>

      <nav className="troop-command-bar live-command-bar" aria-label="Army squads">
        <div className="troop-grid">
          {(Object.keys(troopDetails) as TroopId[]).map((squad) => (
            <button type="button" key={squad} className="troop-command" data-selected={selected === squad ? "true" : "false"} onClick={() => controllerRef.current?.selectSquad(squad)}>
              <img src={troopDetails[squad].portrait} alt="" /><span>{troopDetails[squad].label}</span><strong>{readout.squads[squad]}</strong>
            </button>
          ))}
        </div>
        <button type="button" className="retreat-button" onClick={orderRetreat}><ExitIcon aria-hidden="true" />Retreat</button>
      </nav>

      {withdrawing ? <div className="withdrawal-banner"><ExitIcon aria-hidden="true" /><strong>Withdrawal underway</strong><span>Surviving squads are breaking contact</span></div> : null}

      {paused ? (
        <section className="pause-panel" aria-label="Battle paused">
          <button className="pause-close" type="button" onClick={() => togglePause(false)} aria-label="Close pause menu"><Cross2Icon aria-hidden="true" /></button>
          <span>Battle paused</span><h2>Outer Wall</h2><p>{planReadout}<br />{readout.allied} troops against {readout.enemies} defenders · Gate {readout.gate}%</p>
          <button type="button" className="resume-button" onClick={() => togglePause(false)}><ResumeIcon aria-hidden="true" />Resume battle</button>
          <button type="button" className="pause-retreat" onClick={orderRetreat}>Order full retreat</button>
        </section>
      ) : null}
    </main>
  );
}

function BattleCampaign({ plan }: { plan: Plan }) {
  const flow = useFlow();
  const [victory, setVictory] = useState<BattleReadout | null>(null);

  return (
    <>
      <RealTimeOuterWall plan={plan} onWin={setVictory} onRetreat={() => flow.pop()} />
      {victory ? (
        <section className="scene-victory real-victory" aria-live="polite">
          <div className="victory-mark"><CheckIcon aria-hidden="true" /></div>
          <span>Live battle won · {victory.seconds}s</span>
          <h2>Outer Wall breached</h2>
          <p>{victory.allied} troops survived the fight. The gate was destroyed and every defender was cleared.</p>
          <button type="button" onClick={() => flow.pop()}>Return to the war table<ArrowRightIcon aria-hidden="true" /></button>
        </section>
      ) : null}
    </>
  );
}

function CampaignEntry({ fromWorld = false }: { fromWorld?: boolean }) {
  const flow = useFlow();
  return <ScoutScreen onExit={fromWorld ? () => flow.pop() : undefined} renderBattle={(plan) => <BattleCampaign plan={plan} />} />;
}

function CampaignWon({ plan }: { plan: Plan }) {
  const flow = useFlow();
  return (
    <MobileScroll className="campaign-won-screen">
      <main className="campaign-won-content">
        <div className="victory-crest"><CheckIcon aria-hidden="true" /></div>
        <span className="campaign-kicker">Campaign complete</span>
        <h1>The citadel is yours</h1>
        <p>You planned the first strike, steered the formations, and won all three battle scenes.</p>
        <dl>
          <div><dt>Entry</dt><dd>{plan.entry}</dd></div>
          <div><dt>Army</dt><dd>{plan.troops}</dd></div>
          <div><dt>Attack</dt><dd>{plan.time} · {plan.style}</dd></div>
        </dl>
        <button type="button" onClick={() => flow.replace({ id: "new-scout", render: () => <CampaignEntry /> })}>Scout another campaign</button>
      </main>
    </MobileScroll>
  );
}

export default function Prototype() {
  const initial = useMemo(() => {
    const parameters = new URLSearchParams(window.location.search);
    const directBattle = parameters.get("battle") === "outer-wall";
    if (parameters.get("world") === "shared") {
      return {
        id: "shared-world",
        render: (flow: FlowControls) => (
          <SharedWorld onOpenWar={() => flow.push({ id: "world-war-scout", render: () => <CampaignEntry fromWorld /> })} />
        ),
      };
    }
    if (directBattle) {
      const previewPlan: Plan = { entry: "West Ridge", troops: "Balanced Army", time: "Dawn", style: "Flanking Strike" };
      return { id: "outer-wall-preview", render: (_flow: FlowControls) => <BattleCampaign plan={previewPlan} /> };
    }
    return { id: "scout", render: (_flow: FlowControls) => <CampaignEntry /> };
  }, []);
  return <FlowStack initial={initial} />;
}
