/** 中国象棋棋盘：10 行 × 9 列，含河界与九宫斜线 */
import type { Pos } from '../core/types';
import { BaseBoard, svgEl } from './boardView';

export interface XiangqiPiece {
  side: 'red' | 'black';
  /** 单字：帅仕相车马炮兵 / 将士象车马炮卒 */
  label: string;
}

const INIT_ROWS: string[] = [
  'rheaheahekrheaheahe'.slice(0, 9), // 占位，下面用显式布局
];

/** 初始布局（红下黑上；大写=红方简记） */
function initPieces(): (XiangqiPiece | null)[][] {
  const grid: (XiangqiPiece | null)[][] = Array.from({ length: 10 }, () =>
    Array.from({ length: 9 }, () => null),
  );
  const put = (row: number, spec: [number, string, 'red' | 'black'][]) => {
    for (const [col, label, side] of spec) grid[row][col] = { side, label };
  };
  // 黑方（上）
  put(0, [
    [0, '车', 'black'], [1, '马', 'black'], [2, '象', 'black'], [3, '士', 'black'],
    [4, '将', 'black'], [5, '士', 'black'], [6, '象', 'black'], [7, '马', 'black'], [8, '车', 'black'],
  ]);
  put(2, [[1, '炮', 'black'], [7, '炮', 'black']]);
  for (let c = 0; c < 9; c += 2) grid[3][c] = { side: 'black', label: '卒' };
  // 红方（下）
  put(9, [
    [0, '车', 'red'], [1, '马', 'red'], [2, '相', 'red'], [3, '仕', 'red'],
    [4, '帅', 'red'], [5, '仕', 'red'], [6, '相', 'red'], [7, '马', 'red'], [8, '车', 'red'],
  ]);
  put(7, [[1, '炮', 'red'], [7, '炮', 'red']]);
  for (let c = 0; c < 9; c += 2) grid[6][c] = { side: 'red', label: '兵' };
  return grid;
}

export class XiangqiBoard extends BaseBoard<XiangqiPiece> {
  get cols(): number { return 9; }
  get rows(): number { return 10; }

  private pieces = initPieces();

  constructor(host: HTMLElement) {
    super(host);
    // 字段就绪后再建 viewBox 并绘制；基类构造器不再自动绘制
    this.mount();
  }

  protected pieceAt(p: Pos): XiangqiPiece | null {
    return this.pieces[p.row]?.[p.col] ?? null;
  }

  protected drawGrid(): void {
    const g = this.gridLayer;
    const { cell, margin } = this;
    const w = margin * 2 + 8 * cell;
    const h = margin * 2 + 9 * cell;

    // 木色底
    const bg = svgEl('rect');
    bg.setAttribute('x', '0');
    bg.setAttribute('y', '0');
    bg.setAttribute('width', String(w));
    bg.setAttribute('height', String(h));
    bg.setAttribute('fill', 'var(--board-wood)');
    bg.setAttribute('rx', '8');
    g.appendChild(bg);

    // 横线 10 条
    for (let r = 0; r < 10; r++) {
      g.appendChild(this.line(margin, margin + r * cell, w - margin, margin + r * cell));
    }
    // 竖线：河界处中间断开（col 1..7 在 row4-5 之间不画）
    for (let c = 0; c < 9; c++) {
      if (c === 0 || c === 8) {
        g.appendChild(this.line(margin + c * cell, margin, margin + c * cell, h - margin));
      } else {
        g.appendChild(this.line(margin + c * cell, margin, margin + c * cell, margin + 4 * cell));
        g.appendChild(this.line(margin + c * cell, margin + 5 * cell, margin + c * cell, h - margin));
      }
    }
    // 外框加粗
    g.appendChild(this.line(margin, margin, w - margin, margin, 'var(--board-grid-strong)', 2.4));
    g.appendChild(this.line(margin, h - margin, w - margin, h - margin, 'var(--board-grid-strong)', 2.4));
    g.appendChild(this.line(margin, margin, margin, h - margin, 'var(--board-grid-strong)', 2.4));
    g.appendChild(this.line(w - margin, margin, w - margin, h - margin, 'var(--board-grid-strong)', 2.4));

    // 九宫斜线（上下）
    g.appendChild(this.line(margin + 3 * cell, margin, margin + 5 * cell, margin + 2 * cell));
    g.appendChild(this.line(margin + 5 * cell, margin, margin + 3 * cell, margin + 2 * cell));
    g.appendChild(this.line(margin + 3 * cell, h - margin, margin + 5 * cell, h - 2 * cell - margin));
    g.appendChild(this.line(margin + 5 * cell, h - margin, margin + 3 * cell, h - 2 * cell - margin));

    // 河界文字
    const ry = margin + 4.5 * cell;
    g.appendChild(this.text(margin + 2 * cell, ry, '楚 河', { size: cell * 0.42, fill: 'rgba(90,60,35,0.75)' }));
    g.appendChild(this.text(w - margin - 2 * cell, ry, '汉 界', { size: cell * 0.42, fill: 'rgba(90,60,35,0.75)' }));
  }

  protected renderPiece(p: Pos, piece: XiangqiPiece): void {
    const { x, y } = this.center(p);
    const r = this.cell * 0.42;
    const g = svgEl('g');
    g.appendChild(this.circle(x, y, r, '#f7ecd9', 'rgba(90,60,35,0.8)', 1.6));
    g.appendChild(this.circle(x, y, r * 0.86, 'none', piece.side === 'red' ? '#c0392b' : '#2c3e50', 1.2));
    const t = this.text(x, y + r * 0.04, piece.label, {
      size: r * 1.05,
      fill: piece.side === 'red' ? '#c0392b' : '#2c3e50',
      weight: '700',
    });
    g.appendChild(t);
    this.pieceLayer.appendChild(g);
  }

  /** 供外部直接替换棋盘局面（FEN 解析由后端负责，前端只收结构化棋子阵） */
  setPieces(grid: (XiangqiPiece | null)[][]): void {
    this.pieces = grid;
  }
}

void INIT_ROWS;
