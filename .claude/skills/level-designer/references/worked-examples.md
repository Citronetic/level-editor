# Worked examples — end-to-end remixes

Three full sessions showing the skill applied from intent to finished
file. Skim before remixing your first level.

## Example A — "Make a green/yellow variant of t76-level-1, mirror it, add a little challenge"

**Intent**: Same shape and feel as the canonical tutorial, but with
different colors and a mild difficulty bump.

**Step 1 — Inspect base**:

```bash
python3 -m json.tool data/levels/t76-level-1.json | head -50
```

Observe: 2 blocks (BCT 0 Red 5-cell, BCT 7 DarkBlue 4-cell), 2 doors
(BCT 0 and BCT 7 each spanning 3 cells), 18 walls forming a rectangular
border with two open exits, 25 playable cells.

**Step 2 — Pick mutations**:

1. Recolor BCT 0 → BCT 3 (Green), BCT 7 → BCT 2 (Yellow).
2. Mirror across vertical axis (xMid = 6.5).
3. Add 1 ice layer to the Green door (mild challenge).

**Step 3 — Apply via scripts**:

```bash
S=.claude/skills/level-designer/scripts
in=data/levels/t76-level-1.json

# Recolor needs two passes (one per color swap)
python3 $S/mutate.py --in $in              --out /tmp/_a1.json --mutation recolor --params 0,3
python3 $S/mutate.py --in /tmp/_a1.json    --out /tmp/_a2.json --mutation recolor --params 7,2
python3 $S/mutate.py --in /tmp/_a2.json    --out /tmp/_a3.json --mutation mirror   --params x
# Door index 0 = Green door (was Red before recolor)
python3 $S/mutate.py --in /tmp/_a3.json    --out data/levels/custom-t76-1-greenyellow.json \
                     --mutation add_ice --params 0,1
```

**Step 4 — Validate**:

```bash
python3 $S/validate.py data/levels/custom-t76-1-greenyellow.json
python3 $S/solvability.py data/levels/custom-t76-1-greenyellow.json
```

Expected: all hard rules pass; both blocks reach their matching door.

**Step 5 — Report to user**:

> Created `data/levels/custom-t76-1-greenyellow.json`.
> Mutations: recolor 0→3 + 7→2, mirror x, add 1 ice to Green door.
> Validation: all G* + CB* passed. Both blocks reach exits.
> Estimated min moves: 4 + ice melt = ~5.

## Example B — "I want a 7-block hard puzzle, dense color use"

**Intent**: From scratch, intermediate difficulty (S2=6–8 blocks per
SKILL.md §4).

**Step 1 — Don't start from scratch.** Pick a base with similar shape:

```bash
# Find existing levels with 6-8 blocks
for f in data/levels/t76-level-*.json; do
  n=$(python3 -c "import json; print(len(json.load(open('$f')).get('BMS', [])))")
  [ "$n" -ge 6 ] && [ "$n" -le 8 ] && echo "$n  $f"
done | sort -n | head -5
```

Pick the closest match (say `t76-level-25.json` with 7 blocks).

**Step 2 — Mutations**:

1. Mirror (visual change, no risk).
2. Recolor one color pair to introduce visual contrast.
3. Add a curtain at a chokepoint with CLC=3.

**Step 3 — Apply**:

```bash
S=.claude/skills/level-designer/scripts
python3 $S/mutate.py --in data/levels/t76-level-25.json --out /tmp/_b1.json \
                     --mutation mirror --params x
python3 $S/mutate.py --in /tmp/_b1.json --out /tmp/_b2.json \
                     --mutation recolor --params 1,5
# Inspect bounding box to find a curtain location in front of a door
# (e.g., between block group and door at y=10..10, x=5..7)
python3 $S/mutate.py --in /tmp/_b2.json \
                     --out data/levels/custom-dense-7block.json \
                     --mutation add_curtain --params 5,10,7,10,3
```

**Step 4 — Validate**:

```bash
python3 $S/validate.py data/levels/custom-dense-7block.json
python3 $S/solvability.py data/levels/custom-dense-7block.json
```

Curtain placement may break solvability — re-position it if `solvability.py`
reports unreachable blocks.

## Example C — "Pure-tutorial level — one color, two blocks, one door, no obstacles"

**Intent**: A first-level tutorial. Build from scratch since the
canonical tutorial is already very simple but this one should be even
more minimal.

**Step 1 — Author the JSON directly**. No mutation needed.

