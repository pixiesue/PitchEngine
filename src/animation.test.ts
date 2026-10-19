import { describe, expect, it } from "vitest";
import { advanceAnimation, animationFrame, clips, selectClip, spriteLayout, type AnimationBody, type AnimationState } from "./animation";
import { createRuntime, step, type Input } from "./runtime";
import { demoScene } from "./scene";

const standing: AnimationBody = { grounded: true, vx: 0, vy: 0, h: 52, shot: 0, landing: 0, firing: false };
const idle: Input = { left: false, right: false, jump: false, crouch: false, shoot: false };

describe("player animation", () => {
  it("selects movement and derived airborne poses from physics", () => {
    expect(selectClip(standing)).toBe("idle");
    expect(selectClip({ ...standing, vx: 100 })).toBe("walk");
    expect(selectClip({ ...standing, vx: -270 })).toBe("run");
    expect(selectClip({ ...standing, h: 32 })).toBe("crouch");
    expect(selectClip({ ...standing, h: 32, vx: 65 })).toBe("crouchWalk");
    expect(selectClip({ ...standing, grounded: false, vy: -100 })).toBe("jump");
    expect(selectClip({ ...standing, grounded: false, vy: 100 })).toBe("fall");
  });

  it("uses combined shooting poses without losing locomotion", () => {
    expect(selectClip({ ...standing, shot: 0.12 })).toBe("shoot");
    expect(selectClip({ ...standing, shot: 0.04 })).toBe("aim");
    expect(selectClip({ ...standing, shot: 0.12, vx: 270 })).toBe("runShoot");
    expect(selectClip({ ...standing, firing: true, vx: 100 })).toBe("walkShoot");
    expect(selectClip({ ...standing, shot: 0.12, h: 32 })).toBe("crouchShoot");
    expect(selectClip({ ...standing, firing: true, h: 32, vx: 65 })).toBe("crouchWalkShoot");
    expect(selectClip({ ...standing, firing: true, grounded: false, vy: -100 })).toBe("jumpShoot");
    expect(selectClip({ ...standing, firing: true, grounded: false, vy: 100 })).toBe("fallShoot");
    expect(selectClip({ ...standing, firing: true })).toBe("aim");
  });

  it("holds the final frame of airborne and landing one-shots", () => {
    for (const clip of ["jump", "fall", "land"] as const) {
      const state: AnimationState = { clip, time: 0 };
      advanceAnimation(state, clip, 10);
      expect(animationFrame(state)).toBe(clips[clip].frames.at(-1));
    }
  });

  it("landing feedback never locks movement, crouch, or shooting", () => {
    expect(selectClip({ ...standing, landing: 0.1 })).toBe("land");
    expect(selectClip({ ...standing, landing: 0.1, vx: 270 })).toBe("run");
    expect(selectClip({ ...standing, landing: 0.1, h: 32 })).toBe("crouch");
    expect(selectClip({ ...standing, landing: 0.1, firing: true })).toBe("aim");
  });

  it("advances, loops, and resets only when changing clips", () => {
    const state: AnimationState = { clip: "run", time: 0 };
    advanceAnimation(state, "run", 0.1);
    expect(animationFrame(state)).toBe(7);
    advanceAnimation(state, "run", 0.31);
    expect(animationFrame(state)).toBe(6);
    advanceAnimation(state, "crouchWalk", 0.1);
    expect(state.time).toBe(0);
    expect(animationFrame(state)).toBe(11);
  });

  it("references only valid atlas cells", () => {
    for (const clip of Object.values(clips)) {
      for (const frame of clip.frames) {
        expect(frame).toBeGreaterThanOrEqual(0);
        expect(frame).toBeLessThan(spriteLayout.frameCount);
      }
    }
  });

  it("covers every newly derived frame with a gameplay clip", () => {
    const used = new Set<number>(Object.values(clips).flatMap(clip => [...clip.frames]));
    for (let frame = 16; frame < spriteLayout.frameCount; frame++) expect(used.has(frame)).toBe(true);
  });

  it("detects landing after a jump without changing physics or delaying the next jump", () => {
    const runtime = createRuntime(demoScene());
    step(runtime, idle, 1 / 120);
    step(runtime, { ...idle, jump: true }, 1 / 120);
    expect(runtime.player.vy).toBeLessThan(-680);
    for (let i = 0; i < 160 && !runtime.player.grounded; i++) step(runtime, idle, 1 / 120);
    expect(runtime.player.landing).toBeCloseTo(2 / 12);
    expect(runtime.player.animation.clip).toBe("land");
    expect(runtime.player.y).toBe(588);
    step(runtime, { ...idle, jump: true }, 1 / 120);
    expect(runtime.player.animation.clip).toBe("jump");
  });

  it("starts a fresh animation on retry and freezes after playtest completion", () => {
    const runtime = createRuntime(demoScene());
    for (let i = 0; i < 40; i++) step(runtime, { ...idle, right: true }, 1 / 120);
    expect(runtime.player.animation.clip).toBe("run");
    expect(runtime.player.animation.time).toBeGreaterThan(0);
    runtime.status = "won";
    const before = { ...runtime.player.animation };
    step(runtime, idle, 1);
    expect(runtime.player.animation).toEqual(before);
    expect(createRuntime(runtime.scene).player.animation).toEqual({ clip: "idle", time: 0 });
  });

  it("reacts to actual shots, not attempts during cooldown", () => {
    const runtime = createRuntime(demoScene());
    step(runtime, idle, 1 / 120);
    step(runtime, { ...idle, shoot: true }, 1 / 120);
    expect(runtime.player.animation.clip).toBe("shoot");
    expect(runtime.player.shot).toBe(0.12);
    step(runtime, { ...idle, shoot: true }, 1 / 120);
    expect(runtime.player.shot).toBeLessThan(0.12);
  });
});
