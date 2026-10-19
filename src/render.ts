import { type Entity, type Scene } from "./scene";
import { type Runtime } from "./runtime";
import { animationFrame, bundledCharacter } from "./animation";
import { parseCharacterPackage, type CharacterAsset, type CharacterPackage } from "./character";

let playerImage: HTMLImageElement | null = null;
let importedImage: { data: string; image: HTMLImageElement } | null = null;

export async function loadPlayerSprite(): Promise<void> {
  const image = new Image();
  image.src = `${import.meta.env.BASE_URL}player.png`;
  await image.decode();
  if (image.naturalWidth !== bundledCharacter.width || image.naturalHeight !== bundledCharacter.height) {
    throw new Error("Player atlas has invalid dimensions. Run npm run prepare:player.");
  }
  playerImage = image;
}

export async function prepareCharacter(character: CharacterPackage | undefined): Promise<void> {
  if (!character) return;
  parseCharacterPackage(character);
  const encoded = character.imageData.split(",")[1];
  const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
  if (bytes.length < 24 || ![137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) {
    throw new Error("Character image is not a PNG.");
  }
  const header = new DataView(bytes.buffer);
  if (header.getUint32(16) !== character.metadata.width || header.getUint32(20) !== character.metadata.height) {
    throw new Error("Character PNG dimensions do not match metadata.");
  }
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  if (hash !== character.metadata.imageHash.toLowerCase()) throw new Error("Character PNG hash does not match metadata.");
  const image = new Image();
  image.src = character.imageData;
  await image.decode();
  importedImage = { data: character.imageData, image };
}

function playerSprite(ctx: CanvasRenderingContext2D, x: number, feet: number, facing: number, frame: number,
  asset: CharacterAsset, image: HTMLImageElement | null): void {
  if (!image) {
    person(ctx, x - 16, feet - 52, 32, 52, colors.spawn, facing);
    return;
  }
  const { rect, anchor } = asset.frames[frame];
  const scale = asset.displayScale;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(feet));
  ctx.scale(facing, 1);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, rect.x, rect.y, rect.w, rect.h,
    -anchor.x * scale, -anchor.y * scale, rect.w * scale, rect.h * scale);
  ctx.restore();
}

export const colors = {
  platform: "#46596b", cover: "#a68b59", guard: "#f29772", spawn: "#8bafff", exit: "#76e0b5",
};

function person(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  color: string, facing: number): void {
  ctx.fillStyle = color;
  ctx.fillRect(x + 5, y + 14, w - 10, h - 14);
  ctx.fillRect(x + 8, y, w - 16, 15);
  ctx.fillStyle = "#111923";
  ctx.fillRect(facing > 0 ? x + w - 12 : x + 7, y + 5, 5, 4);
  ctx.fillRect(x + 12, y + h - 10, 7, 10);
  ctx.fillStyle = color;
  ctx.fillRect(facing > 0 ? x + w - 4 : x - 12, y + h * 0.42, 16, 5);
}

function object(ctx: CanvasRenderingContext2D, entity: Entity, asset: CharacterAsset, image: HTMLImageElement | null): void {
  const { x, y, w, h, kind } = entity;
  ctx.fillStyle = colors[kind];
  if (kind === "spawn") {
    playerSprite(ctx, x + 16, y + 52, 1, animationFrame({ clip: "idle", time: 0 }, asset), asset, image);
  } else if (kind === "guard") {
    person(ctx, x, y, w, h, colors[kind], -1);
  } else if (kind === "exit") {
    ctx.fillStyle = "#183b36";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = colors.exit;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
    ctx.fillStyle = colors.exit;
    ctx.font = "22px monospace";
    ctx.fillText(">>", x + 16, y + h / 2);
  } else {
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = kind === "platform" ? "#7d95a7" : "#ccb17e";
    ctx.fillRect(x, y, w, 4);
    if (kind === "cover") {
      ctx.strokeStyle = "#75603c";
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 8, y + 10, w - 16, h - 20);
      ctx.beginPath();
      ctx.moveTo(x + 8, y + 10);
      ctx.lineTo(x + w - 8, y + h - 10);
      ctx.stroke();
    }
  }
}

