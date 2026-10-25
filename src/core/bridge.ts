/**
 * 业务层桥接：Tauri 走 Rust 引擎命令；浏览器走本地模拟（UI 验收 / Web 版）。
 * 原文原则：引擎算、AI 只翻译；AI 不可用时降级基础提示，绝不编造棋理。
 */
import type {
  AiSettings,
  BoardMatrix,
  CandidateEval,
  CoachText,
  Difficulty,
  GameKind,
  Grade,
  Move,
  PreviewResult,
  ReviewItem,
  Side,
  VariationNode,
} from './types';
import { SIZE, allLegalMoves, applyMove, otherSide } from './rules';

const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in (window as unknown as Record<string, unknown>);

type TauriInternals = { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };

/** 直接走 Tauri 注入的 __TAURI_INTERNALS__，避免额外依赖 @tauri-apps/api */
async function invoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  const internals = (window as unknown as { __TAURI_INTERNALS__?: TauriInternals }).__TAURI_INTERNALS__;
  if (!internals) throw new Error('not in tauri');
  return (await internals.invoke(cmd, args)) as T;
}

/* ============ 评级 ============ */

/** 原文分档 A：0-30 最佳 / 31-80 良好 / 81-180 可疑 / 181-350 失误 / >350 严重失误 */
export function gradeOf(loss: number): Grade {
  const l = Math.abs(loss);
  if (l <= 30) return 'best';
  if (l <= 80) return 'good';
  if (l <= 180) return 'suspect';
  if (l <= 350) return 'mistake';
  return 'blunder';
}

export function gradeLabel(g: Grade): string {
  switch (g) {
    case 'best': return '最佳';
    case 'good': return '良好';
    case 'suspect': return '可疑';
    case 'mistake': return '失误';
    case 'blunder': return '严重失误';
    case 'global': return '全局最优';
  }
}

/* ============ 棋子名（右栏标题用） ============ */

const XQ_NAME: Record<string, string> = {
  K: '帅', A: '仕', E: '相', H: '马', R: '车', C: '炮', P: '兵',
  k: '将', a: '士', e: '象', h: '马', r: '车', c: '炮', p: '卒',
};

export function pieceTitle(kind: GameKind, cell: string | null): string {
  if (!cell) return '当前局面';
  const [side, name] = cell.split(':');
  if (kind === 'go') return side === 'white' ? '白棋该怎么走' : '黑棋该怎么走';
  if (kind === 'chess') {
    const map: Record<string, string> = { K: '王', Q: '后', R: '车', B: '象', N: '马', P: '兵' };
    return `${map[name] ?? name}该怎么走`;
  }
  return `${XQ_NAME[name] ?? name}该怎么走`;
}

/* ============ 本地模拟引擎（浏览器演示） ============ */

const VAL: Record<string, number> = {
  K: 0, A: 200, E: 200, H: 400, R: 900, C: 450, P: 100,
  Q: 900, B: 330, N: 320,
};

function material(board: BoardMatrix, kind: GameKind): number {
  let red = 0;
  let black = 0;
  for (const row of board) {
    for (const cell of row) {
      if (!cell) continue;
      const [side, name] = cell.split(':');
      const v = kind === 'go' ? 1 : (VAL[name.toUpperCase()] ?? 0);
      if (side === 'white' || side === 'red') red += v;
      else black += v;
    }
  }
  return red - black;
}

function evalFor(board: BoardMatrix, kind: GameKind, side: Side): number {
  const m = material(board, kind);
  return side === 'white' || side === 'red' ? m : -m;
}

/** 把 Move 转成可读着法名（简化：象棋用「起点→终点」式描述，国象用坐标） */
export function moveName(kind: GameKind, board: BoardMatrix, mv: Move): string {
  const cell = mv.from ? board[mv.from.row]?.[mv.from.col] : null;
  const files = 'abcdefghij';
  const to = `${files[mv.to.col] ?? '?'}${(kind === 'xiangqi' ? 10 : 8) - mv.to.row}`;
  if (kind === 'go') return `${'ABCDEFGHJKLMNOPQRST'[mv.to.col] ?? '?'}${19 - mv.to.row}`;
  if (!cell) return to;
  const [, name] = cell.split(':');
  if (kind === 'chess') {
    const map: Record<string, string> = { K: 'K', Q: 'Q', R: 'R', B: 'B', N: 'N', P: '' };
    return `${map[name] ?? name}${to}`;
  }
  return `${XQ_NAME[name] ?? name}→${to}`;
}

