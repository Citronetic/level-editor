#!/usr/bin/env python3
"""Apply a named, hard-rule-preserving mutation to a level JSON.

Usage:
    python3 mutate.py --in LEVEL.json --out OUT.json --mutation recolor --params 0,3
    python3 mutate.py --in LEVEL.json --out OUT.json --mutation mirror --params x
    python3 mutate.py --in LEVEL.json --out OUT.json --mutation mirror --params y
    python3 mutate.py --in LEVEL.json --out OUT.json --mutation rotate --params 90
    python3 mutate.py --in LEVEL.json --out OUT.json --mutation rotate --params 180
    python3 mutate.py --in LEVEL.json --out OUT.json --mutation translate --params 1,-2
    python3 mutate.py --in LEVEL.json --out OUT.json --mutation add_ice --params <door_index>,<layers>
    python3 mutate.py --in LEVEL.json --out OUT.json --mutation add_curtain --params x1,y1,x2,y2,clc

After mutating, run scripts/validate.py on the output. The safe mutations
(recolor / mirror / rotate / translate) preserve all hard rules by construction;
add_ice and add_curtain require re-validation against CB2 and slide-graph
reachability.
"""

import argparse
import json


def positions_of(elem):
    if 'BPMS' in elem and elem['BPMS']:
        return [(p['x'], p['y']) for p in elem['BPMS']]
    if 'BPM' in elem:
        return [(elem['BPM']['x'], elem['BPM']['y'])]
    return []


def transform_positions(level, fn):
    """Apply fn(x, y) -> (x', y') to every position in the level (in place)."""
    for key in ('BMS', 'DMS', 'WMS', 'CMS', 'IWMS', 'GMS', 'EMS', 'CLMS', 'CCMS', 'GRM', 'BSP'):
        for el in level.get(key) or []:
            if 'BPMS' in el and el['BPMS']:
                for p in el['BPMS']:
                    p['x'], p['y'] = fn(p['x'], p['y'])
            if 'BPM' in el:
                el['BPM']['x'], el['BPM']['y'] = fn(el['BPM']['x'], el['BPM']['y'])
            if 'EBMS' in el:
                for ebm in el['EBMS']:
                    for p in ebm.get('BPMS') or []:
                        p['x'], p['y'] = fn(p['x'], p['y'])


def bounding_box(level):
    all_pos = []
    for key in ('BMS', 'DMS', 'WMS', 'CMS', 'IWMS', 'GMS', 'EMS', 'CLMS', 'CCMS', 'GRM', 'BSP'):
        for el in level.get(key) or []:
            all_pos.extend(positions_of(el))
    if not all_pos:
        return (0, 0, 0, 0)
    xs, ys = zip(*all_pos)
    return (min(xs), max(xs), min(ys), max(ys))


# ── Mutations ─────────────────────────────────────────────────────────────────

def mutate_recolor(level, params):
    """Swap two colors (e.g., 0 and 3) in BOTH blocks and doors. Pair-preserving."""
    a, b = [int(p) for p in params.split(',')]
    for bm in level.get('BMS') or []:
        if bm.get('BCT') == a: bm['BCT'] = b
        elif bm.get('BCT') == b: bm['BCT'] = a
        if bm.get('LBCT') == a: bm['LBCT'] = b
        elif bm.get('LBCT') == b: bm['LBCT'] = a
    for dm in level.get('DMS') or []:
        if dm.get('BCT') == a: dm['BCT'] = b
        elif dm.get('BCT') == b: dm['BCT'] = a
    for cc in level.get('CCMS') or []:
        if cc.get('BCT') == a: cc['BCT'] = b
        elif cc.get('BCT') == b: cc['BCT'] = a
    return f'recolor: swapped BCT {a} ↔ BCT {b} across all blocks/doors/color-cells'


def mutate_mirror(level, params):
    """Reflect across the vertical (params='x') or horizontal (params='y') axis."""
    axis = params.strip().lower()
    (xmin, xmax, ymin, ymax) = bounding_box(level)
    if axis == 'x':
        def fn(x, y): return (xmin + xmax - x, y)
        transform_positions(level, fn)
        return f'mirror: vertical-axis flip across xMid={(xmin + xmax) / 2}'
    elif axis == 'y':
        def fn(x, y): return (x, ymin + ymax - y)
        transform_positions(level, fn)
        return f'mirror: horizontal-axis flip across yMid={(ymin + ymax) / 2}'
    else:
        raise ValueError(f'mirror axis must be "x" or "y", got {axis!r}')


