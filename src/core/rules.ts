/**
 * 三棋规则（前端即时校验 + 落点高亮用；后端为权威判定）
 * 象棋 10×9 / 国象 8×8 / 围棋 19×19
 */
import type { BoardMatrix, Cell, GameKind, Move, Pos, Side } from './types';

export const SIZE: Record<GameKind, { rows: number; cols: number }> = {
  xiangqi: { rows: 10, cols: 9 },
  chess: { rows: 8, cols: 8 },
  go: { rows: 19, cols: 19 },
};

const empty = (rows: number, cols: number): BoardMatrix =>
  Array.from({ length: rows }, () => Array.from({ length: cols }, () => null as Cell));

/** 象棋初始局面（红在下，黑在上；红=red） */
export function initialXiangqi(): BoardMatrix {
  const b = empty(10, 9);
  const back = ['车', '马', '相', '仕', '帅', '仕', '相', '马', '车'];
  for (let c = 0; c < 9; c++) {
    b[0][c] = `black:${back[c] === '帅' ? '将' : back[c]}`;
    b[9][c] = `red:${back[c]}`;
  }
  b[2][1] = 'black:炮';
  b[2][7] = 'black:炮';
  b[7][1] = 'red:炮';
  b[7][7] = 'red:炮';
  for (const c of [0, 2, 4, 6, 8]) {
    b[3][c] = 'black:卒';
    b[6][c] = 'red:兵';
  }
  return b;
}

/** 国象初始局面（白在下） */
export function initialChess(): BoardMatrix {
  const b = empty(8, 8);
  const back = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
  for (let c = 0; c < 8; c++) {
    b[0][c] = `black:${back[c]}`;
    b[1][c] = 'black:P';
    b[6][c] = 'white:P';
    b[7][c] = `white:${back[c]}`;
  }
  return b;
}

export function initialGo(): BoardMatrix {
  return empty(19, 19);
}

export function initialBoard(kind: GameKind): BoardMatrix {
  if (kind === 'xiangqi') return initialXiangqi();
  if (kind === 'chess') return initialChess();
  return initialGo();
}

export const sideOf = (cell: Cell): Side | null => {
  if (!cell) return null;
  const s = cell.split(':')[0];
  return s === 'red' || s === 'black' || s === 'white' ? (s as Side) : null;
};

export const kindOf = (cell: Cell): string => (cell ? cell.split(':')[1] ?? '' : '');

const inBoard = (kind: GameKind, p: Pos): boolean => {
  const { rows, cols } = SIZE[kind];
  return p.row >= 0 && p.row < rows && p.col >= 0 && p.col < cols;
};

/* ---------------- 象棋 ---------------- */

function xiangqiMoves(b: BoardMatrix, from: Pos, side: Side): Pos[] {
  const piece = kindOf(b[from.row][from.col]);
  const out: Pos[] = [];
  const push = (r: number, c: number) => {
    if (!inBoard('xiangqi', { row: r, col: c })) return;
    const t = b[r][c];
    if (t && sideOf(t) === side) return;
    out.push({ row: r, col: c });
  };
  const inPalace = (r: number, c: number) =>
    c >= 3 && c <= 5 && (side === 'red' ? r >= 7 && r <= 9 : r >= 0 && r <= 2);

  if (piece === '帅' || piece === '将') {
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const r = from.row + dr;
      const c = from.col + dc;
      if (inPalace(r, c)) push(r, c);
    }
  } else if (piece === '仕' || piece === '士') {
    for (const [dr, dc] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      const r = from.row + dr;
      const c = from.col + dc;
      if (inPalace(r, c)) push(r, c);
    }
  } else if (piece === '相' || piece === '象') {
    for (const [dr, dc] of [[2, 2], [2, -2], [-2, 2], [-2, -2]] as const) {
      const r = from.row + dr;
      const c = from.col + dc;
      if (!inBoard('xiangqi', { row: r, col: c })) continue;
      // 不过河
      if (side === 'red' ? r < 5 : r > 4) continue;
      if (b[from.row + dr / 2][from.col + dc / 2]) continue; // 塞象眼
      push(r, c);
    }
  } else if (piece === '马') {
    for (const [dr, dc] of [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]] as const) {
      const r = from.row + dr;
      const c = from.col + dc;
      if (!inBoard('xiangqi', { row: r, col: c })) continue;
      const legR = from.row + (Math.abs(dr) === 2 ? dr / 2 : 0);
      const legC = from.col + (Math.abs(dc) === 2 ? dc / 2 : 0);
      if (b[legR][legC]) continue; // 蹩马腿
      push(r, c);
    }
  } else if (piece === '车' || piece === '炮') {
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      let r = from.row + dr;
      let c = from.col + dc;
      let screen = false;
      while (inBoard('xiangqi', { row: r, col: c })) {
        const t = b[r][c];
        if (piece === '车') {
          if (!t) out.push({ row: r, col: c });
          else {
            if (sideOf(t) !== side) out.push({ row: r, col: c });
            break;
          }
        } else {
          if (!screen) {
            if (!t) out.push({ row: r, col: c });
            else screen = true; // 遇到炮架
          } else if (t) {
            if (sideOf(t) !== side) out.push({ row: r, col: c });
            break;
          }
        }
        r += dr;
        c += dc;
      }
    }
  } else if (piece === '兵' || piece === '卒') {
    const forward = side === 'red' ? -1 : 1;
    push(from.row + forward, from.col);
    const crossed = side === 'red' ? from.row <= 4 : from.row >= 5;
    if (crossed) {
      push(from.row, from.col - 1);
      push(from.row, from.col + 1);
    }
  }
  return out;
}

