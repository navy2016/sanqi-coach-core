/**
 * 业务层桥接：Tauri 环境下走 Rust 命令；浏览器环境走本地模拟引擎（用于 UI 验收与 Web 版）。
 * 原文原则：引擎算、AI 只翻译；AI 不可用时降级基础提示，绝不编造。
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
import { applyMove, kindOf, legalTargets, sideOf } from './rules';

const isTauri = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

async function invoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  const api = (window as unknown as { __TAURI_INTERNALS__: { invoke: (c: string, a: unknown) => Promise<T> } })
    .__TAURI_INTERNALS__;
  return api.invoke(cmd, args);
}

/* ---------------- 评估（模拟引擎启发式） ---------------- */

const VALUE: Record<string, number> = {
  帅: 10000, 将: 10000, K: 10000,
  车: 900, R: 900,
  炮: 450, C: 450,
  马: 400, H: 400, N: 400,
  相: 200, 象: 200, 仕: 200, 士: 200, B: 330, E: 200, A: 200,
  兵: 100, 卒: 100, P: 100,
  Q: 900,
  S: 10,
};

const val = (cell: string | null): number => (cell ? VALUE[kindOf(cell)] ?? 0 : 0);

/** 从 side 视角的子力差 */
function material(b: BoardMatrix, side: Side): number {
  let mine = 0;
  let theirs = 0;
  for (const row of b) {
    for (const cell of row) {
      if (!cell) continue;
      const s = sideOf(cell);
      if (s === side) mine += val(cell);
      else theirs += val(cell);
    }
  }
  return mine - theirs;
}

export function gradeOf(loss: number): Grade {
  if (loss <= 30) return 'best';
  if (loss <= 80) return 'good';
  if (loss <= 180) return 'suspect';
  if (loss <= 350) return 'mistake';
  return 'blunder';
}

const GRADE_LABEL: Record<Grade, string> = {
  best: '✓ 最佳',
  good: '✓ 良好',
  suspect: '⚠ 可疑',
  mistake: '✗ 失误',
  blunder: '✗✗ 严重失误',
  global: '★ 全局最优',
};

export const gradeLabel = (g: Grade): string => GRADE_LABEL[g];

/** 坐标 → 走法文本（象棋用「炮二平五」式；国象用 Bc4；围棋用 D4） */
export function moveText(kind: GameKind, b: BoardMatrix, mv: Move): string {
  const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
  if (kind === 'go') {
    const letters = 'ABCDEFGHJKLMNOPQRST';
    return `${letters[mv.to.col] ?? '?'}${19 - mv.to.row}`;
  }
  if (kind === 'xiangqi' && mv.from) {
    const piece = kindOf(b[mv.from.row][mv.from.col]);
    const isRed = sideOf(b[mv.from.row][mv.from.col]) === 'red';
    const file = (c: number) => (isRed ? CN_NUM[8 - c] : CN_NUM[c]);
    const dr = mv.to.row - mv.from.row;
    const dc = mv.to.col - mv.from.col;
    const action = dr === 0 ? '平' : dr < 0 ? (isRed ? '进' : '退') : isRed ? '退' : '进';
    const target = dr === 0 ? file(mv.to.col) : Math.abs(dr) === 1 ? file(mv.to.col) : CN_NUM[Math.abs(dr) - 1];
    return `${piece}${file(mv.from.col)}${action}${target}`;
  }
  if (kind === 'chess' && mv.from) {
    const piece = kindOf(b[mv.from.row][mv.from.col]);
    const files = 'abcdefgh';
    return `${piece === 'P' ? '' : piece}${files[mv.to.col]}${8 - mv.to.row}`;
  }
  return `${mv.from ? `${mv.from.row},${mv.from.col}` : ''}→${mv.to.row},${mv.to.col}`;
}

const TAG_POOL = ['[威胁]', '[抢占中心]', '[捉子]', '[发展]', '[防守]', '[主动]'];

