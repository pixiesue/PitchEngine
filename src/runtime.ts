import { cloneScene, overlaps, type Entity, type Rect, type Scene } from "./scene";
import { advanceAnimation, selectClip, type AnimationState } from "./animation";

export interface Input {
  left: boolean;
  right: boolean;
  moveX?: number;
  jump: boolean;
  crouch: boolean;
  shoot: boolean;
}

interface Body extends Rect {
  vx: number;
  vy: number;
  grounded: boolean;
}

export interface Guard extends Body {
  id: string;
  home: number;
  patrol: number;
  facing: number;
  health: number;
  awareness: number;
  cooldown: number;
}

export interface Bullet extends Rect {
  vx: number;
  owner: "player" | "guard";
  life: number;
}

export interface Runtime {
  scene: Scene;
  player: Body & { facing: number; health: number; hidden: boolean; cooldown: number; hurt: number;
    shot: number; landing: number; firing: boolean; animation: AnimationState };
  guards: Guard[];
  bullets: Bullet[];
  status: "playing" | "won" | "lost";
  previousJump: boolean;
  time: number;
  kills: number;
}

export function createRuntime(scene: Scene): Runtime {
  const spawn = scene.entities.find(entity => entity.kind === "spawn");
  if (!spawn) throw new Error("Cannot play a level without a player spawn.");
  return {
    scene: cloneScene(scene),
    player: { x: spawn.x, y: spawn.y, w: 32, h: 52, vx: 0, vy: 0,
      grounded: false, facing: 1, health: 4, hidden: false, cooldown: 0, hurt: 0,
      shot: 0, landing: 0, firing: false, animation: { clip: "idle", time: 0 } },
    guards: scene.entities.filter(entity => entity.kind === "guard").map(entity => ({
      ...entity, home: entity.x, facing: -1, health: 2, awareness: 0, cooldown: 0,
      vx: 0, vy: 0, grounded: false,
    })),
    bullets: [], status: "playing", previousJump: false, time: 0, kills: 0,
  };
}

function move(body: Body, platforms: Entity[], dt: number, width: number): void {
  body.x += body.vx * dt;
  for (const platform of platforms) {
    if (overlaps(body, platform)) {
      if (body.vx > 0) body.x = platform.x - body.w;
      else if (body.vx < 0) body.x = platform.x + platform.w;
      body.vx = 0;
    }
  }
  body.x = Math.max(0, Math.min(width - body.w, body.x));
  body.vy += 1500 * dt;
  body.y += body.vy * dt;
  body.grounded = false;
  for (const platform of platforms) {
    if (overlaps(body, platform)) {
      if (body.vy > 0) {
        body.y = platform.y - body.h;
        body.grounded = true;
      } else if (body.vy < 0) {
        body.y = platform.y + platform.h;
      }
      body.vy = 0;
    }
  }
}

export function lineBlocked(x1: number, y1: number, x2: number, y2: number, walls: Rect[]): boolean {
  return walls.some(wall => {
    let near = 0;
    let far = 1;
    for (const [start, delta, low, high] of [
      [x1, x2 - x1, wall.x, wall.x + wall.w],
      [y1, y2 - y1, wall.y, wall.y + wall.h],
    ]) {
      if (delta === 0) {
        if (start < low || start > high) return false;
      } else {
        const a = (low - start) / delta;
        const b = (high - start) / delta;
        near = Math.max(near, Math.min(a, b));
        far = Math.min(far, Math.max(a, b));
        if (near > far) return false;
      }
    }
    return true;
  });
}

export function canSeePlayer(runtime: Runtime, guard: Guard): boolean {
  const p = runtime.player;
  if (p.hidden || guard.health <= 0) return false;
  const dx = p.x + p.w / 2 - (guard.x + guard.w / 2);
  const dy = p.y + p.h / 2 - (guard.y + 18);
  return dx * guard.facing > 0 && Math.abs(dx) < 340 &&
    Math.abs(dy) < Math.abs(dx) * 0.5 + 16 &&
    !lineBlocked(guard.x + guard.w / 2, guard.y + 18,
      p.x + p.w / 2, p.y + p.h / 2,
      runtime.scene.entities.filter(entity => entity.kind === "platform"));
}

function fire(runtime: Runtime, body: Rect, facing: number, owner: Bullet["owner"]): void {
  runtime.bullets.push({
    x: facing > 0 ? body.x + body.w : body.x - 10, y: body.y + body.h * 0.42,
    w: 10, h: 4, vx: facing * 800, owner, life: 2,
  });
}

