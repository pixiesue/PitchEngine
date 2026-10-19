import { describe, expect, it } from "vitest";
import { bundledCharacter, advanceAnimation, animationFrame, clips, type AnimationState } from "./animation";
import { parseCharacter, parseCharacterPackage, requiredClips, type CharacterAsset } from "./character";
import { demoScene, parseScene } from "./scene";
import { createRuntime, step, type Input } from "./runtime";

function fixture(): CharacterAsset {
  const asset = structuredClone(bundledCharacter);
  for (const clip of asset.clips) for (const frame of clip.frames) frame.durationMs = Math.round(frame.durationMs);
  return asset;
}
const idle: Input = { left: false, right: false, jump: false, crouch: false, shoot: false };

describe("portable character adapter", () => {
  it("keeps the exporter profile aligned with all engine semantic clips", () => {
    expect([...requiredClips].sort()).toEqual(Object.keys(clips).sort());
  });

  it("validates and retains markers without executing them", () => {
    const asset = fixture();
    asset.frames[0].hitboxes = [{ id: "body", kind: "hurt", rect: { x: 0, y: 0, w: 20, h: 20 } }];
    asset.clips[0].events = [{ id: "fire", timeMs: 0 }];
    expect(parseCharacter(asset)).toEqual(asset);
  });

  it.each(["path", "duplicate-frame", "missing-clip", "bounds", "timing", "reference", "socket", "event", "budget"])(
    "rejects %s", reason => {
      const asset = fixture();
      if (reason === "path") asset.image = "../character.png";
      if (reason === "duplicate-frame") asset.frames[1].id = asset.frames[0].id;
      if (reason === "missing-clip") asset.clips.shift();
      if (reason === "bounds") asset.frames[0].rect.x = asset.width;
      if (reason === "timing") asset.clips[0].frames[0].durationMs = 0;
      if (reason === "reference") asset.clips[0].frames[0].frameId = "missing";
      if (reason === "socket") asset.frames[0].sockets.muzzle.x = -1;
      if (reason === "event") asset.clips[0].events.push({ id: "fire", timeMs: 90000 });
      if (reason === "budget") asset.width = 4097;
      expect(() => parseCharacter(asset)).toThrow("Invalid character");
    },
  );

  it("plays uneven frame durations and exact loop boundaries", () => {
    const asset = fixture();
    const run = asset.clips.find(clip => clip.id === "run")!;
    run.frames = [{ frameId: "frame-6", durationMs: 50 }, { frameId: "frame-7", durationMs: 150 }];
    const state: AnimationState = { clip: "run", time: 0 };
    advanceAnimation(state, "run", 0.05, asset);
    expect(animationFrame(state, asset)).toBe(7);
    advanceAnimation(state, "run", 0.15, asset);
    expect(animationFrame(state, asset)).toBe(6);
    run.playback = "once-hold";
    advanceAnimation(state, "run", 1, asset);
    expect(animationFrame(state, asset)).toBe(7);
  });

  it("round-trips embedded character data and accepts old geometry-only scenes", () => {
    const scene = demoScene();
    expect(parseScene(JSON.stringify(scene)).character).toBeUndefined();
    scene.character = { metadata: fixture(), imageData: "data:image/png;base64,AAAA" };
    expect(parseScene(JSON.stringify(scene)).character).toEqual(scene.character);
    expect(() => parseCharacterPackage({ ...scene.character, imageData: "https://example.com/art.png" })).toThrow();
  });

  it("metadata does not override combat or collision authority", () => {
    const scene = demoScene();
    scene.character = { metadata: fixture(), imageData: "data:image/png;base64,AAAA" };
    const exported = createRuntime(scene);
    const baseline = createRuntime(demoScene());
    for (let i = 0; i < 240; i++) {
      const input = { ...idle, right: true, shoot: true };
      step(exported, input, 1 / 120);
      step(baseline, input, 1 / 120);
    }
    const { animation: _exportedAnimation, ...exportedPlayer } = exported.player;
    const { animation: _baselineAnimation, ...baselinePlayer } = baseline.player;
    expect(exportedPlayer).toEqual(baselinePlayer);
    expect(exported.bullets).toEqual(baseline.bullets);
    expect(exported.guards).toEqual(baseline.guards);
  });
});
