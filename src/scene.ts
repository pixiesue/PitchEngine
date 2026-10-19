import { parseCharacterPackage, type CharacterPackage } from "./character";

export const kinds = ["platform", "cover", "guard", "spawn", "exit"] as const;
export type Kind = (typeof kinds)[number];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Entity extends Rect {
  id: string;
  kind: Kind;
  patrol: number;
}

export interface Scene {
  version: 1;
  name: string;
  width: number;
  height: number;
  entities: Entity[];
  character?: CharacterPackage;
}

export const labels: Record<Kind, string> = {
  platform: "Platform",
  cover: "Cover",
  guard: "Patrol guard",
  spawn: "Player spawn",
  exit: "Extraction",
};

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function cloneScene(scene: Scene): Scene {
  return structuredClone(scene);
}

export function createEntity(kind: Kind, x: number, y: number): Entity {
  const sizes: Record<Kind, [number, number]> = {
    platform: [224, 32],
    cover: [96, 80],
    guard: [32, 56],
    spawn: [32, 52],
    exit: [64, 96],
  };
  const [w, h] = sizes[kind];
  return { id: crypto.randomUUID(), kind, x, y, w, h, patrol: kind === "guard" ? 160 : 0 };
}

export function demoScene(): Scene {
  const specs: [Kind, number, number, number, number, number?][] = [
    ["platform", 0, 640, 2400, 80],
    ["platform", 400, 496, 240, 24],
    ["platform", 760, 400, 224, 24],
    ["platform", 1136, 496, 256, 24],
    ["platform", 1488, 400, 224, 24],
    ["platform", 1728, 480, 256, 24],
    ["cover", 304, 560, 96, 80],
    ["cover", 1008, 560, 112, 80],
    ["cover", 1552, 560, 112, 80],
    ["cover", 2048, 560, 96, 80],
    ["guard", 640, 584, 32, 56, 208],
    ["guard", 1328, 584, 32, 56, 176],
    ["guard", 1872, 584, 32, 56, 144],
    ["spawn", 96, 588, 32, 52],
    ["exit", 2288, 544, 64, 96],
  ];
  return {
    version: 1,
    name: "Night shift",
    width: 2400,
    height: 720,
    entities: specs.map(([kind, x, y, w, h, patrol = 0], i) => ({
      id: `demo-${i}`, kind, x, y, w, h, patrol,
    })),
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function number(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function isKind(value: unknown): value is Kind {
  return kinds.some(kind => kind === value);
}

export function parseScene(text: string): Scene {
  const data: unknown = JSON.parse(text);
  if (!record(data) || data.version !== 1 || typeof data.name !== "string" ||
      data.name.trim().length === 0 || data.name.length > 80 ||
      !number(data.width, 1280, 10000) || !number(data.height, 720, 2000) ||
      !Array.isArray(data.entities) || data.entities.length > 500) {
    throw new Error("Invalid level: expected version 1, a name, valid world size, and up to 500 objects.");
  }
  const width = data.width;
  const height = data.height;
  const ids = new Set<string>();
  const entities: Entity[] = data.entities.map((value: unknown) => {
    if (!record(value) || typeof value.id !== "string" || value.id.length === 0 ||
        value.id.length > 100 || ids.has(value.id) ||
        !isKind(value.kind) ||
        !number(value.x, 0, width) || !number(value.y, 0, height) ||
        !number(value.w, 8, width) || !number(value.h, 8, height) ||
        !number(value.patrol, 0, 2000) ||
        value.x + value.w > width || value.y + value.h > height) {
      throw new Error("Invalid level object: check IDs, type, dimensions, bounds, and patrol distance.");
    }
    ids.add(value.id);
    return {
      id: value.id, kind: value.kind, x: value.x, y: value.y,
      w: value.w, h: value.h, patrol: value.patrol,
    };
  });
  for (const kind of ["spawn", "exit"] as const) {
    if (entities.filter(entity => entity.kind === kind).length !== 1) {
      throw new Error(`A level must contain exactly one ${labels[kind].toLowerCase()}.`);
    }
  }
  return { version: 1, name: data.name, width: data.width, height: data.height, entities,
    ...(data.character === undefined ? {} : { character: parseCharacterPackage(data.character) }) };
}
