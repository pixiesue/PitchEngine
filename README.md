# PitchEngine

A browser-based prototype editor for a side-scrolling stealth-action vertical slice. Built with TypeScript, Vite, and Canvas 2D; no game framework. Player artwork is prepared from the user-supplied character sheet.

## Run

Requires Node.js 22.12+ and npm.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Use `npm test` for gameplay/level validation tests and `npm run build` for a type-checked production build.

## Authoring

- Add platforms, cover, and patrol guards from the scene kit.
- Select objects on the canvas or in the object list. Drag to move; edit dimensions and patrol radius in the inspector. A zero patrol radius makes a stationary sentry.
- The camera slider navigates the level. Snap rounds dragging to 16 pixels.
- Every level has one spawn and one extraction marker. They can be moved but not deleted or duplicated.
- Undo retains the last 50 edits, including level imports and demo resets.
- Save/load stores one level in this browser's local storage. Export/import JSON provides portable backups. Invalid imports leave the current scene intact.
- Play mode runs a separate scene snapshot; returning to the editor preserves the authored level.

## Play

| Action | Keyboard | Controller (Xbox / PlayStation) |
| --- | --- | --- |
| Move | A/D or left/right arrows | Left stick or D-pad |
| Jump | Space, W, or up arrow | A / Cross |
| Crouch (hold) | S or down arrow | B / Circle |
| Shoot (hold for repeated fire) | J | X / Square |
| Play / stop / retry | Editor buttons; Escape to stop | Start / Options |
| Resume after pause | Resume button | Start / Options |

Connect a standard-mapped controller by USB or Bluetooth, focus the page, and press a controller button so the browser exposes it. The connection status appears below the controls. Use localhost or HTTPS in a browser supporting the Gamepad API. Non-standard mappings are reported as unsupported rather than guessing button assignments.

The left stick uses a 20% deadzone with the remaining travel scaled to proportional speed. Full stick deflection and D-pad movement match keyboard speed. Keyboard movement takes priority when a movement key is held; action buttons work from either device. The first standard controller is selected and retained until disconnected. Losing window focus, hiding the tab, or disconnecting/changing the controller pauses an active playtest without losing progress. Release controller controls after focus or connection changes, then use Resume or Start / Options.

Reach the green extraction area. Guards patrol, build awareness when they see you, and fire when fully alerted. Crouching inside amber cover conceals you; shooting exposes you and alerts nearby guards. Cover is a concealment zone, not solid geometry or bullet protection. Platforms block movement, vision, and bullets. The player has four health points, guards take two shots, and ammo is unlimited for this prototype. You can retry after failure or extraction.

## Player artwork

### External animation assets

The standalone sibling tool `../PixelAnimator` exports `character.png` and `character.json`. In the Player Asset panel, choose **Import character PNG + JSON** and select both files together. The engine validates clip names, frame bounds, variable durations, anchors, metadata limits, and the PNG SHA-256 before replacing the current character. Failed imports leave the previous character intact.

The adapter supports portable format version 1: untrimmed frame rectangles, per-frame anchors and sockets, looping or once-hold clips, and integer frame durations in milliseconds. It retains named events and optional hitboxes as metadata only; shooting rate, projectile origins, player collision dimensions, health, and movement stay authoritative in the engine. Muzzle sockets affect visual flashes, not projectile physics.

Save/load and exported scene JSON embed the validated character metadata and PNG, so assets survive refresh and move with the scene. Existing version-one geometry-only scenes remain compatible and use the bundled character. Limits: 1 MB character metadata, 8 MB PNG, and 14 MB scene files; local storage quotas may require JSON export instead of local save. Import/undo loads the artwork before committing a change. **Use bundled character** restores the default without changing the level.

The size-study page remains a static comparison of the bundled artwork, not the currently imported character.

Open `/sprite-scale.html` on the running server for a static player-size mockup comparing 100%, 200%, 250%, and 300% against unchanged level geometry. It also previews idle, running, and shooting poses. This study does not change the game's sprite scale or collision body.

