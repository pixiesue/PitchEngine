import "./style.css";
import { cloneScene, createEntity, demoScene, kinds, labels, parseScene, type Entity, type Scene } from "./scene";
import { createRuntime, step, type Runtime } from "./runtime";
import { colors, loadPlayerSprite, prepareCharacter, render } from "./render";
import { combineInput, ControllerInput } from "./input";
import { parseCharacter } from "./character";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing application root.");
app.innerHTML = `
  <header>
    <div class="brand"><span class="brand-icon">P/</span><div>PitchEngine<small>2D STEALTH-ACTION LAB</small></div></div>
    <div class="header-actions"><span class="badge">PROTOTYPE 0.1</span><button id="play" class="primary">Play level</button></div>
  </header>
  <main>
    <aside class="library">
      <div class="eyebrow">01 / BUILD</div><h2>Scene kit</h2><p class="muted">Add an object, then drag it into place.</p>
      <div id="kit"></div>
      <div class="section"><div class="eyebrow">LEVEL OBJECTS <span id="count"></span></div><div id="objects"></div></div>
      <div class="library-footer"><strong>Small scope. Playable ideas.</strong><p>Block out an encounter. Test both routes. Iterate.</p></div>
    </aside>
    <section class="workspace">
      <div class="scene-bar"><div><span id="mode-dot"></span><strong id="scene-name"></strong><span id="mode">EDIT MODE</span></div>
        <div><button id="undo" title="Undo last edit">Undo</button><label class="snap"><input id="snap" type="checkbox" checked /> Snap 16px</label></div>
      </div>
      <div class="viewport" id="viewport">
        <canvas id="canvas" width="1280" height="720" tabindex="0" aria-label="Level viewport. In edit mode, select and drag objects. In play mode, use keyboard or controller controls."></canvas>
        <div id="hud" hidden><span id="health"></span><span id="stealth"></span><span>REACH EXTRACTION &gt;&gt;</span></div>
        <div id="result" hidden><div><span class="eyebrow" id="result-label"></span><h1 id="result-title"></h1><p id="result-detail"></p><button id="retry" class="primary">Retry level</button><button id="back">Back to editor</button></div></div>
        <div id="pause" hidden><div><h2>Playtest paused</h2><p id="pause-reason"></p><button id="resume" class="primary">Resume</button><p>Or press Start / Options.</p></div></div>
      </div>
      <div class="timeline"><button id="pan-left" aria-label="Pan level left">&lt;</button><input id="camera" type="range" min="0" max="1120" value="0" aria-label="Level camera position" /><button id="pan-right" aria-label="Pan level right">&gt;</button><span id="position">0 / 2400</span></div>
      <div class="controls"><span><kbd>A</kbd><kbd>D</kbd> move</span><span><kbd>SPACE</kbd> jump</span><span><kbd>S</kbd> crouch / hide in cover</span><span><kbd>J</kbd> shoot</span><span><kbd>ESC</kbd> editor</span></div>
      <div class="controls controller-controls"><span>STICK / D-PAD move</span><span><kbd>A / Cross</kbd> jump</span><span><kbd>B / Circle</kbd> hold to crouch</span><span><kbd>X / Square</kbd> shoot</span><span><kbd>START / OPTIONS</kbd> play / stop / retry</span></div>
      <div id="controller-status" class="muted" role="status" aria-live="polite"></div>
      <div class="bottom-bar"><span id="status" role="status" aria-live="polite">Ready. Select an object to start building.</span><span>CANVAS 2D / FIXED-STEP RUNTIME</span></div>
    </section>
    <aside class="inspector">
      <div class="eyebrow">02 / TUNE</div><h2>Inspector</h2><div id="inspector"></div>
      <div class="section"><div class="eyebrow">LEVEL</div><label class="field">Name<input id="name" maxlength="80" /></label>
        <div class="file-actions"><button id="save">Save locally</button><button id="load">Load saved</button><button id="export">Export JSON</button><button id="import">Import JSON</button></div>
        <input id="file" type="file" accept=".json,application/json" hidden />
        <button id="demo" class="wide">Reset demo</button>
      </div>
      <div class="section"><div class="eyebrow">PLAYER ASSET</div><p class="muted" id="character-name">Bundled character</p>
        <button id="import-character" class="wide">Import character PNG + JSON</button>
        <button id="reset-character" class="wide">Use bundled character</button>
        <input id="character-files" type="file" accept=".json,.png,application/json,image/png" multiple hidden />
      </div>
      <div class="note"><strong>Two ways through</strong><p>Crouch inside amber cover to disappear. Stay outside vision cones, use the high route, or fight through. Gunfire alerts nearby guards.</p><p>Cover conceals you; it does not block bullets. Platforms block movement, sight, and shots.</p></div>
    </aside>
  </main>`;

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing UI element: ${id}`);
  return found as T;
}

const canvas = element<HTMLCanvasElement>("canvas");
const context = canvas.getContext("2d");
if (!context) throw new Error("This browser does not support Canvas 2D.");
const ctx = context;
let scene: Scene = demoScene();
let selected: string | null = null;
let runtime: Runtime | null = null;
let camera = 0;
let editCamera = 0;
const history: Scene[] = [];
const keys = new Set<string>();
const controller = new ControllerInput();
let controllerAvailable = typeof navigator.getGamepads === "function";
let paused = false;
let assetBusy = false;
let drag: { id: string; dx: number; dy: number; before: Scene; pointerId: number } | null = null;
const storageKey = "pitch-engine.scene.v1";

function notify(message: string, error = false): void {
  const status = element("status");
  status.textContent = message;
  status.classList.toggle("error", error);
}

function report(error: unknown): void {
  console.error(error);
  notify(error instanceof Error ? error.message : String(error), true);
}

function remember(before = cloneScene(scene)): void {
  history.push(before);
  if (history.length > 50) history.shift();
}

function select(id: string | null): void {
  selected = id;
  refresh();
}

function numericField(entity: Entity, key: "x" | "y" | "w" | "h" | "patrol", label: string): HTMLLabelElement {
  const wrapper = document.createElement("label");
  wrapper.className = "field";
  wrapper.textContent = label;
  const input = document.createElement("input");
  input.type = "number";
  input.value = String(entity[key]);
  input.min = key === "w" || key === "h" ? "8" : "0";
  input.step = "1";
  input.disabled = runtime !== null || assetBusy;
  input.addEventListener("change", () => {
    const value = input.valueAsNumber;
    const candidate = cloneScene(scene);
    const target = candidate.entities.find(item => item.id === entity.id);
    if (!target) return;
    target[key] = value;
    try {
      parseScene(JSON.stringify(candidate));
      remember();
      scene = candidate;
      refresh();
    } catch (error) {
      input.value = String(entity[key]);
      report(error);
    }
  });
  wrapper.append(input);
  return wrapper;
}

function refresh(): void {
  element("scene-name").textContent = scene.name;
  element<HTMLInputElement>("name").value = scene.name;
  element("count").textContent = String(scene.entities.length);
  element<HTMLInputElement>("camera").max = String(scene.width - canvas.width);
  element<HTMLButtonElement>("undo").disabled = runtime !== null || assetBusy || history.length === 0;
  element("character-name").textContent = scene.character ? scene.character.metadata.image : "Bundled character";
  element<HTMLButtonElement>("play").disabled = assetBusy;
  for (const id of ["save", "load", "import", "demo", "name", "snap", "pan-left", "pan-right", "camera",
    "import-character", "reset-character"]) {
    element<HTMLInputElement>(id).disabled = runtime !== null || assetBusy;
  }
  for (const button of element("kit").querySelectorAll("button")) button.disabled = runtime !== null || assetBusy;
  const list = element("objects");
  list.replaceChildren();
  for (const entity of scene.entities) {
    const button = document.createElement("button");
    button.className = `object-row${entity.id === selected ? " active" : ""}`;
    button.textContent = labels[entity.kind];
    button.style.setProperty("--object-color", colors[entity.kind]);
    button.disabled = runtime !== null || assetBusy;
    button.addEventListener("click", () => {
      camera = Math.max(0, Math.min(scene.width - canvas.width, entity.x - canvas.width / 2 + entity.w / 2));
      select(entity.id);
    });
    list.append(button);
  }
  const inspector = element("inspector");
  inspector.replaceChildren();
  const entity = scene.entities.find(item => item.id === selected);
  if (!entity) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Select an object on the canvas or in the list to edit its properties.";
    inspector.append(empty);
    return;
  }
  const title = document.createElement("h3");
  title.textContent = labels[entity.kind];
  inspector.append(title);
  const fields = document.createElement("div");
  fields.className = "fields";
  for (const [key, label] of [["x", "X position"], ["y", "Y position"], ["w", "Width"], ["h", "Height"]] as const) {
    fields.append(numericField(entity, key, label));
  }
  if (entity.kind === "guard") fields.append(numericField(entity, "patrol", "Patrol radius"));
  inspector.append(fields);
  if (entity.kind === "spawn") {
    const note = document.createElement("p");
    note.className = "muted";
    note.textContent = "The player uses a fixed 32 x 52 body. This marker sets its starting position.";
    inspector.append(note);
  }
  if (entity.kind !== "spawn" && entity.kind !== "exit") {
    const actions = document.createElement("div");
    actions.className = "file-actions";
    const duplicate = document.createElement("button");
    duplicate.textContent = "Duplicate";
    duplicate.disabled = runtime !== null || assetBusy;
    duplicate.onclick = () => {
      if (scene.entities.length >= 500) return notify("Object limit reached (500).", true);
      remember();
      const copy = { ...entity, id: crypto.randomUUID(),
        x: Math.min(scene.width - entity.w, entity.x + 32), y: Math.min(scene.height - entity.h, entity.y + 16) };
      scene.entities.push(copy);
      select(copy.id);
    };
    const remove = document.createElement("button");
    remove.textContent = "Delete";
    remove.className = "danger";
    remove.disabled = runtime !== null || assetBusy;
    remove.onclick = deleteSelected;
    actions.append(duplicate, remove);
    inspector.append(actions);
  }
}

function deleteSelected(): void {
  if (runtime || assetBusy) return;
  const target = scene.entities.find(entity => entity.id === selected);
  if (!target) return;
  if (target.kind === "spawn" || target.kind === "exit") {
    notify("Spawn and extraction are required. Move them instead of deleting.", true);
    return;
  }
  remember();
  scene.entities = scene.entities.filter(entity => entity.id !== selected);
  select(null);
}

for (const kind of kinds) {
  const button = document.createElement("button");
  button.className = "kit-button";
  button.style.setProperty("--object-color", colors[kind]);
  button.textContent = `+ ${labels[kind]}`;
  button.onclick = () => {
    const existing = scene.entities.find(entity => entity.kind === kind);
    if ((kind === "spawn" || kind === "exit") && existing) {
      camera = Math.max(0, Math.min(scene.width - canvas.width, existing.x - 400));
      select(existing.id);
      notify(`${labels[kind]} already exists. Drag it to reposition.`);
      return;
    }
    if (scene.entities.length >= 500) return notify("Object limit reached (500).", true);
    remember();
    const entity = createEntity(kind, Math.round((camera + 480) / 16) * 16, 400);
    entity.x = Math.min(scene.width - entity.w, entity.x);
    scene.entities.push(entity);
    select(entity.id);
  };
  element("kit").append(button);
}

function pointer(event: PointerEvent): { x: number; y: number } {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - bounds.left) / bounds.width * canvas.width + camera,
    y: (event.clientY - bounds.top) / bounds.height * canvas.height,
  };
}

canvas.addEventListener("pointerdown", event => {
  canvas.focus();
  if (runtime || assetBusy || event.button !== 0) return;
  const point = pointer(event);
  const hit = [...scene.entities].reverse().find(entity =>
    point.x >= entity.x && point.x <= entity.x + entity.w && point.y >= entity.y && point.y <= entity.y + entity.h);
  select(hit?.id ?? null);
  if (hit) {
    drag = { id: hit.id, dx: point.x - hit.x, dy: point.y - hit.y, before: cloneScene(scene), pointerId: event.pointerId };
    canvas.setPointerCapture(event.pointerId);
  }
});
canvas.addEventListener("pointermove", event => {
  if (!drag || event.pointerId !== drag.pointerId || runtime) return;
  const entity = scene.entities.find(item => item.id === drag?.id);
  if (!entity) return;
  const point = pointer(event);
  const snap = element<HTMLInputElement>("snap").checked ? 16 : 1;
  entity.x = Math.max(0, Math.min(scene.width - entity.w, Math.round((point.x - drag.dx) / snap) * snap));
  entity.y = Math.max(0, Math.min(scene.height - entity.h, Math.round((point.y - drag.dy) / snap) * snap));
});
function finishDrag(): void {
  if (!drag) return;
  if (JSON.stringify(scene) !== JSON.stringify(drag.before)) remember(drag.before);
  if (canvas.hasPointerCapture(drag.pointerId)) canvas.releasePointerCapture(drag.pointerId);
  drag = null;
  refresh();
}
canvas.addEventListener("pointerup", finishDrag);
canvas.addEventListener("pointercancel", finishDrag);
canvas.addEventListener("lostpointercapture", finishDrag);

function edit(): void {
  runtime = null;
  paused = false;
  element("pause").hidden = true;
  keys.clear();
  camera = editCamera;
  element("hud").hidden = true;
  element("result").hidden = true;
  element("play").textContent = "Play level";
  element("mode").textContent = "EDIT MODE";
  element("mode-dot").classList.remove("playing");
  refresh();
  notify("Back in the editor. Playtesting never changes your level.");
}

function play(): void {
  if (assetBusy) return;
  try {
    finishDrag();
    parseScene(JSON.stringify(scene));
    if (!runtime) editCamera = camera;
    runtime = createRuntime(scene);
    paused = false;
    element("pause").hidden = true;
    keys.clear();
    element("hud").hidden = false;
    element("result").hidden = true;
    element("play").textContent = "Stop playtest";
    element("mode").textContent = "PLAY MODE";
    element("mode-dot").classList.add("playing");
    refresh();
    canvas.focus();
    notify("Reach extraction. Crouch in cover to hide; gunfire alerts nearby guards.");
  } catch (error) { report(error); }
}

element("play").onclick = () => runtime ? edit() : play();
element("retry").onclick = play;
element("back").onclick = edit;
function pause(reason: string): void {
  keys.clear();
  if (!runtime || runtime.status !== "playing") return;
  paused = true;
  element("pause").hidden = false;
  element("pause-reason").textContent = reason;
}
element("resume").onclick = () => {
  if (!document.hasFocus() || document.hidden) return;
  paused = false;
  element("pause").hidden = true;
  keys.clear();
  canvas.focus();
};
element("undo").onclick = async () => {
  if (runtime || assetBusy) return;
  const previous = history.at(-1);
  if (previous) {
    await assetOperation(async () => {
      await prepareCharacter(previous.character);
      history.pop();
      scene = previous;
      camera = Math.min(camera, scene.width - canvas.width);
      select(null);
      notify("Last edit undone.");
    });
  }
};
element<HTMLInputElement>("camera").oninput = event => {
  if (!runtime) camera = (event.currentTarget as HTMLInputElement).valueAsNumber;
};
element("pan-left").onclick = () => { if (!runtime) camera = Math.max(0, camera - 320); };
element("pan-right").onclick = () => { if (!runtime) camera = Math.min(scene.width - canvas.width, camera + 320); };
element<HTMLInputElement>("name").onchange = event => {
  const input = event.currentTarget as HTMLInputElement;
  const name = input.value.trim();
  if (!name) { input.value = scene.name; notify("Level name cannot be empty.", true); return; }
  remember();
  scene.name = name;
  refresh();
};
element("save").onclick = () => {
  try {
    parseScene(JSON.stringify(scene));
    localStorage.setItem(storageKey, JSON.stringify(scene));
    notify("Level saved in this browser. Export JSON for a portable backup.");
  } catch (error) { report(error); }
};
function replaceScene(next: Scene): void {
  remember();
  scene = next;
  camera = 0;
  select(null);
}
async function assetOperation(action: () => Promise<void>): Promise<void> {
  if (runtime || assetBusy) return;
  finishDrag();
  assetBusy = true;
  refresh();
  try { await action(); }
  catch (error) { report(error); }
  finally { assetBusy = false; refresh(); }
}
element("load").onclick = async () => {
  await assetOperation(async () => {
    const saved = localStorage.getItem(storageKey);
    if (!saved) throw new Error("No locally saved level yet.");
    const next = parseScene(saved);
    await prepareCharacter(next.character);
    replaceScene(next);
    notify("Saved level loaded. Undo restores the previous scene.");
  });
};
element("export").onclick = () => {
  try {
    parseScene(JSON.stringify(scene));
    const url = URL.createObjectURL(new Blob([JSON.stringify(scene, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${scene.name.replace(/[^a-z0-9_-]/gi, "-") || "level"}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("Level JSON exported.");
  } catch (error) { report(error); }
};
element("import").onclick = () => element<HTMLInputElement>("file").click();
element<HTMLInputElement>("file").onchange = async event => {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  await assetOperation(async () => {
    if (file.size > 14_000_000) throw new Error("Level file is too large (maximum 14 MB including character).");
    const next = parseScene(await file.text());
    await prepareCharacter(next.character);
    replaceScene(next);
    notify("Level imported. Undo restores the previous scene.");
  });
  input.value = "";
};
element("demo").onclick = () => {
  replaceScene(demoScene());
  notify("Demo restored. Undo restores your previous scene.");
};
element("import-character").onclick = () => element<HTMLInputElement>("character-files").click();
element<HTMLInputElement>("character-files").onchange = async event => {
  const input = event.currentTarget as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  await assetOperation(async () => {
    const json = files.find(file => file.name.toLowerCase().endsWith(".json"));
    const png = files.find(file => file.name.toLowerCase().endsWith(".png"));
    if (files.length !== 2 || !json || !png) throw new Error("Select exactly one character JSON and its PNG together.");
    if (json.size > 1_000_000 || png.size > 8_000_000) throw new Error("Character files exceed the 1 MB JSON / 8 MB PNG limits.");
    const metadata = parseCharacter(JSON.parse(await json.text()));
    if (png.name !== metadata.image) throw new Error(`Select the PNG named ${metadata.image}.`);
    const imageData = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error ?? new Error("Cannot read character PNG."));
      reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Cannot read character PNG."));
      reader.readAsDataURL(new Blob([png], { type: "image/png" }));
    });
    const character = { metadata, imageData };
    await prepareCharacter(character);
    remember();
    scene = { ...scene, character };
    notify("Character imported. Combat and collisions are unchanged. Save or export the level to retain it.");
  });
  input.value = "";
};
element("reset-character").onclick = () => {
  if (runtime || assetBusy) return;
  remember();
  delete scene.character;
  refresh();
  notify("Bundled character restored. Undo returns to the imported character.");
};

function editingText(target: EventTarget | null): boolean {
  return target instanceof HTMLElement &&
    (target.matches("input, textarea, select") || target.isContentEditable);
}
window.addEventListener("keydown", event => {
  if (event.code === "Escape" && runtime) { edit(); return; }
  if (editingText(event.target)) return;
  if (assetBusy) return;
  if (!runtime && event.code === "Delete") { event.preventDefault(); deleteSelected(); return; }
  if (runtime && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space", "KeyA", "KeyD", "KeyW", "KeyS", "KeyJ"].includes(event.code)) {
    event.preventDefault();
    keys.add(event.code);
  }
});
window.addEventListener("keyup", event => keys.delete(event.code));
window.addEventListener("blur", () => pause("Window lost focus. Resume when you are ready."));
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause("Tab was hidden. Resume when you are ready.");
});

let last = performance.now();
let accumulator = 0;
function frame(now: number): void {
  const elapsed = document.hidden ? 0 : Math.min((now - last) / 1000, 0.05);
  last = now;
  let pads: readonly (Gamepad | null)[] = [];
  if (controllerAvailable) {
    try { pads = navigator.getGamepads(); }
    catch (error) {
      controllerAvailable = false;
      report(error);
    }
  }
  const controllerFrame = controller.poll(pads, !document.hidden && document.hasFocus() && !editingText(document.activeElement));
  const controllerStatus = !controllerAvailable ? "Controller API unavailable. Use a supported browser on localhost or HTTPS; keyboard controls remain available."
    : controllerFrame.id ? `Controller connected: ${controllerFrame.id}`
    : controllerFrame.unsupported ? "Controller detected, but its mapping is unsupported. Use a standard Xbox / PlayStation-compatible controller."
    : "Connect a controller and press a button to let the browser detect it.";
  if (element("controller-status").textContent !== controllerStatus) element("controller-status").textContent = controllerStatus;
  if (controllerFrame.disconnected) pause("Controller disconnected or changed. Reconnect, release controls, then resume.");
  if (controllerFrame.start) {
    if (paused) element("resume").click();
    else if (!runtime || runtime.status !== "playing") play();
    else edit();
  }
  if (runtime) {
    if (paused) accumulator = 0;
    else accumulator += elapsed;
    const input = combineInput({
      left: keys.has("KeyA") || keys.has("ArrowLeft"),
      right: keys.has("KeyD") || keys.has("ArrowRight"),
      jump: keys.has("Space") || keys.has("KeyW") || keys.has("ArrowUp"),
      crouch: keys.has("KeyS") || keys.has("ArrowDown"),
      shoot: keys.has("KeyJ"),
    }, controllerFrame.input);
    while (accumulator >= 1 / 120) {
      step(runtime, input, 1 / 120);
      accumulator -= 1 / 120;
    }
    camera = Math.max(0, Math.min(scene.width - canvas.width, runtime.player.x - canvas.width * 0.4));
    element("health").textContent = `HEALTH ${Math.max(0, runtime.player.health)} / 4`;
    const alerted = runtime.guards.some(guard => guard.health > 0 && guard.awareness > 0.6);
    element("stealth").textContent = runtime.player.hidden ? "HIDDEN" : alerted ? "DETECTED" : "EXPOSED";
    element("stealth").className = runtime.player.hidden ? "safe" : alerted ? "error" : "";
    if (runtime.status !== "playing") {
      const won = runtime.status === "won";
      element("result").hidden = false;
      element("result-label").textContent = won ? "EXTRACTION COMPLETE" : "PLAYTEST ENDED";
      element("result-title").textContent = won ? "Route proven." : "Try another approach.";
      element("result-detail").textContent = `${runtime.time.toFixed(1)}s / ${runtime.kills} guards defeated. ${won ? "Return to the editor and refine the encounter." : "Use cover, change elevation, or clear your path."}`;
    }
  } else accumulator = 0;
  element<HTMLInputElement>("camera").value = String(camera);
  element("position").textContent = `${Math.round(camera)} / ${scene.width}`;
  render(ctx, scene, camera, runtime, selected, element<HTMLInputElement>("snap").checked);
  requestAnimationFrame(frame);
}
refresh();
requestAnimationFrame(frame);
void loadPlayerSprite().catch(error => {
  report(new Error(`Player sprite could not load. Placeholder shown: ${error instanceof Error ? error.message : String(error)}`));
});
