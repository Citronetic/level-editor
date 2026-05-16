export const COLORS = {
  '-1': { name: 'Black',     hex: '#444466', light: '#555577' },
  '0':  { name: 'Red',       hex: '#e74c3c', light: '#ff6b6b' },
  '1':  { name: 'Blue',      hex: '#3498db', light: '#74b9ff' },
  '2':  { name: 'Yellow',    hex: '#f1c40f', light: '#ffeaa7' },
  '3':  { name: 'Green',     hex: '#2ecc71', light: '#55efc4' },
  '4':  { name: 'Purple',    hex: '#9b59b6', light: '#a29bfe' },
  '5':  { name: 'Orange',    hex: '#e67e22', light: '#fab1a0' },
  '6':  { name: 'Pink',      hex: '#e84393', light: '#fd79a8' },
  '7':  { name: 'DarkBlue',  hex: '#2c3e80', light: '#6c7fb8' },
  '8':  { name: 'Turquoise', hex: '#00cec9', light: '#81ecec' },
  '9':  { name: 'DarkGreen', hex: '#00b894', light: '#55efc4' },
};

// Shape offsets are (dx, dy_screen): (0,0) is the anchor (top-left visual cell);
// dy increases DOWN on screen. When placing into BPMS we flip dy because game-y is +up.
export const SHAPES = {
  '1x1':   [[0,0]],
  '2x2':   [[0,0],[1,0],[0,1],[1,1]],
  '3x3':   [[0,0],[1,0],[2,0],[0,1],[1,1],[2,1],[0,2],[1,2],[2,2]],
  'L':     [[0,0],[0,1],[0,2],[1,2]],
  'T':     [[0,0],[1,0],[2,0],[1,1]],
  'I-h':   [[0,0],[1,0],[2,0],[3,0]],
  'I-v':   [[0,0],[0,1],[0,2],[0,3]],
  '+':     [[1,0],[0,1],[1,1],[2,1],[1,2]],
};

// Default direction-lock per shape (BAD field). 1 = horizontal-only, 2 = vertical-only, 0 = free.
export const SHAPE_DEFAULT_BAD = {
  'I-h': 1,
  'I-v': 2,
};
