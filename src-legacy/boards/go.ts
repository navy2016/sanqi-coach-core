/** 围棋棋盘：19×19（支持 9/13 路可选），含星位 */
import type { Pos } from '../core/types';
import { BaseBoard, svgEl } from './boardView';

export type GoStone = 'black' | 'white';

export class GoBoard extends BaseBoard<GoStone> {
  readonly size: 9 | 13 | 19;

  constructor(host: HTMLElement, size: 9 | 13 | 19 = 19) {
    super(host);
    this.size = size;
    // size 就绪后才能算 viewBox；否则 cols/rows 读到 undefined → viewBox "0 0 NaN NaN"
    this.mount();
  }

  get cols(): number { return this.size; }
  get rows(): number { return this.size; }

  private pieces: (GoStone | null)[][] = Array.from({ length: 19 }, () =>
    Array.from({ length: 19 }, () => null),
  );

  protected pieceAt(p: Pos): GoStone | null {
    return this.pieces[p.row]?.[p.col] ?? null;
  }

  /** 星位坐标（按路数） */
  private starPoints(): Pos[] {
    if (this.size === 19) {
      const s = [3, 9, 15];
      const pts: Pos[] = [];
      for (const r of s) for (const c of s) pts.push({ col: c, row: r });
      return pts;
    }
    if (this.size === 13) {
      const s = [3, 6, 9];
      const pts: Pos[] = [];
      for (const r of s) for (const c of s) pts.push({ col: c, row: r });
      return pts;
    }
    // 9 路：四星 + 天元
    const s = [2, 6];
    const pts: Pos[] = [];
    for (const r of s) for (const c of s) pts.push({ col: c, row: r });
    pts.push({ col: 4, row: 4 });
    return pts;
  }

  protected drawGrid(): void {
    const g = this.gridLayer;
    const { cell, margin } = this;
    const n = this.size;
    const w = margin * 2 + (n - 1) * cell;
    const h = w;

    // 木色底
    const bg = svgEl('rect');
    bg.setAttribute('x', '0');
    bg.setAttribute('y', '0');
    bg.setAttribute('width', String(w));
    bg.setAttribute('height', String(h));
    bg.setAttribute('fill', 'var(--board-wood)');
    bg.setAttribute('rx', '8');
    g.appendChild(bg);

    for (let i = 0; i < n; i++) {
      g.appendChild(this.line(margin, margin + i * cell, w - margin, margin + i * cell));
      g.appendChild(this.line(margin + i * cell, margin, margin + i * cell, h - margin));
    }
    // 外框加粗
    g.appendChild(this.line(margin, margin, w - margin, margin, 'var(--board-grid-strong)', 2.2));
    g.appendChild(this.line(margin, h - margin, w - margin, h - margin, 'var(--board-grid-strong)', 2.2));
    g.appendChild(this.line(margin, margin, margin, h - margin, 'var(--board-grid-strong)', 2.2));
    g.appendChild(this.line(w - margin, margin, w - margin, h - margin, 'var(--board-grid-strong)', 2.2));

    // 星位
    for (const p of this.starPoints()) {
      const { x, y } = this.center(p);
      g.appendChild(this.circle(x, y, Math.max(3, cell * 0.09), 'rgba(80,50,28,0.9)'));
    }
  }

  protected renderPiece(p: Pos, stone: GoStone): void {
    const { x, y } = this.center(p);
    const r = this.cell * 0.46;
    if (stone === 'black') {
      const c = this.circle(x, y, r, '#1d1a17', 'rgba(0,0,0,0.4)', 1);
      c.setAttribute('opacity', '0.96');
      this.pieceLayer.appendChild(c);
    } else {
      const c = this.circle(x, y, r, '#f8f6f2', 'rgba(60,40,20,0.55)', 1.2);
      this.pieceLayer.appendChild(c);
    }
  }

  setStones(grid: (GoStone | null)[][]): void {
    this.pieces = grid;
  }
}
