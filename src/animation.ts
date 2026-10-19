import type { CharacterAsset } from "./character";

export const clips = {
  idle: { frames: [0], fps: 1, loop: true },
  walk: { frames: [2, 3, 4, 5], fps: 7, loop: true },
  run: { frames: [6, 7, 8, 9], fps: 10, loop: true },
  crouch: { frames: [10], fps: 1, loop: true },
  crouchWalk: { frames: [11, 12, 13], fps: 7, loop: true },
  jump: { frames: [16, 17], fps: 8, loop: false },
  fall: { frames: [18, 19], fps: 8, loop: false },
  land: { frames: [20, 21], fps: 12, loop: false },
  aim: { frames: [14], fps: 1, loop: true },
  shoot: { frames: [15], fps: 1, loop: true },
  runShoot: { frames: [22, 23, 24, 25], fps: 10, loop: true },
  walkShoot: { frames: [26, 27, 28, 29], fps: 7, loop: true },
  crouchShoot: { frames: [30], fps: 1, loop: true },
  crouchWalkShoot: { frames: [31, 32, 33], fps: 7, loop: true },
  jumpShoot: { frames: [34, 35], fps: 8, loop: false },
  fallShoot: { frames: [36, 37], fps: 8, loop: false },
} as const;

export type Clip = keyof typeof clips;
export interface AnimationState {
  clip: Clip;
  time: number;
}

export interface AnimationBody {
  grounded: boolean;
  vx: number;
  vy: number;
  h: number;
  shot: number;
  landing: number;
  firing: boolean;
}

export function selectClip(body: AnimationBody): Clip {
  const armed = body.firing || body.shot > 0;
  if (!body.grounded) return body.vy < 0 ? armed ? "jumpShoot" : "jump" : armed ? "fallShoot" : "fall";
  if (body.h <= 32) {
    if (Math.abs(body.vx) > 1) return armed ? "crouchWalkShoot" : "crouchWalk";
    return armed ? "crouchShoot" : "crouch";
  }
  if (Math.abs(body.vx) > 1) {
    if (Math.abs(body.vx) < 180) return armed ? "walkShoot" : "walk";
    return armed ? "runShoot" : "run";
  }
  if (armed) return body.shot > 0.07 ? "shoot" : "aim";
  if (body.landing > 0) return "land";
  return "idle";
}

export function advanceAnimation(state: AnimationState, clip: Clip, dt: number, asset = bundledCharacter): void {
  if (state.clip !== clip) {
    state.clip = clip;
    state.time = 0;
  } else {
    const definition = asset.clips.find(item => item.id === clip);
    if (!definition) throw new Error(`Character missing animation ${clip}.`);
    const duration = definition.frames.reduce((sum, frame) => sum + frame.durationMs, 0) / 1000;
    state.time = definition.playback === "loop" ? (state.time + dt) % duration : Math.min(state.time + dt, duration);
  }
}

export function animationFrame(state: AnimationState, asset = bundledCharacter): number {
  const clip = asset.clips.find(item => item.id === state.clip);
  if (!clip) throw new Error(`Character missing animation ${state.clip}.`);
  const duration = clip.frames.reduce((sum, frame) => sum + frame.durationMs, 0);
  let time = state.time * 1000;
  if (clip.playback === "loop") time %= duration;
  let frameId = clip.frames.at(-1)!.frameId;
  for (const frame of clip.frames) {
    if (time < frame.durationMs - 1e-7) { frameId = frame.frameId; break; }
    time -= frame.durationMs;
  }
  const index = asset.frames.findIndex(frame => frame.id === frameId);
  if (index < 0) throw new Error(`Character missing frame ${frameId}.`);
  return index;
}

export function muzzlePosition(crouched: boolean): { x: number; y: number } {
  return { x: 90, y: crouched ? -108 : -139 };
}

export const spriteLayout = { width: 256, height: 224, columns: 4, rows: 10, frameCount: 38,
  anchorX: 96, anchorY: 216, scale: 0.28 };

export const bundledCharacter: CharacterAsset = {
  version: 1, image: "player.png", imageHash: "0".repeat(64),
  width: 1024, height: 2240, canvas: { width: 256, height: 224 }, displayScale: 0.28,
  frames: Array.from({ length: spriteLayout.frameCount }, (_, index) => ({
    id: `frame-${index}`, rect: { x: index % 4 * 256, y: Math.floor(index / 4) * 224, w: 256, h: 224 },
    anchor: { x: 96, y: 216 }, sockets: { muzzle: { x: 186, y: index >= 30 && index <= 33 ? 108 : 77 } },
  })),
  clips: Object.entries(clips).map(([id, clip]) => ({
    id, playback: clip.loop ? "loop" : "once-hold",
    frames: clip.frames.map(index => ({ frameId: `frame-${index}`, durationMs: 1000 / clip.fps })),
    events: [],
  })),
};
