/** 国际象棋棋盘：8×8，木色深浅交替格 + Unicode 棋子 */
import type { Pos } from '../core/types';
import { BaseBoard, svgEl } from './boardView';

export interface ChessPiece {
  side: 'white' | 'black';
  kind: 'K' | 'Q' | 'R' | 'B' | 'N' | 'P';
}

const GLYPH: Record<ChessPiece['kind'], [string, string]> = {
  K: ['♔', '♚'],
  Q: ['♕', '♛'],
  R: ['♖', '♜'],
  B: ['♗', '♝'],
  N: ['♘', '♞'],
  P: ['♙', '♟'],
};

/** 标准初始局面（白下黑上，row0=黑方底线） */
function initPieces(): (ChessPiece | null)[][] {
  const back: ChessPiece['kind'][] = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
  const grid: (ChessPiece | null)[][] = Array.from({ length: 8 }, () =>
    Array.from({ length: 8 }, () => null),
  );
  for (let c = 0; c < 8; c++) {
    grid[0][c] = { side: 'black', kind: back[c] };
    grid[1][c] = { side: 'black', kind: 'P' };
    grid[6][c] = { side: 'white', kind: 'P' };
    grid[7][c] = { side: 'white', kind: back[c] };
  }
  return grid;
}

export class ChessBoard extends BaseBoard<ChessPiece> {
  get cols(): number { return 8; }
  get rows(): number { return 8; }

  private pieces = initPieces();

  protected pieceAt(p: Pos): ChessPiece | null {
    return this.pieces[p.row]?.[p.col] ?? null;
  }

  protected drawGrid(): void {
    const g = this.gridLayer;
    const { cell, margin } = this;
    const w = margin * 2 + 7 * cell;
    const h = margin * 2 + 7 * cell;

    const bg = svgEl('rect');
    bg.setAttribute('x', '0');
    bg.setAttribute('y', '0');
    bg.setAttribute('width', String(w));
    bg.setAttribute('height', String(h));
    bg.setAttribute('fill', 'var(--board-wood)');
    bg.setAttribute('rx', '8');
    g.appendChild(bg);

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sq = svgEl('rect');
        sq.setAttribute('x', String(margin + c * cell));
        sq.setAttribute('y', String(margin + r * cell));
        sq.setAttribute('width', String(cell));
        sq.setAttribute('height', String(cell));
        // 深浅格：暖棕木色系（浅 var(--board-wood-light) / 深 var(--board-wood-dark)）
        sq.setAttribute('fill', (r + c) % 2 === 0 ? 'var(--board-wood-light)' : 'var(--board-wood-dark)');
        g.appendChild(sq);
      }
    }
    // 坐标标注 a-h / 1-8
    for (let c = 0; c < 8; c++) {
      g.appendChild(this.text(margin + c * cell, h - margin / 2, 'abcdefgh'[c], { size: 11, fill: 'rgba(255,255,255,0.75)' }));
    }
    for (let r = 0; r < 8; r++) {
      g.appendChild(this.text(margin / 2, margin + r * cell, String(8 - r), { size: 11, fill: 'rgba(255,255,255,0.75)' }));
    }
  }

  protected renderPiece(p: Pos, piece: ChessPiece): void {
    const { x, y } = this.center(p);
    const glyph = GLYPH[piece.kind][piece.side === 'white' ? 0 : 1];
    const t = this.text(x, y, glyph, {
      size: this.cell * 0.78,
      fill: piece.side === 'white' ? '#ffffff' : '#1f1a14',
      weight: '400',
    });
    t.setAttribute('style', 'paint-order: stroke; stroke: rgba(60,40,20,0.35); stroke-width: 1px;');
    this.pieceLayer.appendChild(t);
  }

  setPieces(grid: (ChessPiece | null)[][]): void {
    this.pieces = grid;
  }
}
