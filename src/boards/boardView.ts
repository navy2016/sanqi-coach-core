/**
 * 棋盘渲染基类：SVG 绘制 + 点击坐标映射 + 选中/落点提示/最后一手高亮
 * 三棋子类只需实现网格绘制与棋子渲染。
 */
import type { Pos } from '../core/types';

export interface BoardState<P> {
  pieces: (P | null)[][];
  selected?: Pos | null;
  /** 落点提示（合法落点） */
  hints?: Pos[];
  lastMove?: { from: Pos | null; to: Pos } | null;
}

export function svgEl<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS('http://www.w3.org/2000/svg', tag);
}

export abstract class BaseBoard<P> {
  readonly root: SVGSVGElement;
  protected cell = 44;
  protected margin = 30;
  protected gridLayer!: SVGGElement;
  protected pieceLayer!: SVGGElement;
  protected hintLayer!: SVGGElement;
  private state: BoardState<P> = { pieces: [] };
  onClick: ((pos: Pos) => void) | null = null;

  constructor(protected host: HTMLElement) {
    this.root = svgEl('svg');
    this.root.setAttribute('class', 'board-svg');
    this.root.setAttribute('role', 'img');
    this.host.appendChild(this.root);
    this.gridLayer = svgEl('g');
    this.pieceLayer = svgEl('g');
    this.hintLayer = svgEl('g');
    this.root.append(this.gridLayer, this.pieceLayer, this.hintLayer);
    this.layout();
    this.drawGrid();
    this.bindClicks();
  }

  abstract get cols(): number;
  abstract get rows(): number;
  /** 一次性绘制棋盘网格（河界/九宫/星位等） */
  protected abstract drawGrid(): void;
  /** 读取某格棋子 */
  protected abstract pieceAt(p: Pos): P | null;
  /** 渲染一枚棋子到 pieceLayer */
  protected abstract renderPiece(p: Pos, piece: P): void;

  /** 坐标 → 像素中心 */
  center(p: Pos): { x: number; y: number } {
    return { x: this.margin + p.col * this.cell, y: this.margin + p.row * this.cell };
  }

  /** 像素 → 坐标 */
  posAt(px: number, py: number): Pos | null {
    const col = Math.round((px - this.margin) / this.cell);
    const row = Math.round((py - this.margin) / this.cell);
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return null;
    return { col, row };
  }

  private layout(): void {
    const w = this.margin * 2 + (this.cols - 1) * this.cell;
    const h = this.margin * 2 + (this.rows - 1) * this.cell;
    this.root.setAttribute('viewBox', `0 0 ${w} ${h}`);
    this.root.setAttribute('width', String(w));
    this.root.setAttribute('height', String(h));
  }

  /** 更新棋盘状态（棋子/选中/落点提示/最后一手） */
  setState(state: BoardState<P>): void {
    this.state = state;
    this.pieceLayer.replaceChildren();
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const piece = state.pieces[r]?.[c];
        if (piece != null) this.renderPiece({ col: c, row: r }, piece);
      }
    }
    this.drawLastMove();
    this.drawHints();
  }

  private drawLastMove(): void {
    const lm = this.state.lastMove;
    if (!lm) return;
    for (const p of [lm.from, lm.to]) {
      if (!p) continue;
      const { x, y } = this.center(p);
      const ring = svgEl('rect');
      const s = this.cell * 0.86;
      ring.setAttribute('x', String(x - s / 2));
      ring.setAttribute('y', String(y - s / 2));
      ring.setAttribute('width', String(s));
      ring.setAttribute('height', String(s));
      ring.setAttribute('rx', '3');
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', 'rgba(46,152,84,0.9)');
      ring.setAttribute('stroke-width', '2');
      ring.setAttribute('class', 'last-move-mark');
      this.hintLayer.appendChild(ring);
    }
  }

  private drawHints(): void {
    for (const p of this.state.hints ?? []) {
      const { x, y } = this.center(p);
      const dot = svgEl('circle');
      dot.setAttribute('cx', String(x));
      dot.setAttribute('cy', String(y));
      dot.setAttribute('r', String(this.cell * 0.16));
      dot.setAttribute('fill', 'rgba(75,126,237,0.55)');
      dot.setAttribute('class', 'hint-dot');
      this.hintLayer.appendChild(dot);
    }
    if (this.state.selected) {
      const { x, y } = this.center(this.state.selected);
      const halo = svgEl('circle');
      halo.setAttribute('cx', String(x));
      halo.setAttribute('cy', String(y));
      halo.setAttribute('r', String(this.cell * 0.5));
      halo.setAttribute('fill', 'none');
      halo.setAttribute('stroke', 'rgba(75,126,237,0.9)');
      halo.setAttribute('stroke-width', '2.5');
      halo.setAttribute('class', 'hint-dot');
      this.hintLayer.appendChild(halo);
    }
  }

  private bindClicks(): void {
    this.root.addEventListener('click', (ev) => {
      const rect = this.root.getBoundingClientRect();
      const scale = this.root.viewBox.baseVal.width / rect.width;
      const pos = this.posAt((ev.clientX - rect.left) * scale, (ev.clientY - rect.top) * scale);
      if (pos && this.onClick) this.onClick(pos);
    });
  }

  /** 文本辅助 */
  protected text(x: number, y: number, s: string, opts: {
    size?: number; fill?: string; weight?: string; anchor?: string; family?: string;
  } = {}): SVGTextElement {
    const t = svgEl('text');
    t.setAttribute('x', String(x));
    t.setAttribute('y', String(y));
    t.setAttribute('font-size', String(opts.size ?? 14));
    t.setAttribute('fill', opts.fill ?? '#5a3c23');
    if (opts.weight) t.setAttribute('font-weight', opts.weight);
    t.setAttribute('text-anchor', opts.anchor ?? 'middle');
    t.setAttribute('dominant-baseline', 'central');
    if (opts.family) t.setAttribute('font-family', opts.family);
    t.textContent = s;
    return t;
  }

  protected line(x1: number, y1: number, x2: number, y2: number, stroke?: string, width = 1.4): SVGLineElement {
    const l = svgEl('line');
    l.setAttribute('x1', String(x1));
    l.setAttribute('y1', String(y1));
    l.setAttribute('x2', String(x2));
    l.setAttribute('y2', String(y2));
    l.setAttribute('stroke', stroke ?? 'var(--board-line)');
    l.setAttribute('stroke-width', String(width));
    return l;
  }

  protected circle(cx: number, cy: number, r: number, fill: string, stroke?: string, sw = 1.5): SVGCircleElement {
    const c = svgEl('circle');
    c.setAttribute('cx', String(cx));
    c.setAttribute('cy', String(cy));
    c.setAttribute('r', String(r));
    c.setAttribute('fill', fill);
    if (stroke) {
      c.setAttribute('stroke', stroke);
      c.setAttribute('stroke-width', String(sw));
    }
    return c;
  }
}
