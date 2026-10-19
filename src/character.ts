export interface Point { x: number; y: number }
export interface AssetFrame {
  id: string;
  rect: { x: number; y: number; w: number; h: number };
  anchor: Point;
  sockets: Record<string, Point>;
  hitboxes?: { id: string; kind: string; rect: { x: number; y: number; w: number; h: number } }[];
}
export interface AssetClip {
  id: string;
  playback: "loop" | "once-hold";
  frames: { frameId: string; durationMs: number }[];
  events: { id: string; timeMs: number }[];
}
export interface CharacterAsset {
  version: 1;
  image: string;
  imageHash: string;
  width: number;
  height: number;
  canvas: { width: number; height: number };
  displayScale: number;
  frames: AssetFrame[];
  clips: AssetClip[];
}
export interface CharacterPackage {
  metadata: CharacterAsset;
  imageData: string;
}
export const requiredClips = ["idle", "walk", "run", "crouch", "crouchWalk", "jump", "fall", "land",
  "aim", "shoot", "runShoot", "walkShoot", "crouchShoot", "crouchWalkShoot", "jumpShoot", "fallShoot"] as const;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function bounded(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}
function id(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
}
function point(value: unknown, width: number, height: number): value is Point {
  return record(value) && bounded(value.x, 0, width) && bounded(value.y, 0, height);
}
function rect(value: unknown, width: number, height: number): value is AssetFrame["rect"] {
  return record(value) && bounded(value.x, 0, width) && bounded(value.y, 0, height) &&
    bounded(value.w, 1, width) && bounded(value.h, 1, height) &&
    [value.x, value.y, value.w, value.h].every(Number.isInteger) &&
    value.x + value.w <= width && value.y + value.h <= height;
}

export function parseCharacter(value: unknown): CharacterAsset {
  const invalid = (detail: string): never => { throw new Error(`Invalid character: ${detail}`); };
  if (!record(value) || value.version !== 1 || typeof value.image !== "string" ||
      !/^[a-zA-Z0-9_.-]+\.png$/.test(value.image) || typeof value.imageHash !== "string" ||
      !/^[a-f0-9]{64}$/i.test(value.imageHash) ||
      !bounded(value.width, 1, 4096) || !bounded(value.height, 1, 4096) ||
      !Number.isInteger(value.width) || !Number.isInteger(value.height) ||
      !record(value.canvas) || !bounded(value.canvas.width, 1, 512) || !bounded(value.canvas.height, 1, 512) ||
      !Number.isInteger(value.canvas.width) || !Number.isInteger(value.canvas.height) ||
      !bounded(value.displayScale, 0.05, 8) ||
      !Array.isArray(value.frames) || value.frames.length === 0 || value.frames.length > 256 ||
      !Array.isArray(value.clips) || value.clips.length > 128) return invalid("unsupported format or resource limits.");
  const ids = new Set<string>();
  const width = value.width;
  const height = value.height;
  const canvas = { width: value.canvas.width, height: value.canvas.height };
  const frames: AssetFrame[] = value.frames.map((frame: unknown) => {
    if (!record(frame) || !id(frame.id) || ids.has(frame.id) || !rect(frame.rect, width, height) ||
        frame.rect.w !== canvas.width || frame.rect.h !== canvas.height ||
        !point(frame.anchor, frame.rect.w, frame.rect.h) || !record(frame.sockets) ||
        Object.keys(frame.sockets).length > 32) return invalid("bad frame rectangle, ID, anchor or sockets.");
    ids.add(frame.id);
    const socketEntries: [string, Point][] = [];
    for (const [name, socket] of Object.entries(frame.sockets)) {
      if (!id(name) || !point(socket, frame.rect.w, frame.rect.h)) return invalid("bad socket.");
      socketEntries.push([name, socket]);
    }
    const hitboxes: NonNullable<AssetFrame["hitboxes"]> = [];
    if (frame.hitboxes !== undefined) {
      if (!Array.isArray(frame.hitboxes) || frame.hitboxes.length > 32) return invalid("bad hitboxes.");
      const seen = new Set<string>();
      for (const hitbox of frame.hitboxes) {
        if (!record(hitbox) || !id(hitbox.id) || seen.has(hitbox.id) || !id(hitbox.kind) ||
            !rect(hitbox.rect, frame.rect.w, frame.rect.h)) return invalid("bad hitbox.");
        seen.add(hitbox.id);
        hitboxes.push({ id: hitbox.id, kind: hitbox.kind, rect: hitbox.rect });
      }
    }
    return { id: frame.id, rect: frame.rect, anchor: frame.anchor, sockets: Object.fromEntries(socketEntries),
      ...(frame.hitboxes === undefined ? {} : { hitboxes }) };
  });
  const clipIds = new Set<string>();
  const clips: AssetClip[] = value.clips.map((clip: unknown) => {
    if (!record(clip) || !id(clip.id) || clipIds.has(clip.id) ||
        (clip.playback !== "loop" && clip.playback !== "once-hold") ||
        !Array.isArray(clip.frames) || clip.frames.length === 0 || clip.frames.length > 256 ||
        !Array.isArray(clip.events) || clip.events.length > 256) return invalid("bad clip.");
    clipIds.add(clip.id);
    const frames = clip.frames.map((entry: unknown) => {
      if (!record(entry) || typeof entry.frameId !== "string" || !ids.has(entry.frameId) ||
          !bounded(entry.durationMs, 1, 60000) || !Number.isInteger(entry.durationMs)) return invalid("bad frame reference or duration.");
      return { frameId: entry.frameId, durationMs: entry.durationMs };
    });
    const duration = frames.reduce((sum, frame) => sum + frame.durationMs, 0);
    const eventIds = new Set<string>();
    const events = clip.events.map((event: unknown) => {
      if (!record(event) || !id(event.id) || eventIds.has(event.id) || !bounded(event.timeMs, 0, duration) ||
          !Number.isInteger(event.timeMs)) return invalid("bad clip event.");
      eventIds.add(event.id);
      return { id: event.id, timeMs: event.timeMs };
    });
    return { id: clip.id, playback: clip.playback, frames, events };
  });
  for (const name of requiredClips) if (!clipIds.has(name)) return invalid(`missing required clip ${name}.`);
  return { version: 1, image: value.image, imageHash: value.imageHash, width: value.width, height: value.height,
    canvas: { width: value.canvas.width, height: value.canvas.height }, displayScale: value.displayScale, frames, clips };
}

export function parseCharacterPackage(value: unknown): CharacterPackage {
  if (!record(value) || typeof value.imageData !== "string" || value.imageData.length > 12_000_000 ||
      !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value.imageData)) {
    throw new Error("Invalid character package: expected embedded PNG (maximum 12 MB encoded).");
  }
  return { metadata: parseCharacter(value.metadata), imageData: value.imageData };
}