function pickTag(seed: number): string {
  return TAG_POOL[seed % TAG_POOL.length];
}

/** 生成候选与变化树（模拟引擎；真实引擎接入后由后端替换） */
export function buildPreview(
  kind: GameKind,
  board: BoardMatrix,
  side: Side,
  mv: Move,
  difficulty: Difficulty,
): PreviewResult {
  const base = material(board, side);
  const all: CandidateEval[] = [];

  const consider = (m: Move) => {
    const after = applyMove(kind, board, m, side);
    const gain = material(after, side) - base;
    all.push({ move: m, san: moveText(kind, board, m), loss: 0, grade: 'best', global: false });
    // 用「对方最佳回应后的净收益」作为评分依据
    const opp = side === 'white' ? 'black' : side === 'red' ? 'black' : 'white';
    let worst = 0;
    for (let r = 0; r < after.length; r++) {
      for (let c = 0; c < after[r].length; c++) {
        const cell = after[r][c];
        if (!cell || sideOf(cell) !== opp) continue;
        for (const t of legalTargets(kind, after, { row: r, col: c }, opp)) {
          const reply = applyMove(kind, after, { from: { row: r, col: c }, to: t }, opp);
          worst = Math.min(worst, material(reply, side) - base);
        }
      }
    }
    const score = Math.min(gain, worst);
    all[all.length - 1].loss = Math.max(0, Math.round((base + 0 - (base + score)) * -1));
    return score;
  };

  // 候选：本次点击走法 + 其它合法走法（最多 5 个）
  const scores = new Map<string, number>();
  const key = (m: Move) => `${m.from?.row},${m.from?.col}->${m.to.row},${m.to.col}`;
  scores.set(key(mv), consider(mv));

  if (mv.from) {
    const others = legalTargets(kind, board, mv.from, side)
      .filter((t) => t.row !== mv.to.row || t.col !== mv.to.col)
      .slice(0, 4);
    for (const t of others) consider({ from: mv.from, to: t });
  }

  const best = Math.max(...all.map((c) => scores.get(key(c.move)) ?? 0));
  for (const c of all) {
    const s = scores.get(key(c.move)) ?? 0;
    c.loss = Math.max(0, Math.round((best - s) * 10));
    c.grade = gradeOf(c.loss);
    c.global = s === best;
  }
  all.sort((a, b2) => a.loss - b2.loss);
  if (all[0]) all[0].grade = 'global';

  // 难度：入门给 5 个、进阶 3 个、挑战 1 个
  const keep = difficulty === 'beginner' ? 5 : difficulty === 'challenge' ? 1 : 3;
  const candidates = all.slice(0, keep);

  const clicked = all.find((c) => key(c.move) === key(mv)) ?? all[0];
  const tree = buildTree(kind, board, side, mv, clicked.loss);
  const verdict =
    clicked.grade === 'blunder'
      ? '这步给了对手机会——看右侧变化树，对手会这样惩罚你。'
      : clicked.grade === 'mistake'
        ? '这步有问题，对手有更强的应对。'
        : clicked.grade === 'suspect'
          ? '这步可下，但对手有更积极的回应。'
          : '这步不错，可以确认落子。';

  return { candidates, tree, verdict };
}

