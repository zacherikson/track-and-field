# Drawn athletes

An athlete can be drawn from a sheet of body parts instead of the stick figure.
The game hangs the parts on its skeleton and rotates them with every pose, so one
set of drawings covers every event pose, blend and stumble
([sprites.js](../sprites.js)). Lane races (100m, hurdles) use them so far.

To give an athlete art:

1. Draw the parts below and pack them into one transparent PNG: `<name>.png` here.
2. Describe where each part is in `<name>.json` here.
3. Add `sprite: '<name>'` to the athlete's colors in [roster.js](../roster.js).

Until the sheet loads, or if it fails to load, the stick figure is drawn instead.

## The parts

The athlete faces **right**, seen from the side. Each part is drawn in its
**rest orientation** with a **pivot** at its joint; the game rotates it about the
pivot.

| Part | Rest orientation | Pivot | Joint to joint |
|---|---|---|---|
| `torso` (with shorts) | upright | hip, bottom centre | hip → neck 0.576 m |
| `head` | upright, facing right | where the neck meets the torso | |
| `upper` (upper arm) | hanging straight down | shoulder | 0.306 m |
| `fore` (forearm) | hanging straight down | elbow | 0.288 m |
| `hand` (fist) | hanging straight down | wrist | |
| `thigh` (with shorts leg) | hanging straight down | hip | 0.45 m |
| `shin` | hanging straight down | knee | 0.45 m |
| `foot` (shoe) | flat, toes pointing right | ankle | |

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
  draw at about 240 px per meter (a 1.8 m athlete about 430 px tall).

## The JSON

```json
{
  "ppm": 240,
  "headFollow": 0.85,
  "parts": {
    "torso": { "x": 0, "y": 0, "w": 120, "h": 190, "px": 55, "py": 170 },
    "head": { "x": 130, "y": 0, "w": 150, "h": 160, "px": 60, "py": 150 },
    "upper": { "x": 290, "y": 0, "w": 60, "h": 100, "px": 30, "py": 18 }
  }
}
```

- `ppm`: sheet pixels per meter (how the drawing's size maps onto the skeleton).
- `headFollow` (optional, default 1): how much the head tilts with the torso lean.
- `height` (optional, default 1.8): the athlete's height in meters at `ppm`.
- Each part: its rectangle on the sheet (`x`, `y`, `w`, `h`) and its pivot
  (`px`, `py`) in pixels from that rectangle's top-left corner.
