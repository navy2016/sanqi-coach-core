/** 棋谱教学（444 局真实棋谱·六类）与残局挑战（10 个真实排局）抽屉 */
import { useMemo, useState } from 'react';
import studyData from '../data/study.json';
import endgameData from '../data/endgames.json';
import type { Move, Pos } from '../core/types';

interface StudyGame {
  id: string;
  name: string;
  category: string;
  moves: string[];
  result?: string;
}

interface Endgame {
  id: string;
  name: string;
  goal: string;
  fen: string;
}

const CATEGORIES = ['启蒙', '开局', '中局', '杀法', '战术', '残局'] as const;

const STUDY: StudyGame[] = studyData as StudyGame[];
const ENDGAMES: Endgame[] = endgameData as Endgame[];

/** ICCS 着法（如 h2e2）→ Move；象棋 rank 0 为红方底线 */
export function iccsToMove(iccs: string): Move | null {
  if (!/^[a-i][0-9][a-i][0-9]$/.test(iccs)) return null;
  const p = (f: string, r: string): Pos => ({
    col: f.charCodeAt(0) - 97,
    row: 9 - Number(r),
  });
  return {
    from: p(iccs[0], iccs[1]),
    to: p(iccs[2], iccs[3]),
    drop: false,
    promotion: null,
  };
}

export function StudyDrawer({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (game: StudyGame) => void;
}) {
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>('开局');
  const list = useMemo(() => STUDY.filter((g) => g.category === cat).slice(0, 60), [cat]);
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const g of STUDY) m[g.category] = (m[g.category] ?? 0) + 1;
    return m;
  }, []);

  return (
    <div className="drawer-mask" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <h3>棋谱教学</h3>
          <span className="muted">共 {STUDY.length} 局 · 六类</span>
          <button className="btn btn-ghost" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="drawer-tabs">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              className={`chip ${cat === c ? 'chip-on' : ''}`}
              onClick={() => setCat(c)}
            >
              {c} {counts[c] ?? 0}
            </button>
          ))}
        </div>
        <ul className="drawer-list">
          {list.map((g) => (
            <li key={g.id}>
              <button className="drawer-item" onClick={() => onPick(g)}>
                <span className="drawer-item-name">{g.name}</span>
                <span className="muted">{g.moves.length} 手</span>
              </button>
            </li>
          ))}
          {list.length === 0 && <li className="muted">该类暂无棋谱</li>}
        </ul>
      </div>
    </div>
  );
}

export function EndgameDrawer({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (fen: string, name: string) => void;
}) {
  return (
    <div className="drawer-mask" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <h3>残局挑战</h3>
          <span className="muted">{ENDGAMES.length} 个排局</span>
          <button className="btn btn-ghost" onClick={onClose}>
            关闭
          </button>
        </div>
        <ul className="drawer-list">
          {ENDGAMES.map((e) => (
            <li key={e.id}>
              <button className="drawer-item" onClick={() => onPick(e.fen, e.name)}>
                <span className="drawer-item-name">{e.name}</span>
                <span className="muted">{e.goal}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="muted">
          排局 FEN 来自开源棋谱库 `weiyinfu/xqp` 的「残局」目录，经 cchess 解析校验。
        </p>
      </div>
    </div>
  );
}
