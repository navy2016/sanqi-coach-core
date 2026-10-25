/** 棋盘：三棋 SVG 渲染 + 落点五色着色 + 金★全局最优 + 走法箭头 + 围棋序号序列 */
import { useMemo } from 'react';
import type { BoardMatrix, CandidateEval, GameKind, Grade, Move, Pos } from '../core/types';
import { SIZE, kindOf, sideOf } from '../core/rules';

const GRADE_FILL: Record<Grade, string> = {
  best: 'rgba(76,175,80,0.85)',
  good: 'rgba(66,133,244,0.85)',
  suspect: 'rgba(255,193,7,0.9)',
  mistake: 'rgba(255,112,67,0.9)',
  blunder: 'rgba(229,57,53,0.9)',
  global: 'rgba(212,175,55,0.95)',
};

interface Props {
  kind: GameKind;
  board: BoardMatrix;
  selected: Pos | null;
  legal: Pos[];
  candidates: CandidateEval[];
  /** 当前假设推演的目标点（紫色强调） */
  preview: Move | null;
  /** 走法箭头序列（围棋 1→2→3→4） */
  arrows?: { from: Pos; to: Pos; label?: string }[];
  onCell: (p: Pos) => void;
}

export default function Board({ kind, board, selected, legal, candidates, preview, arrows, onCell }: Props) {
  const { rows, cols } = SIZE[kind];
  const cell = kind === 'go' ? 34 : 44;
  const margin = kind === 'go' ? 30 : 34;
  const w = margin * 2 + (cols - 1) * cell;
  const h = margin * 2 + (rows - 1) * cell;
  const px = (c: number) => margin + c * cell;
  const py = (r: number) => margin + r * cell;

  const gradeMap = useMemo(() => {
    const m = new Map<string, Grade>();
    for (const c of candidates) {
      if (c.global) m.set(`${c.move.to.row},${c.move.to.col}`, 'global');
      else m.set(`${c.move.to.row},${c.move.to.col}`, c.grade);
    }
    return m;
  }, [candidates]);

  const legalSet = useMemo(() => new Set(legal.map((p) => `${p.row},${p.col}`)), [legal]);

  return (
    <svg
      className="board-svg"
      viewBox={`0 0 ${w} ${h}`}
      style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 8 }}
      onClick={(e) => {
        const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * w;
        const y = ((e.clientY - rect.top) / rect.height) * h;
        const c = Math.round((x - margin) / cell);
        const r = Math.round((y - margin) / cell);
        if (r >= 0 && r < rows && c >= 0 && c < cols) onCell({ row: r, col: c });
      }}
    >
      <rect x="0" y="0" width={w} height={h} rx="8" fill="var(--board-wood)" />

      {kind === 'xiangqi' && <XiangqiGrid px={px} py={py} rows={rows} cols={cols} w={w} h={h} margin={margin} cell={cell} />}
      {kind === 'chess' && <ChessGrid px={px} py={py} rows={rows} cols={cols} cell={cell} margin={margin} />}
      {kind === 'go' && <GoGrid px={px} py={py} rows={rows} cols={cols} margin={margin} cell={cell} />}

      {/* 落点着色（含金★全局最优） */}
      {[...gradeMap.entries()].map(([key, g]) => {
        const [r, c] = key.split(',').map(Number);
        const isGlobal = g === 'global';
        return (
          <g key={`g-${key}`}>
            <circle
              cx={px(c)}
              cy={py(r)}
              r={isGlobal ? cell * 0.22 : cell * 0.2}
              fill={GRADE_FILL[g]}
              opacity={0.9}
            />
            {isGlobal && (
              <text
                x={px(c)}
                y={py(r) + 5}
                textAnchor="middle"
                fontSize={16}
                fill="#fff"
                style={{ pointerEvents: 'none' }}
              >
                ★
              </text>
            )}
          </g>
        );
      })}

      {/* 合法落点小点 */}
      {[...legalSet].map((key) => {
        if (gradeMap.has(key)) return null;
        const [r, c] = key.split(',').map(Number);
        return <circle key={`l-${key}`} cx={px(c)} cy={py(r)} r={5} fill="rgba(60,50,40,0.35)" />;
      })}

      {/* 棋子 */}
      {board.map((row, r) =>
        row.map((cellv, c) => {
          if (!cellv) return null;
          const [side, name] = cellv.split(':');
          const isSel = selected && selected.row === r && selected.col === c;
          return (
            <g key={`p-${r}-${c}`}>
              {kind === 'go' ? (
                <circle
                  cx={px(c)}
                  cy={py(r)}
                  r={cell * 0.45}
                  fill={side === 'white' ? '#fdfdfb' : '#1b1b1b'}
                  stroke={side === 'white' ? '#b9b2a6' : '#000'}
                  strokeWidth={1}
                />
              ) : (
                <>
                  <circle
                    cx={px(c)}
                    cy={py(r)}
                    r={cell * 0.42}
                    fill={kind === 'xiangqi' ? '#fdf6e8' : side === 'white' ? '#fdfdfb' : '#1b1b1b'}
                    stroke={isSel ? '#4b7eed' : kind === 'xiangqi' ? (side === 'red' ? '#c0392b' : '#2b2b2b') : side === 'white' ? '#8d8578' : '#000'}
                    strokeWidth={isSel ? 3 : 1.5}
                  />
                  <text
                    x={px(c)}
                    y={py(r) + (kind === 'xiangqi' ? 6 : 7)}
                    textAnchor="middle"
                    fontSize={kind === 'xiangqi' ? 19 : 22}
                    fontWeight={600}
                    fill={kind === 'xiangqi' ? (side === 'red' ? '#c0392b' : '#2b2b2b') : side === 'white' ? '#fdfdfb' : '#1b1b1b'}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {glyph(kind, side, name)}
                  </text>
                </>
              )}
            </g>
          );
        }),
      )}

      {/* 走法箭头 */}
      {(arrows ?? []).map((a, i) => (
        <Arrow key={`a-${i}`} x1={px(a.from.col)} y1={py(a.from.row)} x2={px(a.to.col)} y2={py(a.to.row)} label={a.label} />
      ))}

      {/* 当前假设推演落点：紫色强调 */}
      {preview?.from && (
        <circle
          cx={px(preview.from.col)}
          cy={py(preview.from.row)}
          r={cell * 0.46}
          fill="none"
          stroke="rgba(124,77,255,0.9)"
          strokeWidth={3}
        />
      )}
    </svg>
  );
}