/* ---------------- 国际象棋 ---------------- */

function chessMoves(b: BoardMatrix, from: Pos, side: Side): Pos[] {
  const piece = kindOf(b[from.row][from.col]);
  const out: Pos[] = [];
  const push = (r: number, c: number) => {
    if (!inBoard('chess', { row: r, col: c })) return false;
    const t = b[r][c];
    if (t && sideOf(t) === side) return false;
    out.push({ row: r, col: c });
    return !t;
  };
  const slide = (dirs: readonly (readonly [number, number])[]) => {
    for (const [dr, dc] of dirs) {
      let r = from.row + dr;
      let c = from.col + dc;
      while (push(r, c)) {
        r += dr;
        c += dc;
      }
    }
  };

  if (piece === 'P') {
    const dir = side === 'white' ? -1 : 1;
    const startRow = side === 'white' ? 6 : 1;
    const one = { row: from.row + dir, col: from.col };
    if (inBoard('chess', one) && !b[one.row][one.col]) {
      out.push(one);
      const two = { row: from.row + 2 * dir, col: from.col };
      if (from.row === startRow && inBoard('chess', two) && !b[two.row][two.col]) out.push(two);
    }
    for (const dc of [-1, 1]) {
      const r = from.row + dir;
      const c = from.col + dc;
      if (!inBoard('chess', { row: r, col: c })) continue;
      const t = b[r][c];
      if (t && sideOf(t) !== side) out.push({ row: r, col: c });
    }
  } else if (piece === 'N') {
    for (const [dr, dc] of [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]] as const) {
      push(from.row + dr, from.col + dc);
    }
  } else if (piece === 'B') slide([[1, 1], [1, -1], [-1, 1], [-1, -1]] as const);
  else if (piece === 'R') slide([[1, 0], [-1, 0], [0, 1], [0, -1]] as const);
  else if (piece === 'Q')
    slide([[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const);
  else if (piece === 'K') {
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      push(from.row + dr, from.col + dc);
    }
  }
  return out;
}

/* ---------------- 围棋 ---------------- */

const NEIGH = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

function group(b: BoardMatrix, start: Pos): { stones: Pos[]; liberties: number } {
  const color = b[start.row][start.col];
  const seen = new Set<string>();
  const stones: Pos[] = [];
  const libs = new Set<string>();
  const stack = [start];
  while (stack.length) {
    const p = stack.pop()!;
    const key = `${p.row},${p.col}`;
    if (seen.has(key)) continue;
    seen.add(key);
    stones.push(p);
    for (const [dr, dc] of NEIGH) {
      const r = p.row + dr;
      const c = p.col + dc;
      if (!inBoard('go', { row: r, col: c })) continue;
      const t = b[r][c];
      if (!t) libs.add(`${r},${c}`);
      else if (t === color) stack.push({ row: r, col: c });
    }
  }
  return { stones, liberties: libs.size };
}

/** 围棋落子合法性（提子 / 自杀 / 简单劫由后端补充） */
export function goLegal(b: BoardMatrix, p: Pos, side: Side): boolean {
  if (!inBoard('go', p) || b[p.row][p.col]) return false;
  const probe = b.map((row) => [...row]);
  probe[p.row][p.col] = `${side === 'white' ? 'white' : 'black'}:S`;
  let captured = 0;
  for (const [dr, dc] of NEIGH) {
    const r = p.row + dr;
    const c = p.col + dc;
    if (!inBoard('go', { row: r, col: c })) continue;
    const t = probe[r][c];
    if (t && sideOf(t) !== side) {
      const g = group(probe, { row: r, col: c });
      if (g.liberties === 0) captured += g.stones.length;
    }
  }
  if (captured > 0) return true;
  return group(probe, p).liberties > 0;
}

/* ---------------- 统一入口 ---------------- */

export function legalTargets(kind: GameKind, b: BoardMatrix, from: Pos, side: Side): Pos[] {
  if (kind === 'xiangqi') return xiangqiMoves(b, from, side);
  if (kind === 'chess') return chessMoves(b, from, side);
  return [];
}

/** 应用一步（前端乐观更新；后端返回后以其为准） */
export function applyMove(kind: GameKind, b: BoardMatrix, mv: Move, side: Side): BoardMatrix {
  const next = b.map((row) => [...row]);
  if (kind === 'go' || mv.drop) {
    next[mv.to.row][mv.to.col] = `${side === 'white' ? 'white' : 'black'}:S`;
    // 提子
    for (const [dr, dc] of NEIGH) {
      const r = mv.to.row + dr;
      const c = mv.to.col + dc;
      if (!inBoard('go', { row: r, col: c })) continue;
      const t = next[r][c];
      if (t && sideOf(t) !== side) {
        const g = group(next, { row: r, col: c });
        if (g.liberties === 0) for (const s of g.stones) next[s.row][s.col] = null;
      }
    }
    return next;
  }
  if (!mv.from) return next;
  const piece = next[mv.from.row][mv.from.col];
  next[mv.from.row][mv.from.col] = null;
  next[mv.to.row][mv.to.col] = piece;
  return next;
}

export const otherSide = (s: Side): Side =>
  s === 'red' || s === 'white' ? (s === 'red' ? 'black' : 'black') : 'red';
