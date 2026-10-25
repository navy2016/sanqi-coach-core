/** 三棋思维教练 v2 · 主界面（对齐原文：棋盘 + 右侧面板 + 底部操作条） */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AiSettings,
  BoardMatrix,
  CoachText,
  Difficulty,
  GameKind,
  Move,
  Pos,
  PreviewResult,
  ReviewItem,
  Side,
} from '../core/types';
import { SIZE, applyMove, initialBoard, kindOf, legalTargets, sideOf } from '../core/rules';
import { api, buildPreview, gradeOf, moveText } from '../core/bridge';
import { Board, type Hint } from './Board';
import { CoachPanel, PreviewPanel, ReviewPanel } from './Panel';
import { EndgameDrawer, StudyDrawer } from './Drawers';

const KIND_LABEL: Record<GameKind, string> = { xiangqi: '中国象棋', chess: '国际象棋', go: '围棋' };
const SIDE_OF: Record<GameKind, Side> = { xiangqi: 'red', chess: 'white', go: 'black' };

interface HistoryEntry {
  move: Move;
  san: string;
  side: Side;
  loss: number;
}

export default function App() {
  const [kind, setKind] = useState<GameKind>('xiangqi');
  const [board, setBoard] = useState<BoardMatrix>(() => initialBoard('xiangqi'));
  const [turn, setTurn] = useState<Side>('red');
  const [selected, setSelected] = useState<Pos | null>(null);
  const [hints, setHints] = useState<Hint[]>([]);
  const [pending, setPending] = useState<Move | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>('intermediate');
  const [coach, setCoach] = useState<CoachText | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [review, setReview] = useState<ReviewItem[]>([]);
  const [summary, setSummary] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [lastMove, setLastMove] = useState<{ from: Pos | null; to: Pos } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showStudy, setShowStudy] = useState(false);
  const [showEndgame, setShowEndgame] = useState(false);
  const [settings, setSettings] = useState<AiSettings>({ baseUrl: '', apiKey: '', model: '' });

  const playerSide = SIDE_OF[kind];
  const aiSide: Side = kind === 'go' ? 'white' : 'black';

  useEffect(() => {
    const raw = localStorage.getItem('sanqi.ai');
    if (raw) {
      try {
        setSettings(JSON.parse(raw) as AiSettings);
      } catch {
        /* 忽略损坏配置 */
      }
    }
  }, []);

  const reset = useCallback((k: GameKind) => {
    setKind(k);
    setBoard(initialBoard(k));
    setTurn(SIDE_OF[k]);
    setSelected(null);
    setHints([]);
    setPending(null);
    setPreview(null);
    setCoach(null);
    setReview([]);
    setSummary('');
    setHistory([]);
    setLastMove(null);
  }, []);

  /** 点击棋盘：选子 → 选落点 → 出变化树（不落子） */
  const onCell = useCallback(
    async (p: Pos) => {
      if (loading) return;
      const cell = board[p.row][p.col];
      const cellSide = sideOf(cell);

      // 选自己的棋子
      if (cellSide === turn) {
        setSelected(p);
        setPending(null);
        setPreview(null);
        if (kind === 'go') {
          setHints([]);
          return;
        }
        const targets = legalTargets(kind, board, p, turn);
        setHints(targets.map((t) => ({ pos: t })));
        return;
      }

      // 围棋：直接落子（无 from）
      if (kind === 'go') {
        const mv: Move = { from: null, to: p, drop: true };
        await runPreview(mv);
        return;
      }

      if (!selected) return;
      const mv: Move = { from: selected, to: p };
      await runPreview(mv);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [board, kind, selected, turn, loading, difficulty],
  );

  const runPreview = useCallback(
    async (mv: Move) => {
      setLoading(true);
      setPending(mv);
      setPreview(null);
      const san = moveText(kind, board, mv);
      try {
        const res = await api.preview(kind, board, turn, mv, difficulty);
        setPreview(res);
        // 落点用评级着色
        const mine = res.candidates.find((c) => c.san === san);
        setHints([{ pos: mv.to, grade: mine?.grade }]);
      } finally {
        setLoading(false);
      }
    },
    [board, difficulty, kind, turn],
  );

  /** 确认落子 → 玩家走 → AI 应手 */
  const confirmMove = useCallback(async () => {
    if (!pending) return;
    const san = moveText(kind, board, pending);
    const clicked = preview?.candidates.find((c) => c.san === san);
    const next = await api.confirm(kind, board, turn, pending);
    const entry: HistoryEntry = { move: pending, san, side: turn, loss: clicked?.loss ?? 0 };

    setBoard(next);
    setHistory((h) => [...h, entry]);
    setLastMove({ from: pending.from, to: pending.to });
    setPending(null);
    setPreview(null);
    setSelected(null);
    setHints([]);

    // AI 应手（同一套启发式，按难度取候选）
    const opp: Side = turn === 'red' || turn === 'black' ? (turn === 'red' ? 'black' : 'red') : 'white';
    const aiTurn: Side = kind === 'go' ? (turn === 'black' ? 'white' : 'black') : opp;
    const aiMove = pickAiMove(kind, next, aiTurn, difficulty);
    if (aiMove) {
      const afterAi = await api.confirm(kind, next, aiTurn, aiMove);
      setBoard(afterAi);
      setLastMove({ from: aiMove.from, to: aiMove.to });
      setHistory((h) => [...h, { move: aiMove, san: moveText(kind, next, aiMove), side: aiTurn, loss: 0 }]);
      setTurn(turn);
    } else {
      setTurn(aiTurn);
    }
  }, [board, difficulty, kind, pending, preview, turn]);

  const swapMove = useCallback(() => {
    setPending(null);
    setPreview(null);
    setHints(selected && kind !== 'go' ? legalTargets(kind, board, selected, turn).map((t) => ({ pos: t })) : []);
  }, [board, kind, selected, turn]);

  /** 悔棋：退回玩家自己上一步之前（含 AI 应手） */
  const undo = useCallback(async () => {
    if (history.length === 0) return;
    const back = history.slice();
    let steps = 0;
    // 至少退掉玩家一手；若最后是 AI 应手，一并退掉
    while (back.length > 0 && steps < 2) {
      const last = back.pop()!;
      steps++;
      if (last.side === playerSide) break;
    }
    let b = initialBoard(kind);
    for (const h of back) b = applyMove(kind, b, h.move, h.side);
    setBoard(b);
    setHistory(back);
    setTurn(playerSide);
    setSelected(null);
    setHints([]);
    setPending(null);
    setPreview(null);
    setLastMove(back.length ? { from: back[back.length - 1].move.from, to: back[back.length - 1].move.to } : null);
    await api.undo(kind, b);
  }, [history, kind, playerSide]);

  const runReview = useCallback(() => {
    const items: ReviewItem[] = history.map((h, i) => ({
      ply: i + 1,
      san: h.san,
      loss: h.loss,
      grade: gradeOf(h.loss),
      turning: h.loss > 180,
    }));
    setReview(items);
    const worst = items.filter((i) => i.turning).map((i) => `第 ${i.ply} 手 ${i.san}`);
    setSummary(
      items.length === 0
        ? ''
        : worst.length
          ? `这一盘从 ${worst[0]} 开始崩，共 ${worst.length} 处需要重点复盘。`
          : '这一盘没有明显失误，继续保持「先看对方最强应对」的习惯。',
    );
  }, [history]);

  const askCoach = useCallback(
    async (mode: 'position' | 'piece') => {
      setCoachLoading(true);
      const ctx =
        mode === 'position'
          ? `当前轮到${turn === 'red' || turn === 'black' ? (turn === 'red' ? '红方' : '黑方') : '白方'}走，${KIND_LABEL[kind]}第 ${history.length + 1} 手。`
          : `选中棋子：${selected ? kindOf(board[selected.row][selected.col]) : '无'}。`;
      try {
        setCoach(await api.coach(settings, mode, ctx));
      } finally {
        setCoachLoading(false);
      }
    },
    [board, history.length, kind, selected, settings, turn],
  );

  const saveSettings = () => {
    localStorage.setItem('sanqi.ai', JSON.stringify(settings));
    setShowSettings(false);
  };

  const boardEl = useMemo(
    () => (
      <Board kind={kind} board={board} selected={selected} hints={hints} lastMove={lastMove} onCell={(p) => void onCell(p)} />
    ),
    [board, hints, kind, lastMove, onCell, selected],
  );

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">🧠 三棋思维教练</div>
        <nav className="tabs">
          {(Object.keys(KIND_LABEL) as GameKind[]).map((k) => (
            <button
              key={k}
              type="button"
              className={`tab-btn ${kind === k ? 'active' : ''}`}
              onClick={() => reset(k)}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </nav>
        <select
          className="difficulty-select"
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value as Difficulty)}
          aria-label="AI 难度"
        >
          <option value="beginner">入门</option>
          <option value="intermediate">进阶</option>
          <option value="challenge">挑战</option>
        </select>
        <button className="btn btn-ghost" type="button" onClick={() => setShowSettings(true)}>
          ⚙️ AI 设置
        </button>
      </header>

      <main className="app-main">
        <div className="board-wrap">
          {boardEl}
          <div className="board-meta">
            <span>轮到：{turn === 'red' ? '红方' : turn === 'black' ? '黑方' : '白方'}</span>
            <span>已走 {history.length} 手</span>
          </div>
        </div>

        <aside className="side-panel">
          <PreviewPanel
            loading={loading}
            preview={preview}
            onSwap={swapMove}
            onConfirm={() => void confirmMove()}
          />
          <CoachPanel
            text={coach}
            loading={coachLoading}
            hasSelection={!!selected}
            onPosition={() => void askCoach('position')}
            onPiece={() => void askCoach('piece')}
          />
          <ReviewPanel items={review} summary={summary} />
        </aside>
      </main>

      <footer className="bottom-bar">
        <button className="btn btn-bar" type="button" onClick={() => void undo()}>
          ↩ 悔棋
        </button>
        <button className="btn btn-bar" type="button" onClick={runReview}>
          复盘
        </button>
        <button className="btn btn-bar" type="button" onClick={() => setShowStudy(true)}>
          棋谱教学
        </button>
        <button className="btn btn-bar" type="button" onClick={() => setShowEndgame(true)}>
          残局挑战
        </button>
      </footer>

      {showSettings && (
        <div className="modal-mask" onClick={() => setShowSettings(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>AI 服务设置</h3>
            <p className="muted">填 DeepSeek / 智谱 GLM / Doubao-Seed-Evolving 的 OpenAI 兼容端点。不填也能下棋，讲解走基础提示。</p>
            <label>
              Base URL
              <input
                value={settings.baseUrl}
                onChange={(e) => setSettings({ ...settings, baseUrl: e.target.value })}
                placeholder="https://ark.cn-beijing.volces.com/api/v3"
              />
            </label>
            <label>
              API Key
              <input
                type="password"
                value={settings.apiKey}
                onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
                placeholder="sk-..."
              />
            </label>
            <label>
              模型
              <input
                value={settings.model}
                onChange={(e) => setSettings({ ...settings, model: e.target.value })}
                placeholder="doubao-seed-evolving"
              />
            </label>
            <div className="row-actions">
              <button className="btn btn-ghost" type="button" onClick={() => setShowSettings(false)}>
                取消
              </button>
              <button className="btn btn-primary" type="button" onClick={saveSettings}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {showStudy && <StudyDrawer onClose={() => setShowStudy(false)} />}
      {showEndgame && (
        <EndgameDrawer
          onClose={() => setShowEndgame(false)}
          onLoad={(fen) => {
            setShowEndgame(false);
            void fen;
          }}
        />
      )}
    </div>
  );
}

/** AI 应手：按难度从前 N 个候选中带权选择 */
function pickAiMove(kind: GameKind, board: BoardMatrix, side: Side, difficulty: Difficulty): Move | null {
  const moves: Move[] = [];
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      const cell = board[r][c];
      if (!cell || sideOf(cell) !== side) continue;
      if (kind === 'go') {
        for (let rr = 0; rr < board.length; rr++) {
          for (let cc = 0; cc < board[rr].length; cc++) {
            if (!board[rr][cc]) moves.push({ from: null, to: { row: rr, col: cc }, drop: true });
          }
        }
        break;
      }
      for (const t of legalTargets(kind, board, { row: r, col: c }, side)) {
        moves.push({ from: { row: r, col: c }, to: t });
      }
    }
  }
  if (moves.length === 0) return null;

  // 用启发式给每步打分，取前 N
  const scored = moves
    .map((m) => {
      const res = buildPreview(kind, board, side, m, 'challenge');
      return { m, loss: res.candidates[0]?.loss ?? 999 };
    })
    .sort((a, b) => a.loss - b.loss);

  const n = difficulty === 'beginner' ? 5 : difficulty === 'intermediate' ? 3 : 1;
  const pool = scored.slice(0, Math.max(1, Math.min(n, scored.length)));
  const pick = pool[Math.floor(Math.random() * pool.length)];
  return pick?.m ?? null;
}