function glyph(kind: GameKind, side: string, name: string): string {
  if (kind === 'xiangqi') {
    const m: Record<string, [string, string]> = {
      K: ['帅', '将'], A: ['仕', '士'], E: ['相', '象'], H: ['马', '马'],
      R: ['车', '车'], C: ['炮', '炮'], P: ['兵', '卒'],
    };
    const p = m[name] ?? ['?', '?'];
    return side === 'white' ? p[0] : p[1];
  }
  const map: Record<string, string> = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
  return map[name] ?? '?';
}

function Arrow({ x1, y1, x2, y2, label }: { x1: number; y1: number; x2: number; y2: number; label?: string }) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const sx = x1 + ux * 14;
  const sy = y1 + uy * 14;
  const ex = x2 - ux * 16;
  const ey = y2 - uy * 16;
  return (
    <g>
      <line x1={sx} y1={sy} x2={ex} y2={ey} stroke="rgba(124,77,255,0.9)" strokeWidth={3} markerEnd="url(#arrowhead)" />
      {label && (
        <g>
          <circle cx={x2} cy={y2} r={11} fill="#fff" stroke="rgba(124,77,255,0.9)" strokeWidth={2} />
          <text x={x2} y={y2 + 4} textAnchor="middle" fontSize={12} fill="#5b3bb5">
            {label}
          </text>
        </g>
      )}
      <defs>
        <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="rgba(124,77,255,0.9)" />
        </marker>
      </defs>
    </g>
  );
}

