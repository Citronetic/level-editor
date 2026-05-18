# Solvability — slide-graph BFS in detail

This document expands SKILL.md §3.3 / §7 with a full description of the
slide model and the per-block static check implemented in
[scripts/solvability.py](../scripts/solvability.py).

## Slide rules (from `js/game.js trySlide`)

A block is a rigid body of N cells (`BPMS`). On a "slide":

1. Player picks a direction ∈ {up, down, left, right}.
2. The body moves one cell at a time in that direction.
3. The slide STOPS when any body cell would:
   - Leave the CMS cell area (off the board)
   - Enter a WMS wall cell
   - Enter a cell occupied by ANOTHER block
   - Enter a curtain whose `CLC` is 0
4. The slide CONTINUES "through" a curtain whose CLC > 0 (decrementing
   CLC by 1 on each crossing) and a door of MATCHING color whose
   `DIC == 0` and `DHS` is satisfied. If the body fully enters the door,
   the block EXITS the board (and is removed).

A "move" is one slide. The minimum-moves number for a level is the
shortest sequence of slides that exits every block.

## Per-block BFS (necessary, not sufficient)

For each block `b`:

```
nodes  := { anchor positions reachable from b's starting anchor }
edges  := node A → node B if a single slide in one of the four
          directions takes b from anchor A to anchor B
exit   := the special state "b has exited via a matching door"
```

Run BFS from `anchor_0` (b's starting anchor). If `exit` is reachable,
b is "isolated-solvable." If every block is isolated-solvable, the
level is *probably* solvable.

**Why it's not sufficient**: blocks block each other. Block A's only
path to its door might be blocked by Block B, and B can't move out of
the way without A first moving. A full solver needs a state-space
search over (anchor of A, anchor of B, anchor of C, …) which is
PSPACE-hard.

For practical purposes:

- Levels with 1–3 blocks: isolation check ≈ true solvability.
- Levels with 4–6 blocks: isolation check + visual inspection usually
  enough.
- Levels with 7+ blocks OR curtains OR ice-doors: write the level,
  open it in the editor, play it. If you finish in ≤ 1.5 × the
  isolation-check's `total_moves`, ship it; otherwise redesign.

## Curtain handling

Curtains: each cell in a curtain has a shared `CLC` counter. A slide
that crosses one or more curtain cells decrements the shared CLC by 1.
When CLC reaches 0 the curtain breaks and that region becomes free
play.

For the static check the script treats curtains as PASSABLE (any
direction, no CLC tracking). This is optimistic. To verify CLC budget
manually:

```
required_crossings(c) ≈ Σ over blocks of color c of crossings their
                        optimal slide path makes through curtain c
```

If `required_crossings(c) > CLC(c)`, the curtain won't break in time
and blocks of color c are trapped. Recompute CLC or remove the curtain.

## Ice / turn door handling

A door with `DIC = N` requires N "ice-hit" entries before it opens.
Each entry is a block sliding into the door. Block exits don't happen
during the ice phase — they melt ice. After the Nth entry, the door
becomes a normal exit.

The script approximates this by assuming any reachable door will
eventually be opened by sufficient ice-hits from same-color blocks.
For a more rigorous check:

```
ice_hits_available(c) ≈ Σ over blocks of color c of (path-length to door - 1)
                        # crude estimate: each slide step is one potential hit
DIC(c) must be ≤ ice_hits_available(c)
```

## What the script reports

```json
{
  "solvable_isolated": true,
  "min_moves_lower_bound": 5,
  "blocks": [
    {
      "block_index": 0,
      "color": 0,
      "anchor": [3, 7],
      "cells": 5,
      "reachable": true,
      "moves": 3,
      "path": [[0, -1], [1, 0], [0, -1]]
    },
    ...
  ]
}
```

`solvable_isolated`: per-block reachability all-pass.
`min_moves_lower_bound`: sum of each block's solo move count. Real
levels often need MORE moves due to inter-block coordination, so this
is a lower bound.
`path`: sequence of slide directions for that block alone (handy for
verifying the design).

## Caveats / known limitations

- The script doesn't model `KID` keys or `LID` layered blocks. Those
  rules are scarcely used in this editor; if you build a level using
  them, fall back to a play-test.
- Doors with `DHS=true` (star doors) are treated as passable. Pair-check
  CB3 (SKILL.md) manually.
- Multi-anchor bodies (curtains shaped like "L") use the top-left of
  their bounding box as the anchor. For weird-shaped bodies (very rare
  for blocks), anchor stability is verified by `shape_offsets`.