export function render(ctx: CanvasRenderingContext2D, scene: Scene, camera: number,
  runtime: Runtime | null, selected: string | null, grid: boolean): void {
  const asset = scene.character?.metadata ?? bundledCharacter;
  const image = scene.character
    ? importedImage?.data === scene.character.imageData ? importedImage.image : null
    : playerImage;
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#101824");
  sky.addColorStop(1, "#263848");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#1b2937";
  for (let i = -1; i < 12; i++) {
    const x = i * 180 - camera * 0.25 % 180;
    ctx.fillRect(x, 300 + (i % 3) * 32, 130, 420);
    ctx.fillStyle = "#324451";
    for (let j = 0; j < 3; j++) ctx.fillRect(x + 20 + j * 32, 380, 12, 4);
    ctx.fillStyle = "#1b2937";
  }
  ctx.save();
  ctx.translate(-camera, 0);
  if (grid && !runtime) {
    ctx.strokeStyle = "#ffffff0a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = Math.floor(camera / 32) * 32; x < camera + width; x += 32) {
      ctx.moveTo(x, 0); ctx.lineTo(x, scene.height);
    }
    for (let y = 0; y < scene.height; y += 32) {
      ctx.moveTo(camera, y); ctx.lineTo(camera + width, y);
    }
    ctx.stroke();
  }
  for (const entity of scene.entities) {
    if (runtime && (entity.kind === "spawn" || entity.kind === "guard")) continue;
    object(ctx, entity, asset, image);
    if (!runtime && entity.kind === "guard") {
      ctx.strokeStyle = "#f2977240";
      ctx.beginPath();
      ctx.moveTo(Math.max(0, entity.x - entity.patrol), entity.y + entity.h + 8);
      ctx.lineTo(Math.min(scene.width, entity.x + entity.patrol + entity.w), entity.y + entity.h + 8);
      ctx.stroke();
    }
  }
  if (runtime) {
    for (const guard of runtime.guards) {
      if (guard.health <= 0) continue;
      ctx.fillStyle = guard.awareness > 0.6 ? "#f297722e" : "#eacb6b15";
      ctx.beginPath();
      ctx.moveTo(guard.x + guard.w / 2, guard.y + 18);
      ctx.lineTo(guard.x + guard.w / 2 + guard.facing * 340, guard.y + 18 - 186);
      ctx.lineTo(guard.x + guard.w / 2 + guard.facing * 340, guard.y + 18 + 186);
      ctx.closePath(); ctx.fill();
      person(ctx, guard.x, guard.y, guard.w, guard.h, colors.guard, guard.facing);
      ctx.fillStyle = "#1c2530";
      ctx.fillRect(guard.x - 4, guard.y - 14, 40, 4);
      ctx.fillStyle = guard.awareness >= 1 ? "#ff756b" : "#eacb6b";
      ctx.fillRect(guard.x - 4, guard.y - 14, 40 * guard.awareness, 4);
    }
    const p = runtime.player;
    ctx.globalAlpha = p.hidden ? 0.4 : p.hurt > 0 ? 0.65 : 1;
    const frame = animationFrame(p.animation, asset);
    playerSprite(ctx, p.x + p.w / 2, p.y + p.h, p.facing, frame, asset, image);
    if (p.shot > 0.07 && (scene.character || p.animation.clip !== "shoot")) {
      const { sockets, anchor } = asset.frames[frame];
      const muzzle = sockets.muzzle;
      if (muzzle) {
        const x = p.x + p.w / 2 + p.facing * (muzzle.x - anchor.x) * asset.displayScale;
        const y = p.y + p.h + (muzzle.y - anchor.y) * asset.displayScale;
        ctx.fillStyle = "#ffd57a";
        ctx.fillRect(Math.round(x) - (p.facing < 0 ? 6 : 0), Math.round(y) - 1, 6, 3);
      }
    }
    ctx.globalAlpha = 1;
    for (const bullet of runtime.bullets) {
      ctx.fillStyle = bullet.owner === "player" ? "#c4d5ff" : "#ffaf8a";
      ctx.fillRect(bullet.x, bullet.y, bullet.w, bullet.h);
    }
  } else {
    const entity = scene.entities.find(item => item.id === selected);
    if (entity) {
      ctx.strokeStyle = "#b8caff";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(entity.x - 4, entity.y - 4, entity.w + 8, entity.h + 8);
      ctx.setLineDash([]);
      ctx.fillStyle = "#b8caff";
      ctx.font = "12px monospace";
      ctx.fillText(`${entity.kind.toUpperCase()} / ${Math.round(entity.x)}, ${Math.round(entity.y)}`,
        entity.x, entity.y - 12);
    }
  }
  ctx.restore();
}