function buildTree(kind: GameKind, board: BoardMatrix, side: Side, mv: Move, loss: number): VariationNode[] {
  const after = applyMove(kind, board, mv, side);
  const opp: Side = side === 'white' ? 'black' : side === 'red' ? 'black' : 'white';
  const replies: { move: Move; score: number }[] = [];
  for (let r = 0; r < after.length; r++) {
    for (let c = 0; c < after[r].length; c++) {
      const cell = after[r][c];
      if (!cell || sideOf(cell) !== opp) continue;
      for (const t of legalTargets(kind, after, { row: r, col: c }, opp)) {
        const m: Move = { from: { row: r, col: c }, to: t };
        const score = material(applyMove(kind, after, m, opp), opp);
        replies.push({ move: m, score });
      }
    }
  }
  replies.sort((a, b) => b.score - a.score);
  const top = replies.slice(0, 3);

  return top.map((rep, i) => {
    const san = moveText(kind, after, rep.move);
    const node: VariationNode = { move: san, tag: pickTag(i + Math.round(loss / 60)) };
    const afterReply = applyMove(kind, after, rep.move, opp);
    const mine: { move: Move; score: number }[] = [];
    for (let r = 0; r < afterReply.length; r++) {
      for (let c = 0; c < afterReply[r].length; c++) {
        const cell = afterReply[r][c];
        if (!cell || sideOf(cell) !== side) continue;
        for (const t of legalTargets(kind, afterReply, { row: r, col: c }, side)) {
          const m: Move = { from: { row: r, col: c }, to: t };
          mine.push({ move: m, score: material(applyMove(kind, afterReply, m, side), side) });
        }
      }
    }
    mine.sort((a, b) => b.score - a.score);
    if (mine[0]) {
      node.reply = moveText(kind, afterReply, mine[0].move);
      node.replyTag = pickTag(i + 3);
    }
    return node;
  });
}

/* ---------------- 对外 API ---------------- */

export const api = {
  /** 假设推演：不落子，只出变化树 */
  async preview(
    kind: GameKind,
    board: BoardMatrix,
    side: Side,
    mv: Move,
    difficulty: Difficulty,
  ): Promise<PreviewResult> {
    if (isTauri()) {
      try {
        return await invoke<PreviewResult>('preview_move', { kind, move: mv, difficulty });
      } catch {
        /* 引擎异常 → 本地模拟兜底，保证交互不中断 */
      }
    }
    return buildPreview(kind, board, side, mv, difficulty);
  },

  /** 确认落子 */
  async confirm(kind: GameKind, board: BoardMatrix, side: Side, mv: Move): Promise<BoardMatrix> {
    if (isTauri()) {
      try {
        const r = await invoke<{ labels: BoardMatrix }>('confirm_move', { kind, move: mv });
        if (r?.labels) return r.labels;
      } catch {
        /* 降级本地 */
      }
    }
    return applyMove(kind, board, mv, side);
  },

  async undo(kind: GameKind, board: BoardMatrix): Promise<BoardMatrix> {
    if (isTauri()) {
      try {
        const r = await invoke<{ labels: BoardMatrix }>('undo_move', { kind });
        if (r?.labels) return r.labels;
      } catch {
        /* 降级本地 */
      }
    }
    return board;
  },

  /** 逐手复盘 */
  async review(kind: GameKind, board: BoardMatrix, side: Side): Promise<ReviewItem[]> {
    if (isTauri()) {
      try {
        const r = await invoke<{ moves: ReviewItem[] }>('review_game', { kind });
        if (r?.moves) return r.moves;
      } catch {
        /* 降级 */
      }
    }
    return [];
  },

  /** AI 棋理讲解（未配置 Key 时降级基础提示） */
  async coach(settings: AiSettings, mode: 'position' | 'piece', context: string): Promise<CoachText> {
    if (!settings.baseUrl || !settings.apiKey || !settings.model) {
      return {
        degraded: true,
        text:
          mode === 'position'
            ? 'AI 服务未配置，已降级为基础提示：先看对方刚走那步的意图，再点自己的棋子查看引擎给出的最佳走法。'
            : 'AI 服务未配置，已降级为基础提示：这枚棋子的最佳走法由引擎给出，先看变化树里对方的最强应对。',
      };
    }
    if (isTauri()) {
      try {
        return await invoke<CoachText>('get_coaching', { mode, context });
      } catch {
        /* 降级 */
      }
    }
    return { degraded: true, text: `（本地演示）${context}` };
  },
};
