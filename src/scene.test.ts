import { describe, expect, it } from "vitest";
import { cloneScene, demoScene, overlaps, parseScene } from "./scene";

describe("scene format", () => {
  it("round-trips the original demo", () => {
    const scene = demoScene();
    expect(parseScene(JSON.stringify(scene))).toEqual(scene);
  });

  it("clones without changing the authored scene", () => {
    const scene = demoScene();
    const clone = cloneScene(scene);
    clone.entities[0].x = 99;
    expect(scene.entities[0].x).toBe(0);
  });

  it.each(["duplicate IDs", "out of bounds", "missing spawn", "extra exit", "invalid kind", "invalid number"])(
    "rejects %s", issue => {
      const scene = demoScene();
      if (issue === "duplicate IDs") scene.entities[1].id = scene.entities[0].id;
      if (issue === "out of bounds") scene.entities[0].x = 1;
      if (issue === "missing spawn") scene.entities = scene.entities.filter(entity => entity.kind !== "spawn");
      if (issue === "extra exit") scene.entities.push({ ...scene.entities.at(-1)!, id: "extra" });
      const data: Record<string, unknown> = JSON.parse(JSON.stringify(scene));
      if (issue === "invalid kind") data.entities = [{ ...scene.entities[0], kind: "enemy" }];
      if (issue === "invalid number") data.width = null;
      expect(() => parseScene(JSON.stringify(data))).toThrow();
    },
  );

  it("does not count touching edges as collisions", () => {
    expect(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
  });
});
