# Blender athlete art

The athletes are modelled in Blender by script, then cut into body-part sprites
the game hangs on its skeleton (`src/athletes/sprites.js`).

- `athlete.py`: builds an athlete (Juno's kit is `JUNO`) out of lofted shapes and
  ellipsoids. Every body part hangs off a pivot at its joint, with the game's
  limb lengths, and `pose()` takes the game's own pose objects
  (`src/athletes/stickFigure.js`), so a posed model matches the game exactly.
  `expression()` switches the face: focus, strain, joy, shock.
- `export_sprites.py`: renders each part alone in its rest orientation (limbs
  hanging down, torso and head upright, foot flat), one head per face, and far-side
  limbs a little darker, then packs them into `src/athletes/sprites/juno.png`
  plus `juno.json` (each part's rectangle and joint pivot in pixels).

Rebuild the sprites after changing the model (about 15 s):

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b -P tools/blender/export_sprites.py
```

To work on the model in a running Blender (e.g. over the Blender MCP server),
exec `athlete.py`, then call `reset_scene()`, `setup_render(bpy.context.scene)`,
`build('Juno', JUNO)`, `pose(...)` and `expression(...)`.

The look: stylized 3D arcade caricature. Big head, hands and feet, simple
muscular limbs, flat saturated colors, basic shading, true side-profile faces.
Parts are lit mostly from the camera side because the game rotates them.
