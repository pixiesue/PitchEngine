import { describe, expect, it } from "vitest";
import { demoScene, type Scene } from "./scene";
import { canSeePlayer, createRuntime, lineBlocked, step, type Input, type Runtime } from "./runtime";

const idle: Input = { left: false, right: false, jump: false, crouch: false, shoot: false };
function advance(runtime: Runtime, seconds: number, input: Partial<Input> = {}): void {
  for (let i = 0; i < Math.round(seconds * 120); i++) step(runtime, { ...idle, ...input }, 1 / 120);
}
function emptyLevel(): Scene {
  const scene = demoScene();
  scene.entities = scene.entities.filter(entity => ["platform", "spawn", "exit"].includes(entity.kind));
  scene.entities = scene.entities.filter(entity => entity.kind !== "platform" || entity.y === 640);
  return scene;
}

describe("platform runtime", () => {
  it("lands on the ground and preserves authored objects", () => {
    const scene = demoScene();
    const before = JSON.stringify(scene);
    const runtime = createRuntime(scene);
    advance(runtime, 1);
    expect(runtime.player.y).toBe(588);
    expect(runtime.player.grounded).toBe(true);
    expect(JSON.stringify(scene)).toBe(before);
  });

  it("jumps only on a fresh press, then lands without auto-jumping", () => {
    const runtime = createRuntime(emptyLevel());
    advance(runtime, 0.1);
    advance(runtime, 0.25, { jump: true });
    expect(runtime.player.y).toBeLessThan(500);
    advance(runtime, 1.5, { jump: true });
    expect(runtime.player.grounded).toBe(true);
    expect(runtime.player.y).toBe(588);
  });

  it("keeps the player inside horizontal world bounds", () => {
    const runtime = createRuntime(emptyLevel());
    advance(runtime, 2, { left: true });
    expect(runtime.player.x).toBe(0);
  });

  it("does not stand up through a low ceiling", () => {
    const scene = emptyLevel();
    const runtime = createRuntime(scene);
    advance(runtime, 0.1, { crouch: true });
    runtime.scene.entities.push({ id: "ceiling", kind: "platform", x: 80, y: 570, w: 100, h: 32, patrol: 0 });
    advance(runtime, 0.1);
    expect(runtime.player.h).toBe(32);
  });

  it("freezes after extraction and can restart from the same scene", () => {
    const scene = emptyLevel();
    const runtime = createRuntime(scene);
    advance(runtime, 10, { right: true });
    expect(runtime.status).toBe("won");
    const x = runtime.player.x;
    advance(runtime, 1, { left: true });
    expect(runtime.player.x).toBe(x);
    expect(createRuntime(scene).status).toBe("playing");
  });

  it("fails when falling out of the world", () => {
    const scene = emptyLevel();
    scene.entities = scene.entities.filter(entity => entity.kind !== "platform");
    const runtime = createRuntime(scene);
    advance(runtime, 1);
    expect(runtime.status).toBe("lost");
  });
});

describe("stealth and combat", () => {
  it("treats a zero patrol radius as a stationary sentry", () => {
    const runtime = createRuntime(demoScene());
    const guard = runtime.guards[0];
    guard.patrol = 0;
    advance(runtime, 1);
    expect(guard.x).toBe(guard.home);
    expect(guard.facing).toBe(-1);
  });

  it("conceals a crouching player in cover, then reveals them when shooting", () => {
    const runtime = createRuntime(demoScene());
    runtime.player.x = 320;
    advance(runtime, 0.1, { crouch: true });
    expect(runtime.player.hidden).toBe(true);
    advance(runtime, 1 / 120, { crouch: true, shoot: true });
    expect(runtime.player.hidden).toBe(false);
    expect(runtime.guards[0].awareness).toBeGreaterThan(0.9);
  });

  it("requires facing, clear line of sight, and exposure to detect the player", () => {
    const runtime = createRuntime(demoScene());
    const guard = runtime.guards[0];
    runtime.player.x = guard.x - 100;
    expect(canSeePlayer(runtime, guard)).toBe(true);
    guard.facing = 1;
    expect(canSeePlayer(runtime, guard)).toBe(false);
    guard.facing = -1;
    runtime.player.hidden = true;
    expect(canSeePlayer(runtime, guard)).toBe(false);
    runtime.player.hidden = false;
    runtime.scene.entities.push({ id: "wall", kind: "platform", x: 590, y: 500, w: 16, h: 140, patrol: 0 });
    expect(canSeePlayer(runtime, guard)).toBe(false);
  });

  it("computes exact sight blocking without sample gaps", () => {
    expect(lineBlocked(0, 10, 200, 10, [{ x: 99, y: 0, w: 1, h: 20 }])).toBe(true);
    expect(lineBlocked(0, 30, 200, 30, [{ x: 99, y: 0, w: 1, h: 20 }])).toBe(false);
    expect(lineBlocked(10, 0, 10, 100, [{ x: 0, y: 40, w: 20, h: 20 }])).toBe(true);
  });

  it("uses two shots to defeat a guard", () => {
    const scene = emptyLevel();
    scene.entities.push({ id: "target", kind: "guard", x: 250, y: 584, w: 32, h: 56, patrol: 0 });
    const runtime = createRuntime(scene);
    advance(runtime, 0.6, { shoot: true });
    expect(runtime.guards[0].health).toBe(0);
    expect(runtime.kills).toBe(1);
  });

  it("blocks bullets with platforms", () => {
    const scene = emptyLevel();
    scene.entities.push({ id: "wall", kind: "platform", x: 180, y: 500, w: 16, h: 140, patrol: 0 });
    scene.entities.push({ id: "target", kind: "guard", x: 250, y: 584, w: 32, h: 56, patrol: 0 });
    const runtime = createRuntime(scene);
    advance(runtime, 1, { shoot: true });
    expect(runtime.guards[0].health).toBe(2);
    expect(runtime.player.health).toBe(4);
  });

  it("lets alerted guards damage the player", () => {
    const scene = emptyLevel();
    scene.entities.push({ id: "target", kind: "guard", x: 250, y: 584, w: 32, h: 56, patrol: 40 });
    const runtime = createRuntime(scene);
    advance(runtime, 2);
    expect(runtime.player.health).toBeLessThan(4);
  });

  it("supports a complete combat route through the demo", () => {
    const runtime = createRuntime(demoScene());
    advance(runtime, 12, { right: true, shoot: true });
    expect(runtime.status).toBe("won");
    expect(runtime.kills).toBeGreaterThan(0);
  });

  it("supports a complete no-kill elevated route through the demo", () => {
    const runtime = createRuntime(demoScene());
    const jumps = [320, 608, 944, 1350, 1680, 1952];
    let nextJump = 0;
    const damage: { x: number; y: number; time: number }[] = [];
    for (let i = 0; i < 120 * 12 && runtime.status === "playing"; i++) {
      const jump = nextJump < jumps.length && runtime.player.x >= jumps[nextJump] && runtime.player.grounded;
      if (jump) nextJump++;
      const health = runtime.player.health;
      step(runtime, { ...idle, right: true, jump }, 1 / 120);
      if (runtime.player.health < health) damage.push({ x: runtime.player.x, y: runtime.player.y, time: runtime.time });
    }
    expect(runtime.status).toBe("won");
    expect(runtime.kills).toBe(0);
    expect(runtime.player.health, JSON.stringify(damage)).toBe(4);
  });
});
