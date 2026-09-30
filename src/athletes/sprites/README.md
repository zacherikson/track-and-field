# Drawn athletes

An athlete can be drawn from a sheet of body parts instead of the stick figure.
The game hangs the parts on its skeleton and rotates them with every pose, so one
set of drawings covers every event pose, blend and stumble
([sprites.js](../sprites.js)). Lane races (100m, hurdles) use them so far.

To give an athlete art:

1. Get the parts drawn (below). [tools/art-prompts.md](../../../tools/art-prompts.md)
   has prompts for an AI image generator.
2. Open [tools/rig.html](../../../tools/rig.html) (serve the repo:
   `python3 -m http.server`, then `/tools/rig.html`), drop the art in, name the
   parts, check each part's two joints (they're guessed), cut off anything that
   shouldn't show past a joint, check the preview, and download `<name>.png` +
   `<name>.json` into this folder. Keep the original art in `art/<name>/`.
3. Add `sprite: '<name>'` to the athlete's colors in [roster.js](../roster.js).

Until the sheet loads, or if it fails to load, the stick figure is drawn instead.

## The parts

The athlete faces **right**, seen from the side. Each part is drawn in its
**rest orientation** and has a **pivot** (the joint it hangs from) and an **end**
(the joint at its other end). The game turns and scales each part so pivot → end
fits its bone, then rotates it about the pivot with the pose, so parts drawn a
little long, short or tilted still line up.

| Part | Rest orientation | Pivot → end | Bone (1.8 m athlete) |
|---|---|---|---|
| `torso` (with shorts) | upright | hip → base of the neck | 0.576 m |
| `head` | upright, facing right | base of the neck → top of the head | (turned only) |
| `upper` (upper arm) | hanging straight down | shoulder → elbow | 0.306 m |
| `fore` (forearm) | hanging straight down | elbow → wrist | 0.288 m |
| `hand` (fist) | hanging straight down | wrist → knuckles | (turned only) |
| `thigh` (with shorts leg) | hanging straight down | hip → knee | 0.45 m |
| `shin` | hanging straight down | knee → ankle | 0.45 m |
| `foot` (shoe) | flat, toes pointing right | ankle → toe tip | (turned only) |

The head, hand and foot keep the sheet's scale (`ppm`, which rig.html measures
from the torso) and are only turned upright by their end point.

The shoulder sits 90% of the way up the torso (0.518 m above the hip). A 1.8 m
athlete stands with the hip 0.9 m above the ground; the ankle is at ground level.

- **Overlap the joints.** Round each limb off past its joint (a knee, an elbow) so
  there's no gap when it bends. The draw order hides the overlap: shin, then foot,
  then thigh on top; forearm, then hand, then upper arm on top; far arm, far leg,
  torso, head, near leg, near arm.
- **Far limbs are optional.** `upper.far`, `thigh.far`, … are the far-side arm and
  leg; without them the near part is drawn for both (a darker far version helps
  depth).
- **Faces are optional.** `head.focus` (at the line), `head.strain` (running),
  `head.joy` (won) and `head.shock` (lost, clipped a hurdle) replace `head` when
  the sheet has them.
- **Resolution:** athletes are up to about 200 device pixels tall on a phone, so
  sheets are kept at about 240 px per meter (a 1.8 m athlete about 430 px tall).
  Draw bigger; rig.html shrinks it on export.

## The JSON

```json
{
  "ppm": 240,
  "headFollow": 0.85,
  "parts": {
    "torso": { "x": 0, "y": 0, "w": 120, "h": 190, "px": 55, "py": 170, "ex": 58, "ey": 32 },
    "head": { "x": 130, "y": 0, "w": 150, "h": 160, "px": 60, "py": 150, "ex": 64, "ey": 4 },
    "upper": { "x": 290, "y": 0, "w": 60, "h": 100, "px": 30, "py": 18, "ex": 31, "ey": 88 }
  }
}
```

- `ppm`: sheet pixels per meter, for parts without an end (and the head, hand, foot).
- `headFollow` (optional, default 1): how much the head tilts with the torso lean.
- `height` (optional, default 1.8): the athlete's height in meters at `ppm`.
- Each part: its rectangle on the sheet (`x`, `y`, `w`, `h`), its pivot
  (`px`, `py`) and, optionally, its end (`ex`, `ey`), in pixels from that
  rectangle's top-left corner. Without an end, a part is drawn as is at `ppm`.
