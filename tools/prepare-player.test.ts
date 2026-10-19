import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { spriteLayout } from "../src/animation";

describe("prepared player sheet", () => {
  const image = PNG.sync.read(readFileSync(new URL("../public/player.png", import.meta.url)));

  it("matches the runtime layout and includes transparent margins on every frame", () => {
    const { width, height, columns, rows, frameCount } = spriteLayout;
    expect(image.width).toBe(width * columns);
    expect(image.height).toBe(height * rows);
    for (let frame = 0; frame < frameCount; frame++) {
      const left = frame % columns * width;
      const top = Math.floor(frame / columns) * height;
      let visible = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const alpha = image.data[((top + y) * image.width + left + x) * 4 + 3];
          if (alpha > 0) visible++;
          if (x === 0 || y === 0 || x === width - 1 || y === height - 1) expect(alpha).toBe(0);
        }
      }
      expect(visible, `frame ${frame}`).toBeGreaterThan(1000);
    }
  });

  it("has unique derived poses instead of duplicating the placeholders", () => {
    const { width, height, columns, frameCount } = spriteLayout;
    const seen = new Set<string>();
    for (let frame = 0; frame < frameCount; frame++) {
      const bytes = [];
      for (let y = 0; y < height; y++) {
        const offset = ((Math.floor(frame / columns) * height + y) * image.width + frame % columns * width) * 4;
        bytes.push(image.data.subarray(offset, offset + width * 4));
      }
      const signature = Buffer.concat(bytes).toString("base64");
      if (frame >= 16) expect(seen.has(signature), `frame ${frame}`).toBe(false);
      seen.add(signature);
    }
  });
});
