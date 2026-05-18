#!/usr/bin/env python3
"""Per-block static solvability check via slide-graph BFS.

For each block in the level: build the graph of body positions reachable
by horizontal / vertical slides (each slide goes until the block hits a
wall, another block, or a same-color door it can enter), and BFS from
the starting position to any "exit-state" where the block fully overlaps
a same-color door.

Limitations (documented in SKILL.md §3.3):
  - This treats each block in isolation. It is a NECESSARY but not
    SUFFICIENT solvability check — a level can pass per-block reachability
    but still be unsolvable due to mutual block-block obstruction.
  - Curtains are treated as passable (assumes CLC > 0 will be paid down
    by the player). For curtain-heavy levels, also check
    Σ(CLC) <= reasonable_move_count (see SKILL.md §3.3 step 2).
  - Doors with DIC > 0 are treated as passable on the LAST entry (when
    DIC has been ticked down). This is an approximation.

Usage:
    python3 solvability.py LEVEL.json
"""

import argparse
import json
import sys
from collections import deque


def positions_of(elem):
    if 'BPMS' in elem and elem['BPMS']:
        return [(p['x'], p['y']) for p in elem['BPMS']]
    if 'BPM' in elem:
        return [(elem['BPM']['x'], elem['BPM']['y'])]
    return []


def build_static_topology(level):
    """Pre-compute lookups that don't change with block positions: cells, walls, doors."""
    cells = {(c['BPM']['x'], c['BPM']['y']) for c in level.get('CMS') or []}
    walls = {(w['BPM']['x'], w['BPM']['y']) for w in level.get('WMS') or []}
    doors_by_color = {}
    for dm in level.get('DMS') or []:
        color = dm.get('BCT')
        doors_by_color.setdefault(color, []).append(set(positions_of(dm)))
    return cells, walls, doors_by_color


def shape_offsets(positions):
    """Normalize a body so we can describe it as offsets from its anchor (top-left)."""
    xs = [p[0] for p in positions]
    ys = [p[1] for p in positions]
    ax, ay = min(xs), min(ys)
    return tuple(sorted((x - ax, y - ay) for (x, y) in positions))


def positions_at(anchor, offsets):
    ax, ay = anchor
    return {(ax + dx, ay + dy) for (dx, dy) in offsets}


def slide_until_blocked(anchor, offsets, direction, cells, walls, other_blocks, target_doors):
    """Slide the body from `anchor` in `direction` one cell at a time until blocked.

    Returns ('EXIT', anchor) if the body fully enters a matching-color door,
    otherwise returns the FINAL legal anchor (last position before being blocked).
    """
    dx, dy = direction
    ax, ay = anchor
    last = anchor
    while True:
        nx, ny = ax + dx, ay + dy
        new_body = positions_at((nx, ny), offsets)
        # Exit check: any body cell on a same-color door means we've fully
        # entered the exit channel — the engine collapses the block on contact.
        # (Equality between body and door BPMS is too strict; a block smaller
        # than the door footprint still exits.)
        if any(new_body & d for d in target_doors):
            return ('EXIT', (nx, ny))
        # Body must stay entirely on play cells (CMS).
        if not new_body.issubset(cells):
            return last
        if new_body & walls:
            return last
        if new_body & other_blocks:
            return last
        ax, ay = nx, ny
        last = (ax, ay)


def per_block_reachability(level, block_index):
    """BFS over slide states for a single block. Other blocks treated as stationary
    obstacles at their original positions (this is the "isolation" approximation)."""
    cells, walls, doors_by_color = build_static_topology(level)
    blocks = level.get('BMS') or []
    if not 0 <= block_index < len(blocks):
        return {'reachable': False, 'error': f'block index {block_index} out of range'}
    bm = blocks[block_index]
    color = bm['BCT']
    target_doors = doors_by_color.get(color, [])
    body_positions = positions_of(bm)
    offsets = shape_offsets(body_positions)
    anchor0 = (min(p[0] for p in body_positions), min(p[1] for p in body_positions))

    other_blocks = set()
    for i, b in enumerate(blocks):
        if i == block_index:
            continue
        other_blocks.update(positions_of(b))

    seen = {anchor0}
    queue = deque([(anchor0, [])])
    while queue:
        anchor, path = queue.popleft()
        for direction in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
            result = slide_until_blocked(
                anchor, offsets, direction, cells, walls, other_blocks, target_doors,
            )
            if isinstance(result, tuple) and result[0] == 'EXIT':
                return {
                    'reachable': True,
                    'moves': len(path) + 1,
                    'path': path + [direction],
                }
            if result != anchor and result not in seen:
                seen.add(result)
                queue.append((result, path + [direction]))
    return {'reachable': False, 'visited': len(seen)}


def main():
    parser = argparse.ArgumentParser(description='Static per-block solvability via slide-graph BFS.')
    parser.add_argument('path')
    args = parser.parse_args()

    with open(args.path) as f:
        level = json.load(f)
    blocks = level.get('BMS') or []
    results = []
    total_moves = 0
    all_reachable = True
    for i in range(len(blocks)):
        r = per_block_reachability(level, i)
        bm = blocks[i]
        body = positions_of(bm)
        anchor = (min(p[0] for p in body), min(p[1] for p in body))
        out = {
            'block_index': i,
            'color': bm['BCT'],
            'anchor': anchor,
            'cells': len(body),
            **r,
        }
        if not r['reachable']:
            all_reachable = False
        else:
            total_moves += r['moves']
        results.append(out)

    print(json.dumps({
        'solvable_isolated': all_reachable,
        'min_moves_lower_bound': total_moves if all_reachable else None,
        'blocks': results,
    }, indent=2, ensure_ascii=False))
    sys.exit(0 if all_reachable else 1)


if __name__ == '__main__':
    main()
