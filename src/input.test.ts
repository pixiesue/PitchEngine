import { describe, expect, it } from "vitest";
import { combineInput, ControllerInput, stickMovement, type ControllerState } from "./input";
import { createRuntime, step, type Input } from "./runtime";
import { demoScene } from "./scene";

const idle: Input = { left: false, right: false, jump: false, crouch: false, shoot: false };

function pad(options: { axis?: number; buttons?: number[]; index?: number; mapping?: GamepadMappingType } = {}): ControllerState {
  return {
    id: "Test controller", index: options.index ?? 0, connected: true,
    mapping: options.mapping ?? "standard",
    axes: [options.axis ?? 0, 0],
    buttons: Array.from({ length: 17 }, (_, index) => ({
      pressed: options.buttons?.includes(index) ?? false,
      touched: options.buttons?.includes(index) ?? false,
      value: options.buttons?.includes(index) ? 1 : 0,
    })),
  };
}

describe("controller input", () => {
  it("eliminates drift and rescales remaining stick travel", () => {
    for (const value of [-0.2, -0.01, 0, 0.2, NaN]) expect(stickMovement(value)).toBe(0);
    expect(stickMovement(0.6)).toBeCloseTo(0.5);
    expect(stickMovement(-0.6)).toBeCloseTo(-0.5);
    expect(stickMovement(1)).toBe(1);
    expect(stickMovement(-1)).toBe(-1);
  });

  it("maps selected face buttons and gives D-pad priority", () => {
    const controller = new ControllerInput();
    const frame = controller.poll([pad({ axis: 1, buttons: [0, 1, 2, 14] })], true);
    expect(frame.input).toEqual({ ...idle, moveX: -1, jump: true, crouch: true, shoot: true });
    expect(controller.poll([pad({ buttons: [14, 15] })], true).input.moveX).toBe(0);
  });

  it("toggles Start only once per press", () => {
    const controller = new ControllerInput();
    expect(controller.poll([pad({ buttons: [9] })], true).start).toBe(true);
    expect(controller.poll([pad({ buttons: [9] })], true).start).toBe(false);
    controller.poll([pad()], true);
    expect(controller.poll([pad({ buttons: [9] })], true).start).toBe(true);
  });

  it("keeps the selected controller and safely handles sparse slots and disconnects", () => {
    const controller = new ControllerInput();
    expect(controller.poll([null, pad({ index: 1 })], true).id).toBe("Test controller");
    expect(controller.poll([pad({ axis: -1 }), pad({ axis: 1, index: 1 })], true).input.moveX).toBe(1);
    const disconnected = controller.poll([], true);
    expect(disconnected.disconnected).toBe(true);
    expect(disconnected.input.moveX).toBe(0);
    expect(disconnected.id).toBeNull();
    expect(controller.poll([], true).disconnected).toBe(false);
  });

  it("blocks held input after focus loss until controls are released", () => {
    const controller = new ControllerInput();
    controller.poll([pad({ axis: 1, buttons: [9] })], false);
    expect(controller.poll([pad({ axis: 1, buttons: [9] })], true).input.moveX).toBe(0);
    expect(controller.poll([pad({ buttons: [9] })], true).start).toBe(false);
    controller.poll([pad()], true);
    expect(controller.poll([pad({ buttons: [9] })], true).start).toBe(true);
  });

  it("suppresses held controls when switching controllers", () => {
    const controller = new ControllerInput();
    controller.poll([pad()], true);
    const changed = controller.poll([null, pad({ index: 1, axis: 1, buttons: [9] })], true);
    expect(changed.disconnected).toBe(true);
    expect(changed.start).toBe(false);
    expect(changed.input.moveX).toBe(0);
  });

  it("requires release after a controller reconnects, even after empty polls", () => {
    const controller = new ControllerInput();
    controller.poll([pad()], true);
    controller.poll([], true);
    controller.poll([], true);
    const held = controller.poll([pad({ axis: 1, buttons: [9] })], true);
    expect(held.input.moveX).toBe(0);
    expect(held.start).toBe(false);
    controller.poll([pad()], true);
    expect(controller.poll([pad({ buttons: [9] })], true).start).toBe(true);
  });

  it("reports non-standard mappings without guessing controls", () => {
    const frame = new ControllerInput().poll([pad({ mapping: "", buttons: [0, 9] })], true);
    expect(frame.unsupported).toBe(true);
    expect(frame.id).toBeNull();
    expect(frame.start).toBe(false);
    expect(frame.input.jump).toBe(false);
  });

  it("merges action buttons and preserves keyboard movement priority", () => {
    expect(combineInput({ ...idle, left: true, jump: true }, { ...idle, moveX: 1, shoot: true }))
      .toEqual({ ...idle, moveX: -1, jump: true, shoot: true });
    expect(combineInput({ ...idle, left: true, right: true }, { ...idle, moveX: 1 }).moveX).toBe(0);
    expect(combineInput(idle, { ...idle, moveX: 0.5 }).moveX).toBe(0.5);
  });

  it("uses proportional movement and matches keyboard speed at full deflection", () => {
    const scene = demoScene();
    const analog = createRuntime(scene);
    const keyboard = createRuntime(scene);
    step(analog, { ...idle, moveX: 0.5 }, 1 / 120);
    expect(analog.player.vx).toBe(135);
    step(analog, { ...idle, moveX: 1 }, 1 / 120);
    step(keyboard, { ...idle, right: true }, 1 / 120);
    expect(analog.player.vx).toBe(keyboard.player.vx);
    step(analog, { ...idle, moveX: -0.5, crouch: true }, 1 / 120);
    expect(analog.player.vx).toBe(-65);
  });
});
