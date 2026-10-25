/** 三棋初始局面（UI 演示用；正式局面由后端 FEN 解析后注入） */
import type { ChessPiece } from '../boards/chess';
import type { XiangqiPiece } from '../boards/xiangqi';

const XIANGQI_RED: Record<string, string> = { R: '车', N: '马', B: '相', A: '仕', K: '帅', C: '炮', P: '兵' };
const XIANGQI_BLACK: Record<string, string> = { R: '车', N: '马', B: '象', A: '士', K: '将', C: '炮', P: '卒' };

/** 中国象棋初始局面（Xiangqi 表示法串，9 列 × 10 行） */
const XQ_ROWS = [
  'rheakaehr',
  '..........',
  '.c.....c.',
  'p.p.p.p.p',
  '..........',
  '..........',
  'P.P.P.P.P',
  '.C.....C.',
  '..........',
  'RHEAKAEHR',
];

export function startXiangqi(): (XiangqiPiece | null)[][] {
  return XQ_ROWS.map((line) =>
    line.split('').map((ch) => {
      if (ch === '.') return null;
      const upper = ch.toUpperCase();
      const isRed = ch === upper;
      return {
        side: isRed ? 'red' as const : 'black' as const,
        label: (isRed ? XIANGQI_RED : XIANGQI_BLACK)[upper] ?? upper,
      };
    }),
  );
}

/** 国际象棋 FEN 初始局面（rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR） */
const CHESS_BACK: ChessPiece['kind'][] = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];

export function startChess(): (ChessPiece | null)[][] {
  const grid: (ChessPiece | null)[][] = Array.from({ length: 8 }, () =>
    Array.from({ length: 8 }, () => null),
  );
  for (let c = 0; c < 8; c++) {
    grid[0][c] = { side: 'black', kind: CHESS_BACK[c] };
    grid[1][c] = { side: 'black', kind: 'P' };
    grid[6][c] = { side: 'white', kind: 'P' };
    grid[7][c] = { side: 'white', kind: CHESS_BACK[c] };
  }
  return grid;
}