```json
{
  "$type": "LM",
  "BMS": [
    {
      "$type": "BM", "BCT": 0,
      "BPMS": [{"$type": "BPM", "x": 3, "y": 5}, {"$type": "BPM", "x": 4, "y": 5}],
      "BIC": 0, "BAD": 0, "KID": 0, "LID": 0,
      "BHS": false, "BD": 0, "ILE": false, "LBCT": 0
    },
    {
      "$type": "BM", "BCT": 0,
      "BPMS": [{"$type": "BPM", "x": 5, "y": 5}, {"$type": "BPM", "x": 6, "y": 5}],
      "BIC": 0, "BAD": 0, "KID": 0, "LID": 0,
      "BHS": false, "BD": 0, "ILE": false, "LBCT": 0
    }
  ],
  "DMS": [
    {
      "$type": "DM", "BCT": 0,
      "BPMS": [
        {"$type": "BPM", "x": 7, "y": 5},
        {"$type": "BPM", "x": 7, "y": 6},
        {"$type": "BPM", "x": 7, "y": 7},
        {"$type": "BPM", "x": 7, "y": 8}
      ],
      "IH": true, "BI": 1, "DIC": 0, "TBD": 0, "DHS": false
    }
  ],
  "WMS": [
    {"$type": "WM", "BPM": {"x": 2, "y": 4}, "BI": 1},
    {"$type": "WM", "BPM": {"x": 3, "y": 4}, "BI": 1},
    {"$type": "WM", "BPM": {"x": 4, "y": 4}, "BI": 1},
    {"$type": "WM", "BPM": {"x": 5, "y": 4}, "BI": 1},
    {"$type": "WM", "BPM": {"x": 6, "y": 4}, "BI": 1},
    {"$type": "WM", "BPM": {"x": 2, "y": 9}, "BI": 1},
    {"$type": "WM", "BPM": {"x": 3, "y": 9}, "BI": 1},
    {"$type": "WM", "BPM": {"x": 4, "y": 9}, "BI": 1},
    {"$type": "WM", "BPM": {"x": 5, "y": 9}, "BI": 1},
    {"$type": "WM", "BPM": {"x": 6, "y": 9}, "BI": 1},
    {"$type": "WM", "BPM": {"x": 2, "y": 5}, "BI": 1},
    {"$type": "WM", "BPM": {"x": 2, "y": 6}, "BI": 1},
    {"$type": "WM", "BPM": {"x": 2, "y": 7}, "BI": 1},
    {"$type": "WM", "BPM": {"x": 2, "y": 8}, "BI": 1}
  ],
  "CMS": [
    {"$type": "CM", "BPM": {"x": 3, "y": 5}}, {"$type": "CM", "BPM": {"x": 4, "y": 5}},
    {"$type": "CM", "BPM": {"x": 5, "y": 5}}, {"$type": "CM", "BPM": {"x": 6, "y": 5}},
    {"$type": "CM", "BPM": {"x": 3, "y": 6}}, {"$type": "CM", "BPM": {"x": 4, "y": 6}},
    {"$type": "CM", "BPM": {"x": 5, "y": 6}}, {"$type": "CM", "BPM": {"x": 6, "y": 6}},
    {"$type": "CM", "BPM": {"x": 3, "y": 7}}, {"$type": "CM", "BPM": {"x": 4, "y": 7}},
    {"$type": "CM", "BPM": {"x": 5, "y": 7}}, {"$type": "CM", "BPM": {"x": 6, "y": 7}},
    {"$type": "CM", "BPM": {"x": 3, "y": 8}}, {"$type": "CM", "BPM": {"x": 4, "y": 8}},
    {"$type": "CM", "BPM": {"x": 5, "y": 8}}, {"$type": "CM", "BPM": {"x": 6, "y": 8}}
  ],
  "IWMS": [], "GMS": [], "EMS": [], "CLMS": [], "CCMS": [], "GRM": [],
  "BSP": [{"$type": "BPM", "x": 0, "y": 0}]
}
```

Write this to `data/levels/custom-tutorial-red.json`, then validate:

```bash
python3 .claude/skills/level-designer/scripts/validate.py \
  data/levels/custom-tutorial-red.json
```

A 4×4 playroom, two Red 2-cell blocks, one Red door spanning the right
edge (4 cells). Both blocks slide right → into the door → exit. Total
2 slides. Perfect for slide #1 ever.

## Lessons across all three

- **Compose simple mutations rather than describe a complex one.** Each
  composed step is independently verifiable.
- **Validate after every mutation, not just at the end.** A failure
  in `add_curtain` after three earlier safe mutations is much easier
  to debug than at the very end.
- **When intent is exotic, hand-author the JSON.** The mutation scripts
  are a shortcut for common cases, not a universal API. Example C
  shows the path for "from scratch" — verify with `validate.py` like
  any other level.
