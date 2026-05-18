# Mutations cookbook — worked examples

Concrete before/after snippets for every mutation in [mutate.py](../scripts/mutate.py).
Use these as a sanity check when implementing a new mutation manually
or composing one in Claude.

All examples below assume a starting level at `data/levels/t76-level-1.json`
with two blocks (Red, DarkBlue) and two doors (Red, DarkBlue).

## 1. Recolor (safe, all rules preserved)

Swap Red (0) ↔ Green (3) across both blocks and doors.

**Before:**

```json
{ "$type": "BM", "BCT": 0, "BPMS": [{"x":3,"y":7},...] }    // Red block
{ "$type": "DM", "BCT": 0, "BPMS": [{"x":3,"y":11},...] }   // Red door
```

**After:**

```json
{ "$type": "BM", "BCT": 3, "BPMS": [{"x":3,"y":7},...] }    // Green block
{ "$type": "DM", "BCT": 3, "BPMS": [{"x":3,"y":11},...] }   // Green door
```

CB1 (block-color has matching door): preserved — paired swap.
CB2 (capacity math): preserved — counts unchanged.
Solvability: preserved — geometry untouched.

```bash
python3 .claude/skills/level-designer/scripts/mutate.py \
  --in data/levels/t76-level-1.json \
  --out data/levels/custom-t76-1-green.json \
  --mutation recolor --params 0,3
```

## 2. Mirror (safe)

Flip across the vertical axis at `xMid = (min_x + max_x) / 2`.

**Before** (block anchored at x=3):

```json
{ "BPMS": [{"x":3,"y":7},{"x":4,"y":7},{"x":3,"y":6},{"x":4,"y":6}] }
```

**After** (mirrored over xMid=6.5):

```json
{ "BPMS": [{"x":10,"y":7},{"x":9,"y":7},{"x":10,"y":6},{"x":9,"y":6}] }
```

```bash
python3 .claude/skills/level-designer/scripts/mutate.py \
  --in data/levels/t76-level-1.json \
  --out data/levels/custom-t76-1-mirror.json \
  --mutation mirror --params x
```

Mirror Y axis with `--params y`.

## 3. Rotate (safe — 180° always; 90°/270° if grid is square)

180° rotation around bounding-box center.

```bash
python3 .claude/skills/level-designer/scripts/mutate.py \
  --in data/levels/t76-level-1.json \
  --out data/levels/custom-t76-1-rot180.json \
  --mutation rotate --params 180
```

After rotation, re-check `G6` (bounding box). 90° rotations on a
non-square grid swap width and height; if the result exceeds [5, 14]
on either axis, follow up with `translate`.

## 4. Translate (safe — preserves geometry, shifts position)

Useful when the source level is anchored awkwardly (e.g., near grid
edge), or after a 90° rotation pushed things out of range.

```bash
# shift everything right 2, down 1
python3 .claude/skills/level-designer/scripts/mutate.py \
  --in data/levels/foo.json --out data/levels/foo-shifted.json \
  --mutation translate --params 2,-1
```

## 5. Add ice (medium — requires CB2 re-check)

Add 2 ice layers to door at DMS[0]:

```bash
python3 .claude/skills/level-designer/scripts/mutate.py \
  --in data/levels/t76-level-1.json \
  --out data/levels/custom-t76-1-icy.json \
  --mutation add_ice --params 0,2
```

The script REJECTS new DIC > 5 (per element limits in SKILL.md §3.4).
After mutation, ALWAYS run:

```bash
python3 .claude/skills/level-designer/scripts/validate.py \
  data/levels/custom-t76-1-icy.json
```

If `CB2_capacity` fails (e.g., color 0 has 5 block-cells but doors
provide only 4 + 2 ice = 6 capacity → 1 surplus), you've gone too far;
revert and try DIC=1.

## 6. Add curtain (medium — requires CLC budget check)

Add a curtain at row y=9 spanning x=3..5 with CLC=2:

```bash
python3 .claude/skills/level-designer/scripts/mutate.py \
  --in data/levels/t76-level-1.json \
  --out data/levels/custom-t76-1-curtain.json \
  --mutation add_curtain --params 3,9,5,9,2
```

The curtain rectangle is filled in row/col order. CLC must be ≥1 and
≤9 (the script enforces this).

CLC budget rule of thumb: CLC ≤ (number of same-color blocks that
naturally cross the curtain on the path to their door). For 2 blocks
crossing once each → CLC ≤ 2.

## Chaining mutations

Compose by piping the output back as input:

```bash
in=data/levels/t76-level-1.json
out=data/levels/custom-t76-1-greenmirror.json
tmp=/tmp/_step1.json

# Step 1: recolor
python3 .claude/skills/level-designer/scripts/mutate.py \
  --in "$in" --out "$tmp" --mutation recolor --params 0,3

# Step 2: mirror across vertical axis
python3 .claude/skills/level-designer/scripts/mutate.py \
  --in "$tmp" --out "$out" --mutation mirror --params x

# Validate
python3 .claude/skills/level-designer/scripts/validate.py "$out"
python3 .claude/skills/level-designer/scripts/solvability.py "$out"
```

## Mutation safety summary

| Mutation | Preserves G* | Preserves CB1 | Preserves CB2 | Preserves solvability |
|---|---|---|---|---|
| recolor | ✅ | ✅ (paired) | ✅ | ✅ |
| mirror | ✅ | ✅ | ✅ | ✅ |
| rotate 180 | ✅ | ✅ | ✅ | ✅ |
| rotate 90 / 270 | ⚠ (may overflow box) | ✅ | ✅ | ✅ if box still valid |
| translate | ⚠ (may overflow box) | ✅ | ✅ | ✅ if box still valid |
| add_ice | ✅ | ✅ | ⚠ recheck | ✅ usually |
| add_curtain | ✅ | ✅ | ✅ (no color change) | ⚠ recheck CLC budget |

For risky operations (add/remove blocks, relocate doors), there's no
script — they're rebuild operations. Either compose them yourself in
JSON-edit and re-run `validate.py + solvability.py`, or describe the
final structure to Claude and have it author the new level from scratch.