function XiangqiGrid(p: { px: (c: number) => number; py: (r: number) => number; rows: number; cols: number; w: number; h: number; margin: number; cell: number }) {
  const { px, py, rows, cols, margin, cell } = p;
  const lines = [];
  for (let r = 0; r < rows; r++) {
    lines.push(<line key={`h${r}`} x1={px(0)} y1={py(r)} x2={px(cols - 1)} y2={py(r)} stroke="#8d6e4f" strokeWidth={1.2} />);
  }
  for (let c = 0; c < cols; c++) {
    if (c === 0 || c === cols - 1) {
      lines.push(<line key={`v${c}`} x1={px(c)} y1={py(0)} x2={px(c)} y2={py(rows - 1)} stroke="#8d6e4f" strokeWidth={1.2} />);
    } else {
      lines.push(<line key={`v${c}a`} x1={px(c)} y1={py(0)} x2={px(c)} y2={py(4)} stroke="#8d6e4f" strokeWidth={1.2} />);
      lines.push(<line key={`v${c}b`} x1={px(c)} y1={py(5)} x2={px(c)} y2={py(rows - 1)} stroke="#8d6e4f" strokeWidth={1.2} />);
    }
  }
  const palace = (top: number) => (
    <g key={`pal${top}`}>
      <line x1={px(3)} y1={py(top)} x2={px(5)} y2={py(top + 2)} stroke="#8d6e4f" strokeWidth={1.2} />
      <line x1={px(5)} y1={py(top)} x2={px(3)} y2={py(top + 2)} stroke="#8d6e4f" strokeWidth={1.2} />
    </g>
  );
  return (
    <g>
      <rect x={px(0) - 6} y={py(0) - 6} width={px(cols - 1) - px(0) + 12} height={py(rows - 1) - py(0) + 12} fill="none" stroke="#8d6e4f" strokeWidth={2} rx={4} />
      {lines}
      {palace(0)}
      {palace(7)}
      <text x={(px(0) + px(cols - 1)) / 2} y={py(4) + 22} textAnchor="middle" fontSize={15} fill="#8d6e4f" letterSpacing={6}>
        楚 河　　漢 界
      </text>
      {Array.from({ length: cols }, (_, c) => (
        <text key={`cf${c}`} x={px(c)} y={margin - 14} textAnchor="middle" fontSize={10} fill="#8d6e4f">
          {'ABCDEFGHI'[c]}
        </text>
      ))}
    </g>
  );
}

function ChessGrid(p: { px: (c: number) => number; py: (r: number) => number; rows: number; cols: number; cell: number; margin: number }) {
  const { px, py, rows, cols, cell, margin } = p;
  const squares = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const light = (r + c) % 2 === 0;
      squares.push(
        <rect
          key={`s${r}-${c}`}
          x={px(c) - cell / 2}
          y={py(r) - cell / 2}
          width={cell}
          height={cell}
          fill={light ? '#f0d9b5' : '#b58863'}
        />,
      );
    }
  }
  return (
    <g>
      {squares}
      {Array.from({ length: cols }, (_, c) => (
        <text key={`f${c}`} x={px(c)} y={margin - 14} textAnchor="middle" fontSize={10} fill="#6b4f36">
          {'abcdefgh'[c]}
        </text>
      ))}
      {Array.from({ length: rows }, (_, r) => (
        <text key={`r${r}`} x={margin - 18} y={py(r) + 4} textAnchor="middle" fontSize={10} fill="#6b4f36">
          {rows - r}
        </text>
      ))}
    </g>
  );
}

function GoGrid(p: { px: (c: number) => number; py: (r: number) => number; rows: number; cols: number; margin: number; cell: number }) {
  const { px, py, rows, cols, margin, cell } = p;
  const lines = [];
  for (let r = 0; r < rows; r++) {
    lines.push(<line key={`gh${r}`} x1={px(0)} y1={py(r)} x2={px(cols - 1)} y2={py(r)} stroke="#6b4f36" strokeWidth={1} />);
  }
  for (let c = 0; c < cols; c++) {
    lines.push(<line key={`gv${c}`} x1={px(c)} y1={py(0)} x2={px(c)} y2={py(rows - 1)} stroke="#6b4f36" strokeWidth={1} />);
  }
  const stars = rows === 19
    ? [[3, 3], [3, 9], [3, 15], [9, 3], [9, 9], [9, 15], [15, 3], [15, 9], [15, 15]]
    : rows === 9
      ? [[2, 2], [2, 6], [4, 4], [6, 2], [6, 6]]
      : [];
  return (
    <g>
      {lines}
      {stars.map(([r, c]) => (
        <circle key={`st${r}-${c}`} cx={px(c)} cy={py(r)} r={3} fill="#6b4f36" />
      ))}
      {Array.from({ length: cols }, (_, c) => (
        <text key={`gcf${c}`} x={px(c)} y={margin - 12} textAnchor="middle" fontSize={10} fill="#6b4f36">
          {'ABCDEFGHJKLMNOPQRST'[c]}
        </text>
      ))}
      {Array.from({ length: rows }, (_, r) => (
        <text key={`gcr${r}`} x={margin - 16} y={py(r) + 4} textAnchor="middle" fontSize={10} fill="#6b4f36">
          {rows - r}
        </text>
      ))}
    </g>
  );
}
