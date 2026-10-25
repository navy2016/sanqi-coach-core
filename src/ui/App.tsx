/** 三棋思维教练 v2 · 主界面（三栏：对局信息 / 棋盘 / 假设推演） */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AiSettings,
  BoardMatrix,
  CandidateEval,
  CoachText,
  Difficulty,
  GameKind,
  Move,
  Pos,
  PreviewResult,
  Side,
} from '../core/types';
import { applyMove, allLegalMoves, initialBoard, otherSide } from '../core/rules';
import { api, gradeLabel, moveName, pieceTitle } from '../core/bridge';
import Board from './Board';
import { StudyDrawer, EndgameDrawer, iccsToMove } from './Drawers';

const KIND_LABEL: Record<GameKind, string> = { xiangqi: '象棋思考教练', chess: '国象思考教练', go: '围棋思考教练' };
const SIDE_LABEL: Record<GameKind, [string, string]> = {
  xiangqi: ['红方', '黑方'],
  chess: ['白方', '黑方'],
  go: ['黑方', '白方'],
};

export default function App() {
  const [kind, setKind] = useState<GameKind>('xiangqi');
  const [board, setBoard] = useState<BoardMatrix>(() => initialBoard('xiangqi'));
  const [turn, setTurn] = useState<Side>('red');
  const [selected, setSelected] = useState<Pos | null>(null);
  const [pending, setPending] = useState<Move | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<{ ply: number; san: string; mv: Move }[]>([]);
  const [difficulty, setDifficulty] = useState<Difficulty>('intermediate');
  const [coach, setCoach] = useState<CoachText | null>(null);
  const [ai, setAi] = useState<AiSettings>({ baseUrl: '', apiKey: '', model: '' });
  const [showSettings, setShowSettings] = useState(false);
  const [drawer, setDrawer] = useState<'study' | 'endgame' | null>(null);
  const [toast, setToast] = useState('');

  const legal = useMemo(() => (selected ? allLegalMoves(kind, board, turn).filter((m: Move) => m.from?.row === selected.row && m.from?.col === selected.col) : []), [kind, board, turn, selected]);
  const legalTargets = useMemo<Pos[]>(() => legal.map((m) => m.to), [legal]);
  const candidates = preview?.candidates ?? [];
  const arrows = useMemo(() => {
    if (!preview) return [];
    return preview.candidates.slice(0, 1).map((c) => ({ from: c.move.from ?? c.move.to, to: c.move.to }));
  }, [preview]);

  const reset = useCallback((k: GameKind) => {
    setKind(k);
    setBoard(initialBoard(k));
    setTurn(k === 'go' ? 'black' : k === 'xiangqi' ? 'red' : 'white');
    setSelected(null);
    setPending(null);
    setPreview(null);
    setHistory([]);
    setCoach(null);
  }, []);

  useEffect(() => {
    setBoard(initialBoard(kind));
    setTurn(kind === 'go' ? 'black' : kind === 'xiangqi' ? 'red' : 'white');
    setSelected(null);
    setPending(null);
    setPreview(null);
    setHistory([]);
    setCoach(null);
  }, [kind]);

  const onCell = async (p: Pos) => {
    const cellv = board[p.row]?.[p.col] ?? null;
    if (selected) {
      const mv = legal.find((m) => m.to.row === p.row && m.to.col === p.col);
      if (mv) {
        setPending(mv);
        setLoading(true);
        setPreview(null);
        setCoach(null);
        try {
          const r = await api.preview(kind, board, turn, mv, difficulty);
          setPreview(r);
        } finally {
          setLoading(false);
        }
        return;
      }
    }
    if (cellv && cellv.startsWith(turn === 'white' || turn === 'red' ? 'white' : 'black')) {
      setSelected(p);
      setPending(null);
      setPreview(null);
      return;
    }
    setSelected(null);
    setPending(null);
  };

  const confirm = () => {
    if (!pending) return;
    const san = moveName(kind, board, pending);
    const next = applyMove(kind, board, pending, turn);
    setBoard(next);
    setTurn(otherSide(turn));
    setHistory((h) => [...h, { ply: h.length + 1, san, mv: pending }]);
    setSelected(null);
    setPending(null);
    setPreview(null);
    setCoach(null);
  };

  const undo = () => {
    if (!history.length) return;
    let b = initialBoard(kind);
    const rest = history.slice(0, -1);
    for (let i = 0; i < rest.length; i++) b = applyMove(kind, b, rest[i].mv, i % 2 === 0 ? (kind === 'go' ? 'black' : kind === 'xiangqi' ? 'red' : 'white') : otherSide(kind === 'go' ? 'black' : kind === 'xiangqi' ? 'red' : 'white'));
    setBoard(b);
    setHistory(rest);
    setTurn(rest.length % 2 === 0 ? (kind === 'go' ? 'black' : kind === 'xiangqi' ? 'red' : 'white') : otherSide(kind === 'go' ? 'black' : kind === 'xiangqi' ? 'red' : 'white'));
    setSelected(null);
    setPending(null);
    setPreview(null);
    setCoach(null);
  };

  const askCoach = async () => {
    if (!pending) return;
    const ctx = `棋种：${KIND_LABEL[kind]}；当前行棋：${SIDE_LABEL[kind][turn === 'black' ? 1 : 0]}；候选走法：${preview?.candidates.map((c) => `${c.san}(${gradeLabel(c.grade)},损失${c.loss})`).join('，') ?? '无'}；引擎结论：${preview?.verdict ?? ''}`;
    const r = await api.coach(kind, ctx, ai);
    setCoach(r);
  };

  const chosen = pending ? preview?.candidates.find((c) => c.move.to.row === pending.to.row && c.move.to.col === pending.to.col) : null;

  return (
    <div className="app">
      <header className="topbar">
        <button className="link" onClick={() => reset(kind)}>← 返回首页</button>
        <div className="title">{KIND_LABEL[kind]}</div>
        <div className="top-right">
          <span className="activated">✓ 已激活（永久授权）</span>
          <button className="link" onClick={() => setShowSettings(true)}>⚙ 设置</button>
        </div>
      </header>

      <div className="kind-tabs">
        {(['xiangqi', 'chess', 'go'] as GameKind[]).map((k) => (
          <button key={k} className={`tab ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>
            {k === 'xiangqi' ? '中国象棋' : k === 'chess' ? '国际象棋' : '围棋'}
          </button>
        ))}
        <button className="tab ghost" onClick={() => setDrawer('study')}>棋谱教学</button>
        <button className="tab ghost" onClick={() => setDrawer('endgame')}>残局挑战</button>
      </div>

      <main className="layout">
        {/* 左栏：对局信息 */}
        <aside className="left">
          <h3>对局信息</h3>
          <dl>
            <dt>执棋方</dt><dd>{SIDE_LABEL[kind][turn === 'black' ? 1 : 0]}</dd>
            <dt>当前回合</dt><dd className="accent">轮到你</dd>
            {kind === 'go' && (<><dt>棋盘</dt><dd>19路</dd><dt>贴目</dt><dd>5.5</dd></>)}
            <dt>AI 难度</dt>
            <dd>
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
                <option value="beginner">入门</option>
                <option value="intermediate">进阶</option>
                <option value="challenge">挑战</option>
              </select>
            </dd>
            <dt>训练模式</dt><dd>引导对局</dd>
            <dt>局面评价</dt><dd>局面均衡</dd>
          </dl>
          <h3>走法记录</h3>
          {history.length === 0 ? (
            <p className="muted">（暂无走法）</p>
          ) : (
            <ol className="moves">
              {history.map((h) => (
                <li key={h.ply}>{h.san}</li>
              ))}
            </ol>
          )}
          <div className="left-actions">
            <button className="btn" onClick={() => reset(kind)}>返回</button>
            <button className="btn" onClick={undo} disabled={!history.length}>悔棋</button>
            <button className="btn" onClick={() => { setHistory([]); setBoard(initialBoard(kind)); setPreview(null); setPending(null); }}>认输</button>
            {kind === 'go' && <button className="btn" onClick={() => setTurn(otherSide(turn))}>虚手</button>}
            <button className="btn wide" onClick={() => reset(kind)}>重新开始</button>
          </div>
        </aside>

        {/* 中栏：棋盘 */}
        <section className="center">
          {pending && <div className="badge">假设推演 · 尚未正式落子</div>}
          <Board
            kind={kind}
            board={board}
            selected={selected}
            legal={legalTargets}
            candidates={candidates}
            preview={pending}
            arrows={arrows}
            onCell={(p) => void onCell(p)}
          />
          <p className="hint">点击棋盘上某个高亮落点，可查看对方详细应对与后续变化。</p>
        </section>

        {/* 右栏：假设推演 / 讲解 */}
        <aside className="right">
          <h3>{pieceTitle(kind, selected ? board[selected.row]?.[selected.col] ?? null : null)}</h3>

          {loading && <p className="muted">正在替对手寻找最有力的回应…</p>}

          {!pending && !loading && (
            <p className="muted">点击棋盘上的棋子，再点高亮落点，开始假设推演。</p>
          )}

          {pending && preview && (
            <>
              <div className="move-head">
                <span className="move-name">走法：{chosen?.san ?? moveName(kind, board, pending)}</span>
                <span className={`grade ${chosen?.grade ?? 'best'}`}>{gradeLabel(chosen?.grade ?? 'best')}</span>
              </div>
              <p className="loss">损失 {chosen?.loss ?? 0}</p>
              <p className="verdict">{preview.verdict}</p>

              {preview.better && (
                <div className="better">
                  <div className="better-title">⚠ 当前局面更优的选择</div>
                  <div className="better-body">
                    <b>{preview.better.san}</b>
                    <span className="muted"> 比走这枚子好约 +{preview.better.delta}</span>
                  </div>
                </div>
              )}

              <h4>对方应对</h4>
              <ol className="line">
                {preview.line.map((n, i) => (
                  <li key={i} className={n.who === 'me' ? 'me' : 'opp'}>
                    <span className="who">{n.who === 'me' ? '我' : '对'}</span>
                    <span className="san">{n.san}</span>
                    {n.grade && <span className={`grade sm ${n.grade}`}>{gradeLabel(n.grade)}</span>}
                  </li>
                ))}
              </ol>

              <h4>这枚棋的其他走法</h4>
              <ol className="alts">
                {preview.candidates.map((c, i) => (
                  <li key={i}>
                    <span className="san">{c.san}</span>
                    <span className={`grade sm ${c.grade}`}>{gradeLabel(c.grade)}</span>
                    <span className="score">{c.score != null ? (c.score > 0 ? `+${c.score}` : c.score) : ''}</span>
                  </li>
                ))}
              </ol>

              <button className="btn ai" onClick={() => void askCoach()}>✨ AI 讲解这步</button>
              {coach && <div className={`coach ${coach.degraded ? 'degraded' : ''}`}>{coach.text}</div>}

              <div className="confirm-row">
                <button className="btn" onClick={() => { setPending(null); setPreview(null); }}>换走法</button>
                <button className="btn primary" onClick={confirm}>确认落子</button>
              </div>
            </>
          )}
        </aside>
      </main>

      {showSettings && (
        <div className="modal" onClick={() => setShowSettings(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3>AI 设置</h3>
            <label>Base URL<input value={ai.baseUrl} onChange={(e) => setAi({ ...ai, baseUrl: e.target.value })} placeholder="https://ark.cn-beijing.volces.com/api/v3" /></label>
            <label>API Key<input value={ai.apiKey} onChange={(e) => setAi({ ...ai, apiKey: e.target.value })} placeholder="sk-..." /></label>
            <label>模型<input value={ai.model} onChange={(e) => setAi({ ...ai, model: e.target.value })} placeholder="doubao-1.5-pro" /></label>
            <p className="muted">未配置时使用本地基础提示（不编造棋理）。</p>
            <button className="btn primary" onClick={() => setShowSettings(false)}>保存</button>
          </div>
        </div>
      )}

      {drawer === 'study' && <StudyDrawer onClose={() => setDrawer(null)} onPick={(game) => {
        let b = initialBoard(kind);
        const hs: { ply: number; san: string; mv: Move }[] = [];
        game.moves.forEach((iccs: string, i: number) => {
          const mv = iccsToMove(iccs);
          if (!mv) return;
          hs.push({ ply: i + 1, san: iccs, mv });
          b = applyMove(kind, b, mv, i % 2 === 0 ? 'red' : 'black');
        });
        setBoard(b);
        setHistory(hs);
        setDrawer(null);
        setToast(`已载入棋谱（${hs.length} 手）`);
      }} />}

      {drawer === 'endgame' && <EndgameDrawer onClose={() => setDrawer(null)} onPick={(fen) => { setDrawer(null); setToast(`已载入残局：${fen}`); }} />}

      {toast && <div className="toast" onClick={() => setToast('')}>{toast}</div>}
    </div>
  );
}