export function step(runtime: Runtime, input: Input, dt: number): void {
  if (runtime.status !== "playing") return;
  const p = runtime.player;
  const platforms = runtime.scene.entities.filter(entity => entity.kind === "platform");
  runtime.time += dt;
  p.cooldown = Math.max(0, p.cooldown - dt);
  p.hurt = Math.max(0, p.hurt - dt);
  p.shot = Math.max(0, p.shot - dt);
  p.landing = Math.max(0, p.landing - dt);
  p.firing = input.shoot;
  const height = input.crouch ? 32 : 52;
  if (height !== p.h) {
    const next = { ...p, y: p.y + p.h - height, h: height };
    if (!platforms.some(platform => overlaps(next, platform))) {
      p.y = next.y;
      p.h = height;
    }
  }
  p.vx = (input.moveX ?? (Number(input.right) - Number(input.left))) * (input.crouch ? 130 : 270);
  if (p.vx !== 0) p.facing = Math.sign(p.vx);
  if (input.jump && !runtime.previousJump && p.grounded && !input.crouch) p.vy = -700;
  runtime.previousJump = input.jump;
  const wasGrounded = p.grounded;
  const fallingSpeed = p.vy;
  move(p, platforms, dt, runtime.scene.width);
  if (!wasGrounded && p.grounded && fallingSpeed > 100) p.landing = 2 / 12;
  p.hidden = input.crouch && p.grounded && !input.shoot &&
    runtime.scene.entities.some(entity => entity.kind === "cover" && overlaps(p, entity));
  if (input.shoot && p.cooldown === 0) {
    fire(runtime, p, p.facing, "player");
    p.shot = 0.12;
    p.cooldown = 0.22;
    for (const guard of runtime.guards) {
      if (guard.health > 0 && Math.abs(guard.x - p.x) < 480) {
        guard.facing = p.x < guard.x ? -1 : 1;
        guard.awareness = 1;
      }
    }
  }
  for (const guard of runtime.guards) {
    if (guard.health <= 0) continue;
    if (guard.patrol > 0) {
      if (guard.x <= Math.max(0, guard.home - guard.patrol)) guard.facing = 1;
      if (guard.x >= Math.min(runtime.scene.width - guard.w, guard.home + guard.patrol)) guard.facing = -1;
    }
    const visible = canSeePlayer(runtime, guard);
    guard.awareness = Math.max(0, Math.min(1, guard.awareness + (visible ? dt * 1.8 : -dt * 0.35)));
    guard.cooldown = Math.max(0, guard.cooldown - dt);
    guard.vx = guard.awareness >= 1 || guard.patrol === 0 ? 0 : guard.facing * 58;
    const wasMoving = guard.vx !== 0;
    move(guard, platforms, dt, runtime.scene.width);
    if (wasMoving && guard.vx === 0) guard.facing *= -1;
    if (guard.y > runtime.scene.height) {
      guard.health = 0;
      continue;
    }
    if (visible && guard.awareness >= 1 && guard.cooldown === 0) {
      fire(runtime, guard, guard.facing, "guard");
      guard.cooldown = 0.85;
    }
  }
  for (const bullet of runtime.bullets) {
    const oldX = bullet.x;
    bullet.x += bullet.vx * dt;
    bullet.life -= dt;
    const sweep = { ...bullet, x: Math.min(oldX, bullet.x), w: bullet.w + Math.abs(bullet.x - oldX) };
    if (platforms.some(platform => overlaps(sweep, platform))) {
      bullet.life = 0;
      continue;
    }
    if (bullet.owner === "player") {
      const hit = runtime.guards.filter(guard => guard.health > 0 && overlaps(sweep, guard))
        .sort((a, b) => bullet.vx > 0 ? a.x - b.x : b.x - a.x)[0];
      if (hit) {
        hit.health -= 1;
        hit.awareness = 1;
        hit.facing = p.x < hit.x ? -1 : 1;
        if (hit.health === 0) runtime.kills += 1;
        bullet.life = 0;
      }
    } else if (overlaps(sweep, p)) {
      if (p.hurt === 0) {
        p.health -= 1;
        p.hurt = 0.6;
      }
      bullet.life = 0;
    }
  }
  runtime.bullets = runtime.bullets.filter(bullet => bullet.life > 0);
  advanceAnimation(p.animation, selectClip(p), dt, runtime.scene.character?.metadata);
  if (p.health <= 0 || p.y > runtime.scene.height) runtime.status = "lost";
  else if (runtime.scene.entities.some(entity => entity.kind === "exit" && overlaps(p, entity))) {
    runtime.status = "won";
  }
}
