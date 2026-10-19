import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const source = PNG.sync.read(readFileSync(fileURLToPath(new URL("../assets/player-source.png", import.meta.url))));
const scaleX = source.width / 1145;
const scaleY = source.height / 768;
const cellWidth = 256;
const cellHeight = 224;
// Manual crops exclude the labels. Pivots follow the torso, not the weapon or outstretched limbs.
const poses = [
  [40, 25, 155, 229, 88, 227],
  [172, 27, 309, 229, 234, 227],
  [343, 25, 437, 229, 393, 227],
  [438, 25, 528, 229, 486, 227],
  [529, 25, 605, 229, 570, 227],
  [606, 25, 696, 229, 654, 227],
  [727, 27, 835, 229, 793, 227],
  [836, 27, 922, 229, 878, 227],
  [911, 27, 1009, 229, 960, 227],
  [985, 27, 1113, 229, 1059, 227],
  [26, 307, 154, 475, 88, 474],
  [165, 299, 266, 475, 224, 474],
  [255, 299, 365, 475, 309, 474],
  [335, 299, 450, 475, 397, 474],
  [456, 278, 606, 475, 513, 474],
  [610, 278, 802, 475, 667, 474],
];
const frames = [];

function keepCharacter(pose) {
  const seen = new Uint8Array(cellWidth * cellHeight);
  const components = [];
  for (let start = 0; start < seen.length; start++) {
    if (seen[start] || pose.data[start * 4 + 3] === 0) continue;
    const component = [start];
    seen[start] = 1;
    for (let i = 0; i < component.length; i++) {
      const pixel = component[i];
      const x = pixel % cellWidth;
      const y = Math.floor(pixel / cellWidth);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= cellWidth || ny < 0 || ny >= cellHeight) continue;
          const next = ny * cellWidth + nx;
          if (!seen[next] && pose.data[next * 4 + 3] !== 0) {
            seen[next] = 1;
            component.push(next);
          }
        }
      }
    }
    components.push(component);
  }
  components.sort((a, b) => b.length - a.length);
  // Neighboring poses overlap crop bounds; discard their disconnected slivers.
  for (const component of components.slice(1)) {
    for (const pixel of component) pose.data.fill(0, pixel * 4, pixel * 4 + 4);
  }
}

for (const [index, [left, top, right, bottom, pivotX, feetY]] of poses.entries()) {
  const pose = new PNG({ width: cellWidth, height: cellHeight });
  pose.data.fill(0);
  let opaque = 0;
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const sx = Math.min(source.width - 1, Math.round(x * scaleX));
      const sy = Math.min(source.height - 1, Math.round(y * scaleY));
      const offset = (sy * source.width + sx) * 4;
      const [r, g, b, a] = source.data.subarray(offset, offset + 4);
      const low = Math.min(r, g, b);
      const high = Math.max(r, g, b);
      // The supplied sheet has a light, neutral gray background; retain dark outlines and colored details.
      if (a === 0 || (low > 130 && high - low < 28)) continue;
      const localX = 96 + x - pivotX;
      const localY = 216 + y - feetY;
      if (localX < 0 || localX >= cellWidth || localY < 0 || localY >= cellHeight) {
        throw new Error(`Pose ${index} exceeds its atlas cell.`);
      }
      const target = (localY * cellWidth + localX) * 4;
      pose.data.set([r, g, b, a], target);
      opaque++;
    }
  }
  if (opaque < 1000) throw new Error(`Pose ${index} has too few visible pixels: ${opaque}.`);
  if (index !== 15) keepCharacter(pose);
  frames.push(pose);
}

function blank() {
  const frame = new PNG({ width: cellWidth, height: cellHeight });
  frame.data.fill(0);
  return frame;
}

function stamp(target, source, { top = 0, bottom = cellHeight, dx = 0, dy = 0,
  angle = 0, pivotX = 96, pivotY = 126, scaleY = 1 } = {}) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  for (let y = 0; y < cellHeight; y++) {
    for (let x = 0; x < cellWidth; x++) {
      const px = x - dx - pivotX;
      const py = (y - dy - pivotY) / scaleY;
      const sx = Math.round(pivotX + px * cos + py * sin);
      const sy = Math.round(pivotY - px * sin + py * cos);
      if (sx < 0 || sx >= cellWidth || sy < top || sy >= bottom) continue;
      const offset = (sy * cellWidth + sx) * 4;
      if (source.data[offset + 3] === 0) continue;
      target.data.set(source.data.subarray(offset, offset + 4), (y * cellWidth + x) * 4);
    }
  }
}

function armed(lower, seam = 126) {
  const frame = blank();
  stamp(frame, lower, { top: seam - 4 });
  stamp(frame, frames[14], { bottom: 126, dy: seam - 126 });
  return frame;
}

function airborne(base, angle, tuck, shooting) {
  const frame = blank();
  stamp(frame, frames[base], { top: 122, angle, scaleY: tuck });
  stamp(frame, shooting ? frames[14] : frames[base], { bottom: 126 });
  return frame;
}

// Airborne poses rotate/compress the existing legs at the hip; these are blockout edits, not new hand-drawn art.
frames.push(airborne(7, -0.22, 0.8, false), airborne(8, -0.35, 0.7, false)); // 16-17 jump
frames.push(airborne(8, 0.12, 0.95, false), airborne(7, 0.2, 1, false)); // 18-19 fall
for (const scaleY of [0.82, 0.93]) {
  const frame = blank();
  stamp(frame, frames[0], { scaleY, pivotY: 216 });
  frames.push(frame); // 20-21 landing compression/recovery, feet stay planted
}
for (const base of [6, 7, 8, 9, 2, 3, 4, 5]) frames.push(armed(frames[base])); // 22-29 run/walk shooting
for (const base of [10, 11, 12, 13]) frames.push(armed(frames[base], 157)); // 30-33 crouch shooting
frames.push(airborne(7, -0.22, 0.8, true), airborne(8, -0.35, 0.7, true)); // 34-35 jump shooting
frames.push(airborne(8, 0.12, 0.95, true), airborne(7, 0.2, 1, true)); // 36-37 fall shooting

const atlas = new PNG({ width: cellWidth * 4, height: cellHeight * Math.ceil(frames.length / 4) });
atlas.data.fill(0);
for (const [index, frame] of frames.entries()) {
  let visible = 0;
  for (let y = 0; y < cellHeight; y++) {
    for (let x = 0; x < cellWidth; x++) {
      if (frame.data[(y * cellWidth + x) * 4 + 3] === 0) continue;
      visible++;
      if (x === 0 || y === 0 || x === cellWidth - 1 || y === cellHeight - 1) {
        throw new Error(`Frame ${index} touches its cell edge; adjust the crop or transform.`);
      }
    }
  }
  if (visible < 1000) throw new Error(`Frame ${index} is incomplete.`);
  PNG.bitblt(frame, atlas, 0, 0, cellWidth, cellHeight, (index % 4) * cellWidth, Math.floor(index / 4) * cellHeight);
}
const destination = fileURLToPath(new URL("../public/player.png", import.meta.url));
mkdirSync(fileURLToPath(new URL("../public", import.meta.url)), { recursive: true });
writeFileSync(destination, PNG.sync.write(atlas));
console.log(`Prepared ${poses.length} source poses and ${frames.length - poses.length} derived poses: ${atlas.width} x ${atlas.height}.`);
