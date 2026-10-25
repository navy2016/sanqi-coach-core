/** 棋盘：三棋 SVG 渲染 + 落点高亮（含五档评级着色） */
import { useMemo } from 'react';
import type { BoardMatrix, GameKind, Grade, Pos } from '../core/types';
import { SIZE, kindOf, sideOf } from '../core/rules';

const GRADE_FILL: Record<Grade, string> = {
  best: 'rgba(151,231,151,0.85)',
  good: 'rgba(140,190,255,0.85)',
  suspect: 'rgba(255,214,102,0.9)',
  mistake: 'rgba(255,160,90,0.9)',
  blunder: 'rgba(232,90,90,0.9)',
  global: 'rgba(255,196,0,0.95)',
};

export interface Hint {
  pos: Pos;
  grade?: Grade;
}

interface Props {
  kind: GameKind;
  board: BoardMatrix;
  selected: Pos | null;
  hints: Hint[];
  lastMove: { from: Pos | null; to: Pos } | null;
  onCell: (p: Pos) => void;
}

export function Board({ kind, board, selected, hints, lastMove, onCell }: Props) {
  const { rows, cols } = SIZE[kind];
  const cell = kind === 'go' ? 34 : 46;
  const margin = 30;
  const w = margin * 2 + (cols - 1) * cell;
  const h = margin * 2 + (rows - 1) * cell;
  const hintMap = useMemo(() => {
    const m = new Map<string, Grade | undefined>();
    for (const h of hints) m.set(`${h.pos.row},${h.pos.col}`, h.grade);
    return m;
  }, [hints]);

  const xy = (p: Pos) => ({ x: margin + p.col * cell, y: margin + p.row * cell });

  return (
    <svg
      className="board-svg"
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      role="grid"
      aria-label="棋盘"
      preserveAspectRatio="xMidYMid meet"
    >
      <rect x={0} y={0} width={w} height={h} rx={8} fill="var(--board-wood)" />

      {/* 网格 */}
      {Array.from({ length: rows }).map((_, r) =>
        kind === 'go' ? null : (
          <line
            key={`h${r}`}
            x1={margin}
            y1={margin + r * cell}
            x2={margin + (cols - 1) * cell}
            y2={margin + r * cell}
            stroke="rgba(120,86,56,0.55)"
            strokeWidth={1.2}
          />
        ),
      )}
      {Array.from({ length: cols }).map((_, c) =>
        kind === 'go' ? null : (
          <line
            key={`v${c}`}
            x1={margin + c * cell}
            y1={margin}
            x2={margin + c * cell}
            y2={margin + (rows - 1) * cell}
            stroke="rgba(120,86,56,0.55)"
            strokeWidth={1.2}
          />
        ),
      )}

      {/* 围棋：19 路 + 星位 */}
      {kind === 'go' && (
        <>
          {Array.from({ length: rows }).map((_, r) => (
            <line
              key={`gh${r}`}
              x1={margin}
              y1={margin + r * cell}
              x2={margin + (cols - 1) * cell}
              y2={margin + r * cell}
              stroke="rgba(120,86,56,0.5)"
              strokeWidth={1}
            />
          ))}
          {Array.from({ length: cols }).map((_, c) => (
            <line
              key={`gv${c}`}
              x1={margin + c * cell}
              y1={margin}
              x2={margin + c * cell}
              y2={margin + (rows - 1) * cell}
              stroke="rgba(120,86,56,0.5)"
              strokeWidth={1}
            />
          ))}
          {[3, 9, 15].map((r) =>
            [3, 9, 15].map((c) => (
              <circle key={`star${r}-${c}`} cx={margin + c * cell} cy={margin + r * cell} r={3} fill="rgba(90,62,40,0.8)" />
            )),
          )}
        </>
      )}

      {/* 象棋：河界 + 九宫斜线 */}
      {kind === 'xiangqi' && (
        <>
          <line
            x1={margin}
            y1={margin + 4.5 * cell}
            x2={margin + (cols - 1) * cell}
            y2={margin + 4.5 * cell}
            stroke="var(--board-wood)"
            strokeWidth={cell * 0.55}
          />
          <text x={margin + 2 * cell} y={margin + 4.5 * cell + 6} fill="rgba(110,78,50,0.75)" fontSize={16} textAnchor="middle">
            楚 河
          </text>
          <text x={margin + 6 * cell} y={margin + 4.5 * cell + 6} fill="rgba(110,78,50,0.75)" fontSize={16} textAnchor="middle">
            汉 界
          </text>
          {[0, 7].map((r0) => (
            <g key={`palace${r0}`}>
              <line x1={margin + 3 * cell} y1={margin + r0 * cell} x2={margin + 5 * cell} y2={margin + (r0 + 2) * cell} stroke="rgba(120,86,56,0.5)" strokeWidth={1.2} />
              <line x1={margin + 5 * cell} y1={margin + r0 * cell} x2={margin + 3 * cell} y2={margin + (r0 + 2) * cell} stroke="rgba(120,86,56,0.5)" strokeWidth={1.2} />
            </g>
          ))}
        </>
      )}

      {/* 最后一手 */}
      {lastMove && (
        <circle
          {...xy(lastMove.to)}
          r={cell * 0.42}
          fill="none"
          stroke="rgba(75,126,237,0.75)"
          strokeWidth={2.5}
        />
      )}

      {/* 落点提示（评级着色） */}
      {hints.map((h) => {
        const { x, y } = xy(h.pos);
        const fill = h.grade ? GRADE_FILL[h.grade] : 'rgba(75,126,237,0.55)';
        return kind === 'go' ? (
          <circle key={`hint${h.pos.row}-${h.pos.col}`} cx={x} cy={y} r={cell * 0.42} fill={fill} opacity={0.85} />
        ) : (
          <circle key={`hint${h.pos.row}-${h.pos.col}`} cx={x} cy={y} r={cell * 0.2} fill={fill} />
        );
      })}

      {/* 棋子 */}
      {board.map((row, r) =>
        row.map((c, col) => {
          if (!c) return null;
          const { x, y } = xy({ row: r, col });
          const side = sideOf(c);
          const isSel = selected?.row === r && selected?.col === col;
          if (kind === 'go') {
            return (
              <circle
                key={`p${r}-${col}`}
                cx={x}
                cy={y}
                r={cell * 0.44}
                fill={side === 'white' ? '#fafafa' : '#232326'}
                stroke={isSel ? 'var(--accent)' : 'rgba(0,0,0,0.35)'}
                strokeWidth={isSel ? 3 : 1}
              />
            );
          }
          const isRed = side === 'red' || side === 'white';
          return (
            <g key={`p${r}-${col}`} onClick={() => onCell({ row: r, col })} style={{ cursor: 'pointer' }}>
              <circle
                cx={x}
                cy={y}
                r={cell * 0.42}
                fill={kind === 'xiangqi' ? '#fdf6e9' : isRed ? '#fafafa' : '#2b2b2f'}
                stroke={isSel ? 'var(--accent)' : isRed ? '#b8443c' : '#1b1b1e'}
                strokeWidth={isSel ? 3.5 : 2}
              />
              <text
                x={x}
                y={y + cell * 0.17}
                textAnchor="middle"
                fontSize={cell * 0.52}
                fontWeight={700}
                fill={kind === 'xiangqi' ? (isRed ? '#b8443c' : '#1b1b1e') : isRed ? '#1b1b1e' : '#fafafa'}
              >
                {kindOf(c)}
              </text>
            </g>
          );
        }),
      )}

      {/* 点击层（空格落点） */}
      {Array.from({ length: rows }).map((_, r) =>
        Array.from({ length: cols }).map((_, c) => {
          const { x, y } = xy({ row: r, col: c });
          const has = board[r][c];
          const hinted = hintMap.has(`${r},${c}`);
          if (has && !hinted) return null;
          return (
            <rect
              key={`c${r}-${c}`}
              x={x - cell / 2}
              y={y - cell / 2}
              width={cell}
              height={cell}
              fill="transparent"
              onClick={() => onCell({ row: r, col: c })}
              style={{ cursor: 'pointer' }}
            />
          );
        }),
      )}
    </svg>
  );
}
