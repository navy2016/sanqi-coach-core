/** 右侧面板：假设推演（变化树）/ AI 棋理讲解 / 逐手复盘 */
import type { CandidateEval, CoachText, PreviewResult, ReviewItem } from '../core/types';
import { gradeLabel } from '../core/bridge';

const GRADE_CLASS: Record<string, string> = {
  best: 'g-best',
  good: 'g-good',
  suspect: 'g-suspect',
  mistake: 'g-mistake',
  blunder: 'g-blunder',
  global: 'g-global',
};

export function PreviewPanel({
  loading,
  preview,
  onSwap,
  onConfirm,
}: {
  loading: boolean;
  preview: PreviewResult | null;
  onSwap: () => void;
  onConfirm: () => void;
}) {
  return (
    <section className="card">
      <h2 className="card-title">假设推演 · 变化树</h2>

      {loading && <p className="muted">正在替对手寻找最有力的回应……</p>}

      {!loading && !preview && (
        <p className="muted">点击己方棋子并选择落点后，这里会展示候选走法与对方最强回应。</p>
      )}

      {!loading && preview && (
        <>
          <p className={`verdict ${preview.tree.length ? '' : 'muted'}`}>{preview.verdict}</p>

          <div className="cand-list">
            {preview.candidates.map((c: CandidateEval) => (
              <div key={c.san} className={`cand-row ${GRADE_CLASS[c.grade]}`}>
                <span className="cand-san">{c.san}</span>
                <span className="cand-grade">{gradeLabel(c.grade)}</span>
                {c.loss > 0 && <span className="cand-loss">损失 {c.loss}</span>}
              </div>
            ))}
          </div>

          <div className="tree">
            {preview.tree.map((n, i) => (
              <div key={`${n.move}-${i}`} className="tree-node">
                <div className="tree-line">
                  <span className="tree-label">{i === 0 ? '对方最强' : i === 1 ? '对方次选' : '对方第三'}</span>
                  <span className="tree-move">
                    {n.move} {n.tag && <em className="tag">{n.tag}</em>}
                  </span>
                </div>
                {n.reply && (
                  <div className="tree-line reply">
                    <span className="tree-label">推荐</span>
                    <span className="tree-move">
                      {n.reply} {n.replyTag && <em className="tag">{n.replyTag}</em>}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="row-actions">
            <button className="btn btn-ghost" type="button" onClick={onSwap}>
              换一个走法
            </button>
            <button className="btn btn-primary" type="button" onClick={onConfirm}>
              确认这样走
            </button>
          </div>
        </>
      )}
    </section>
  );
}

export function CoachPanel({
  text,
  loading,
  onPosition,
  onPiece,
  hasSelection,
}: {
  text: CoachText | null;
  loading: boolean;
  onPosition: () => void;
  onPiece: () => void;
  hasSelection: boolean;
}) {
  return (
    <section className="card">
      <h2 className="card-title">🧑‍🏫 AI 棋理讲解</h2>
      <div className="row-actions">
        <button className="btn btn-primary" type="button" onClick={onPosition} disabled={loading}>
          AI 讲解当前局面
        </button>
        <button className="btn btn-ghost" type="button" onClick={onPiece} disabled={loading || !hasSelection}>
          AI 讲解这枚棋
        </button>
      </div>
      {loading && <p className="muted">AI 正在组织语言……</p>}
      {text && (
        <p className={`coach-text ${text.degraded ? 'degraded' : ''}`}>
          {text.text}
          {text.degraded && <span className="badge">降级</span>}
        </p>
      )}
      {!text && !loading && <p className="muted">点上方按钮，让 AI 用大白话讲：对方想干啥、你该干啥、不能干啥。</p>}
    </section>
  );
}

export function ReviewPanel({ items, summary }: { items: ReviewItem[]; summary: string }) {
  return (
    <section className="card">
      <h2 className="card-title">复盘 · 逐手评分</h2>
      {items.length === 0 && <p className="muted">下完一盘后点「复盘」，这里会逐手打分并标出转折点。</p>}
      {items.length > 0 && (
        <ul className="review-list">
          {items.map((it) => (
            <li key={it.ply} className={`review-row ${GRADE_CLASS[it.grade]} ${it.turning ? 'turning' : ''}`}>
              <span className="ply">第 {it.ply} 手</span>
              <span className="san">{it.san}</span>
              <span className="grade">{gradeLabel(it.grade)}</span>
              {it.loss > 0 && <span className="loss">损失 {it.loss}</span>}
              {it.turning && <span className="badge">转折点</span>}
            </li>
          ))}
        </ul>
      )}
      {summary && <p className="summary">{summary}</p>}
    </section>
  );
}