The supplied image is preserved in `assets/player-source.png`. `npm run prepare:player` crops 16 poses, removes the neutral gray background and neighboring-pose fragments, then produces 22 additional prototype poses by transforming and recombining those pixels. The 38-frame transparent atlas is written to `public/player.png` (four columns, ten rows of 256 x 224 cells; the final two cells are empty). The original image is never overwritten. The preparation script requires the declared development dependency `pngjs`; the browser has no PNG-processing dependency. Run preparation before tests if you change the script.

The player and editor spawn preview use this atlas with a shared torso/feet anchor, horizontal mirroring, and nearest-neighbor rendering. All levels use this built-in player appearance; the atlas is included in production builds, so scene imports need no additional image upload. Sprite size is independent of the unchanged collision body. Animation advances on simulation ticks, freezes when paused or finished, and resets on retry. If the atlas fails to load, the status reports the error and the rectangle placeholder remains available.

- Idle, four-frame walking, four-frame running, crouch, and three-frame crouch-walking use the supplied poses.
- Low analog movement speed selects walking; full-speed movement selects running.
- Jump and fall each have two derived frames, with existing legs rotated/compressed at the hip. They play once and hold their final frame until the airborne state changes.
- Landing has two feet-anchored compression/recovery frames. It is visual only: moving, crouching, shooting, or jumping interrupts it immediately.
- Running/walking shooting combines the aiming torso with each locomotion frame's legs. Crouch/crouch-walk shooting lowers the aiming torso over the crouched legs. Airborne shooting has matching jump/fall variants.
- Holding shoot keeps the armed pose throughout the firing cooldown; the muzzle flash appears only on actual shots. Stationary shots use the supplied shooting frame; combined poses use a simple flash at the weapon tip.
- Animation does not change movement values, collision dimensions, fire rate, damage, or projectile collision behavior.
- Guards retain their placeholder appearance. No reload, ladder, melee, or grenade mechanics are added by the artwork.

This is a manual preparation of a concept sheet, not a general asset importer or polished hand-drawn completion. Derived frames use pixel recombination, leg transforms, and landing squash rather than newly drawn anatomy; seams and pose stiffness may need an artist's cleanup. Gray-background removal is tailored to this image; a clean transparent source will produce better edges. Confirm artwork rights before publishing or distributing the game.

Atlas frame map:

| Frames | Poses |
| --- | --- |
| 0-1 | Original idle / combat-ready |
| 2-5, 6-9 | Original walk / run |
| 10, 11-13 | Original crouch / crouch-walk |
| 14-15 | Original aim / shooting |
| 16-17, 18-19, 20-21 | Derived jump / fall / landing |
| 22-25, 26-29 | Derived run-shoot / walk-shoot |
| 30, 31-33 | Derived crouch-shoot / crouch-walk-shoot |
| 34-35, 36-37 | Derived jump-shoot / fall-shoot |

## Structure and limits

- `src/scene.ts`: versioned scene data, original demo layout, and import validation.
- `src/runtime.ts`: fixed-step platform movement, patrols, visibility, awareness, projectiles, and extraction.
- `src/input.ts`: controller polling, analog deadzone, button mapping, and keyboard/controller merging.
- `src/animation.ts`: player clips, state selection, timing, and atlas layout.
- `src/render.ts`: Canvas 2D rendering and player atlas loading.
- `src/main.ts`: editor UI, selection/dragging, history, persistence, and playtest loop.

This is a blockout/playtest foundation, not a production engine. It has no animation-authoring UI, audio, general asset importer, tilemaps, scripting, mobile touch controls, controller remapping/rumble, or standalone game export yet. The editor layout adapts to smaller screens; gameplay supports a keyboard or standard-mapped controller. Spawn dimensions are editor markers; the player uses a fixed 32 x 52 body (32 x 32 crouched). World dimensions can be changed through validated JSON; the initial UI edits objects, not world size. Tall imported worlds do not currently have vertical camera scrolling.

Movement tuning is deferred. The next artwork milestone is artist cleanup of the derived poses, followed by an animation preview/authoring panel and reusable prefabs.