function localPreview(
  kind: GameKind,
  board: BoardMatrix,
  side: Side,
  chosen: Move,
  difficulty: Difficulty,
): PreviewResult {
  const keep = difficulty === 'beginner' ? 5 : difficulty === 'challenge' ? 1 : 3;
  const base = evalFor(board, kind, side);
  const all = allLegalMoves(kind, board, side);

  const scored = all.map((mv) => {
    const after = applyMove(kind, board, mv, side);
    const cap = mv.from ? board[mv.to.row]?.[mv.to.col] : null;
    const gain = cap ? (VAL[cap.split(':')[1].toUpperCase()] ?? 0) : 0;
    const next = evalFor(after, kind, side);
    return { mv, score: next - base + gain };
  });
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0]?.score ?? 0;

  const candidates: CandidateEval[] = scored.slice(0, Math.max(keep, 3)).map((s, i) => {
    const loss = Math.max(0, best - s.score);
    return {
      move: s.mv,
      san: moveName(kind, board, s.mv),
      loss,
      grade: i === 0 ? 'best' : gradeOf(loss),
      global: i === 0,
      score: s.score,
    };
  });

  const chosenScore = scored.find((s) => s.mv.to.row === chosen.to.row && s.mv.to.col === chosen.to.col)?.score ?? best;
  const chosenLoss = Math.max(0, best - chosenScore);

  // 对方最强应对（模拟：对方最优吃子/推进）
  const opp = otherSide(side);
  const oppBoard = applyMove(kind, board, chosen, side);
  const oppMoves = allLegalMoves(kind, oppBoard, opp);
  const oppLine: VariationNode[] = oppMoves.slice(0, 3).map((mv, i) => ({
    who: 'opp',
    san: moveName(kind, oppBoard, mv),
    tag: i === 0 ? '威胁' : '防守',
    grade: i === 0 ? 'best' : 'good',
    score: 0,
  }));

  const line: VariationNode[] = [];
  oppLine.forEach((n, i) => {
    line.push(n);
    const mine = candidates[i + 1];
    if (mine) line.push({ who: 'me', san: mine.san, grade: mine.grade, score: mine.score });
  });

  const verdict =
    chosenLoss <= 30
      ? '这是当前局面上最有力的选择'
      : chosenLoss <= 80
        ? '这步棋可行，但还有更好的选择'
        : '这步棋给了对手机会，建议换一个走法';

  const better =
    chosenLoss > 30 && candidates[0]
      ? { san: candidates[0].san, delta: Math.round(chosenLoss) }
      : null;

  return { candidates, line, verdict, better, winrate: null };
}

/* ============ 对外 API ============ */

export const api = {
  async preview(
    kind: GameKind,
    board: BoardMatrix,
    side: Side,
    mv: Move,
    difficulty: Difficulty,
  ): Promise<PreviewResult> {
    if (isTauri()) {
      try {
        const r = await invoke<{
          candidates: { move_str: string; loss_cp: number; grade: string; eval_cp?: number }[];
          root: { mv: string; tags?: string[] }[];
        }>('get_variations', {
          kind,
          gameId: 'local',
          mv,
          difficulty,
        });
        const candidates: CandidateEval[] = r.candidates.map((c, i) => ({
          move: mv,
          san: c.move_str,
          loss: c.loss_cp,
          grade: (c.grade as Grade) ?? gradeOf(c.loss_cp),
          global: i === 0,
          score: c.eval_cp,
        }));
        const best = candidates[0];
        return {
          candidates,
          line: (r.root ?? []).map((n, i) => ({ who: i % 2 === 0 ? 'opp' : 'me', san: n.mv, grade: 'good' as Grade })),
          verdict: best && best.loss <= 30 ? '这是当前局面上最有力的选择' : '这步棋给了对手机会，建议换一个走法',
          better: best && best.loss > 30 ? { san: best.san, delta: best.loss } : null,
          winrate: null,
        };
      } catch {
        /* 落到本地模拟 */
      }
    }
    return localPreview(kind, board, side, mv, difficulty);
  },

  async coach(kind: GameKind, context: string, settings: AiSettings): Promise<CoachText> {
    if (settings.apiKey && settings.baseUrl) {
      try {
        const res = await fetch(`${settings.baseUrl.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
          body: JSON.stringify({
            model: settings.model || 'doubao-1.5-pro',
            messages: [
              { role: 'system', content: '你是中国象棋/国际象棋/围棋教练，只基于给定引擎结论讲解，不编造棋理。' },
              { role: 'user', content: context },
            ],
            stream: false,
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
          const text = data.choices?.[0]?.message?.content;
          if (text) return { text, degraded: false };
        }
      } catch {
        /* 降级 */
      }
    }
    return { degraded: true, text: `（本地基础提示）${context}` };
  },

  async review(kind: GameKind, history: Move[], board: BoardMatrix, side: Side): Promise<ReviewItem[]> {
    void kind;
    void history;
    void board;
    void side;
    return [];
  },
};

export { SIZE };