def mutate_rotate(level, params):
    """Rotate by 90 / 180 / 270 degrees clockwise around the bounding-box center."""
    deg = int(params)
    (xmin, xmax, ymin, ymax) = bounding_box(level)
    if deg == 90:
        # (x, y) -> (y, max_y + min_y - x), then translate back
        def fn(x, y): return (y - ymin + xmin, xmax - (x - xmin) + ymin)
    elif deg == 180:
        def fn(x, y): return (xmin + xmax - x, ymin + ymax - y)
    elif deg == 270:
        def fn(x, y): return (xmax - (y - ymin) + xmin, x - xmin + ymin)
    else:
        raise ValueError(f'rotate degrees must be 90/180/270, got {deg}')
    transform_positions(level, fn)
    return f'rotate: {deg}° clockwise'


def mutate_translate(level, params):
    """Shift every position by (dx, dy)."""
    dx, dy = [int(p) for p in params.split(',')]
    transform_positions(level, lambda x, y: (x + dx, y + dy))
    return f'translate: ({dx}, {dy})'


def mutate_add_ice(level, params):
    """Add N ice layers to a specific door. params = 'door_index,layers'."""
    idx_str, layers_str = params.split(',')
    idx = int(idx_str)
    layers = int(layers_str)
    doors = level.get('DMS') or []
    if not 0 <= idx < len(doors):
        raise ValueError(f'door index {idx} out of range (0..{len(doors) - 1})')
    new_dic = (doors[idx].get('DIC', 0) or 0) + layers
    if new_dic > 5:
        raise ValueError(f'DMS[{idx}].DIC would become {new_dic} which exceeds limit 5')
    doors[idx]['DIC'] = new_dic
    return f'add_ice: DMS[{idx}].DIC {doors[idx]["DIC"] - layers} → {doors[idx]["DIC"]}'


def mutate_add_curtain(level, params):
    """Add a curtain covering a rectangular strip. params = 'x1,y1,x2,y2,clc'."""
    parts = [int(p) for p in params.split(',')]
    if len(parts) != 5:
        raise ValueError('add_curtain params: x1,y1,x2,y2,clc')
    x1, y1, x2, y2, clc = parts
    if not 1 <= clc <= 9:
        raise ValueError(f'CLC {clc} must be in [1, 9]')
    bpms = []
    for x in range(min(x1, x2), max(x1, x2) + 1):
        for y in range(min(y1, y2), max(y1, y2) + 1):
            bpms.append({'$type': 'BPM', 'x': x, 'y': y})
    level.setdefault('CLMS', []).append({
        '$type': 'CLM',
        'BPMS': bpms,
        'CLC': clc,
    })
    return f'add_curtain: ({x1},{y1})-({x2},{y2}) cells, CLC={clc}'


MUTATIONS = {
    'recolor':      mutate_recolor,
    'mirror':       mutate_mirror,
    'rotate':       mutate_rotate,
    'translate':    mutate_translate,
    'add_ice':      mutate_add_ice,
    'add_curtain':  mutate_add_curtain,
}


def main():
    parser = argparse.ArgumentParser(description='Apply a named mutation to a level JSON.')
    parser.add_argument('--in', dest='inp', required=True, help='input level JSON')
    parser.add_argument('--out', required=True, help='output level JSON')
    parser.add_argument('--mutation', required=True, choices=list(MUTATIONS), help='mutation kind')
    parser.add_argument('--params', required=True, help='comma-separated mutation params (see --help-mutation)')
    args = parser.parse_args()

    with open(args.inp) as f:
        level = json.load(f)
    description = MUTATIONS[args.mutation](level, args.params)
    with open(args.out, 'w') as f:
        json.dump(level, f, ensure_ascii=False, separators=(',', ':'))
    print(json.dumps({
        'wrote': args.out,
        'mutation': args.mutation,
        'description': description,
    }, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
