import type { Input } from "./runtime";

export const stickDeadzone = 0.2;
export type ControllerState = Pick<Gamepad, "id" | "index" | "connected" | "mapping" | "axes" | "buttons">;

export interface ControllerFrame {
  input: Input;
  start: boolean;
  id: string | null;
  disconnected: boolean;
  unsupported: boolean;
}

export function stickMovement(value: number): number {
  if (!Number.isFinite(value) || Math.abs(value) <= stickDeadzone) return 0;
  return Math.sign(value) * Math.min(1, (Math.abs(value) - stickDeadzone) / (1 - stickDeadzone));
}

export class ControllerInput {
  private index: number | null = null;
  private previousStart = false;
  private waitingForRelease = false;

  poll(pads: readonly (ControllerState | null)[], active: boolean): ControllerFrame {
    const previous = this.index;
    const supported = pads.filter((pad): pad is ControllerState => pad !== null && pad.connected && pad.mapping === "standard");
    const pad = supported.find(item => item.index === this.index) ?? supported[0];
    this.index = pad?.index ?? null;
    const disconnected = previous !== null && previous !== this.index;
    const pressed = (index: number): boolean => pad?.buttons[index]?.pressed ?? false;
    const dpad = Number(pressed(15)) - Number(pressed(14));
    const moveX = pressed(14) || pressed(15) ? dpad : stickMovement(pad?.axes[0] ?? 0);
    const jump = pressed(0);
    const crouch = pressed(1);
    const shoot = pressed(2);
    const start = pressed(9);
    const neutral = moveX === 0 && !jump && !crouch && !shoot && !start;
    if (!active || disconnected) this.waitingForRelease = true;
    if (active && pad && neutral) this.waitingForRelease = false;
    const enabled = active && !this.waitingForRelease;
    const startEdge = enabled && start && !this.previousStart;
    this.previousStart = start;
    return {
      input: { left: false, right: false, moveX: enabled ? moveX : 0,
        jump: enabled && jump, crouch: enabled && crouch, shoot: enabled && shoot },
      start: startEdge, id: pad?.id ?? null, disconnected,
      unsupported: pads.some(item => item !== null && item.connected && item.mapping !== "standard"),
    };
  }
}

export function combineInput(keyboard: Input, controller: Input): Input {
  const keyboardX = Number(keyboard.right) - Number(keyboard.left);
  return {
    left: false, right: false,
    moveX: keyboard.left || keyboard.right ? keyboardX : controller.moveX ?? 0,
    jump: keyboard.jump || controller.jump,
    crouch: keyboard.crouch || controller.crouch,
    shoot: keyboard.shoot || controller.shoot,
  };
}
