# Prompts: Juno's parts from an AI image generator

For ChatGPT (or any image model that takes reference images). Work in this
order, and don't move on until you like the result:

1. **Character**: one full picture of Juno, to lock her look and the style.
2. **Parts sheet**: the body parts, drawn from that picture.
3. **Faces**: four expressions of the head.
4. **Far-side limbs** (optional): a darker arm and leg for the far side.

Then load the sheets into [rig.html](rig.html) (see
[src/athletes/sprites/](../src/athletes/sprites/README.md)).

Attach your style reference image to prompt 1, and the chosen Juno picture to
prompts 2 to 4. Ask for one image per message: sheets drawn in one go stay
consistent, and separate generations drift in scale, line weight and colour.

## 1. Character

```text
Design an original cartoon athlete for a 2D mobile track-and-field game, in the
art style of the attached reference image (match the style only, not the
character).

Style: bold 2D cartoon illustration. Thick, even, dark brown outlines around
every shape. Flat cel shading: one base colour and one darker shadow tone per
area, no gradients, no 3D render look. Bright, saturated colours. Exaggerated,
comedic, energetic proportions: big head, big hands and feet, muscular arms and
legs with a few drawn muscle lines, strong readable silhouette.

Character: Juno, a female sprinter, "the original: headband on, eyes on gold".
Determined and confident. Dark brown hair pulled up into a topknot bun, a yellow
sweatband headband, big expressive eyes, strong eyebrows. Light skin (#F1C9A5).
Yellow racing singlet (#FFB400) with navy trim, navy running shorts (#12203A),
yellow wristbands, white socks, navy running shoes with yellow accents. No text,
numbers or logos anywhere.

Pose and view: a true side view, facing right (we see her left side, one eye
visible), mid-sprint stride. Full body, nothing cropped. Plain transparent
background, no ground, no shadow, no speed lines.
```

Iterate here ("bigger shoulders", "less realistic nose") until she's right.

## 2. Parts sheet

```text
Using the attached picture of Juno as the exact design (same colours, outlines,
shading, proportions and level of detail), draw her as separate body parts for
a 2D cutout puppet, like a paper doll, all on one sheet.

Rules for every part:
- Side view, facing right, exactly as in the picture.
- All parts at the same scale as they would be on the assembled character.
- Every part separate, with plenty of empty space between them (at least the
  width of a finger). No part touches or overlaps another.
- Each limb piece ends in a rounded, fully drawn end that extends past its
  joint by about half the limb's width, so pieces overlap when assembled.
  No flat cut-off ends.
- Transparent background. If transparency isn't possible, a flat solid pure
  green (#00FF00) background. Never white or a checkerboard.
- No labels, text, arrows, guide lines, ground or shadows.

The parts (one of each):
1. Head: in profile facing right, calm focused expression, with hair, bun,
   headband and ears, and a short neck stub at the bottom.
2. Torso: upright, from the base of the neck down to the hips, including the
   singlet and the waist and seat of the shorts. No head, no arms, no legs.
3. Upper arm: hanging straight down, from the top of the shoulder to just past
   the elbow.
4. Forearm: hanging straight down, from just above the elbow to the wrist, with
   the wristband near the bottom.
5. Hand: a closed fist hanging straight down from the wrist, seen from the side,
   thumb toward the right.
6. Thigh: hanging straight down, from the hip to just past the knee, with the
   shorts' leg covering the top third.
7. Shin: hanging straight down, from just above the knee to the ankle, calf
   muscle at the back (left side), white sock at the bottom.
8. Shoe: flat on its sole, side view, toe pointing right, with the ankle
   opening at the top.

Proportions: thigh and shin the same length; upper arm slightly longer than the
forearm; hip to base of neck about 1.3 times the thigh length. Large image.
```

## 3. Faces

```text
Using the attached picture of Juno's head as the exact design, draw the same
head four times on one sheet, side by side with plenty of space between them:
same size, same profile facing right, same hair, bun, headband, ears and neck
stub. Only the expression changes:
1. Focused: calm, determined, mouth closed.
2. Straining: gritted teeth, angry eyebrows pulled down, squinting.
3. Joy: huge open grin, eyebrows up, eyes wide.
4. Shock: mouth open in an O, eyebrows high, eyes wide.
Transparent background (or flat pure green #00FF00), no labels or text.
```

## 4. Far-side limbs (optional)

```text
Using the attached parts sheet as the exact design, draw only the upper arm,
forearm, hand, thigh, shin and shoe again, identical in shape, size and
orientation, but slightly darker and cooler in colour, as if in shadow: these
are the far-side arm and leg, behind the body. Same rules: separate, rounded
joint ends, transparent (or flat pure green) background, no labels.
```

## Fixing a sheet

Ask for one fix at a time, and say what to keep:

- "Redraw only the forearm: same style, but as thick as the upper arm's bottom
  end, and hanging straight down. Keep everything else identical."
- "The parts are touching. Same sheet, with more space between every part."
- "The thigh is cut off flat at the top. Round it off past the hip."
- "Make the head 15% smaller. Keep everything else identical."

The rigger handles small tilts and slightly wrong lengths on its own; what it
can't fix is a part drawn at the wrong angle to the camera (not a side view),
missing overlap at a joint, or parts touching.
