/**
 * Tauri v2 invoke 统一封装层（wrapper）
 *
 * 约定的命令清单（与 src-tauri 同事对齐；此处只做转发与降级，不臆造额外接口）：
 *  - make_move(kind, gameId, move)            → GameState   走子（含合法性判定）
 *  - get_variations(kind, gameId, move)       → { root: VariationNode[] } 求变化树（假设推演）
 *  - get_coaching(kind, gameId, mode, pos?)   → { text }    求讲解（一次性全文；流式经事件推送）
 *  - undo_move(kind, gameId)                  → GameState   悔棋（退回到玩家走错之前）
 *  - analyze_game(kind, gameId)               → { moves: ScoredMove[], summary: string } 复盘
 *  - load_settings()                          → CoachSettings 设置读
 *  - save_settings(settings)                  → void        设置写
 *
 * 流式讲解：后端经 Tauri event `coach://stream` 增量推送 { delta }；
 * 前端用 listen 订阅（见 onCoachStream）。未在 Tauri 环境时整体降级为 mock 演示数据。
 */
import type {
  CoachMode, CoachSettings, GameState, Move, ScoredMove, VariationNode,
} from '../core/types';

/** 是否运行在 Tauri WebView 内 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

type InvokeFn = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

async function rawInvoke(cmd: string, args?: Record<string, unknown>): Promise<unknown> {
  if (!isTauri()) throw new Error('not-in-tauri');
  // Tauri v2 全局注入：window.__TAURI_INTERNALS__.invoke
  const internals = (window as unknown as { __TAURI_INTERNALS__?: { invoke: InvokeFn } }).__TAURI_INTERNALS__;
  if (!internals?.invoke) throw new Error('tauri-invoke-unavailable');
  return internals.invoke(cmd, args);
}

/** 订阅后端流式讲解事件；返回取消订阅函数 */
export async function onCoachStream(cb: (delta: string) => void): Promise<() => void> {
  if (!isTauri()) return () => {};
  try {
    // 变量形式动态导入：未安装 @tauri-apps/api 时不在构建期解析，运行时降级
    const spec = '@tauri-apps/api/event';
    const mod = (await import(/* @vite-ignore */ spec)) as {
      listen: (e: string, h: (ev: { payload: unknown }) => void) => Promise<() => void>;
    };
    const un = await mod.listen('coach://stream', (ev) => {
      const payload = ev.payload as { delta?: string } | string;
      const delta = typeof payload === 'string' ? payload : (payload?.delta ?? '');
      if (delta) cb(delta);
    });
    return un;
  } catch {
    // @tauri-apps/api 未随前端依赖安装时，由 src-tauri 侧注入全局回退
    const w = window as unknown as { __coachStreamHandler?: (d: string) => void };
    w.__coachStreamHandler = cb;
    return () => { delete w.__coachStreamHandler; };
  }
}

/** 后端不可用 / 未配置 AI 时的降级演示数据（宁可不讲不乱讲 → 仅示例结构） */
const MOCK: {
  variations: VariationNode[];
  score: ScoredMove[];
  coachText: string;
} = {
  variations: [
    {
      move: '车九进一', grade: 'best', score: 24, tags: ['发展'],
      bestReply: { move: '马8进7', followUps: [{ move: '炮二平五', tags: ['主动'] }] },
      altReplies: [{ move: '卒3进1', reply: '马二进三' }],
    },
    {
      move: '炮二平五', grade: 'good', score: 46, tags: ['主动'],
      bestReply: { move: '马2进3', followUps: [{ move: '车一平二', tags: ['发展'] }] },
    },
    {
      move: '马二进三', grade: 'suspect', score: 128, tags: ['发展'],
      bestReply: { move: '车9进1', followUps: [] },
    },
  ],
  score: [
    { index: 1, side: '红', move: '炮二平五', grade: 'best', loss: 12 },
    { index: 2, side: '黑', move: '马8进7', grade: 'best', loss: 8 },
    { index: 3, side: '红', move: '马二进三', grade: 'good', loss: 64 },
    { index: 4, side: '黑', move: '车9平8', grade: 'best', loss: 22 },
    { index: 5, side: '红', move: '兵七进一', grade: 'suspect', loss: 142, turning: true, note: '从这一手开始丢先手' },
    { index: 6, side: '黑', move: '卒3进1', grade: 'best', loss: 6 },
    { index: 7, side: '红', move: '车一平二', grade: 'mistake', loss: 220 },
    { index: 8, side: '黑', move: '炮8进4', grade: 'best', loss: 4 },
    { index: 9, side: '红', move: '仕四进五', grade: 'blunder', loss: 480, note: '无补偿丢车' },
    { index: 10, side: '黑', move: '车8进9', grade: 'global', loss: 0 },
  ],
  coachText:
    '对方走车8进9，是想压住你的二路车同时腾出炮架。' +
    '他留下的弱点是3路卒脱根——你可以考虑兵七进一过河对攻。' +
    '注意别急着上仕，底线空门先补一手。',
};

function delay<T>(v: T, ms = 160): Promise<T> {
  return new Promise((r) => setTimeout(() => r(v), ms));
}

/** 统一 API 门面：Tauri 可用时走 invoke，否则走 mock（保证 UI 全流程可演示） */
export const api = {
  async makeMove(kind: string, gameId: string, move: Move): Promise<GameState> {
    if (isTauri()) return (await rawInvoke('make_move', { kind, gameId, move })) as GameState;
    return delay({
      fen: '', moveCount: 1, turn: 'black', lastMove: move,
    });
  },
  async getVariations(kind: string, gameId: string, move: Move): Promise<{ root: VariationNode[] }> {
    if (isTauri()) return (await rawInvoke('get_variations', { kind, gameId, move })) as { root: VariationNode[] };
    await delay({}, 900); // 模拟 ~1.2s 引擎分析
    return { root: MOCK.variations };
  },
  async getCoaching(kind: string, gameId: string, mode: CoachMode, pos?: { col: number; row: number }): Promise<{ text: string }> {
    if (isTauri()) return (await rawInvoke('get_coaching', { kind, gameId, mode, pos })) as { text: string };
    await delay({ text: '' }, 500); // 模拟 0.5s 首字延迟
    return { text: mode === 'piece' ? '这是你的二路车…' : MOCK.coachText };
  },
  async undoMove(kind: string, gameId: string): Promise<GameState> {
    if (isTauri()) return (await rawInvoke('undo_move', { kind, gameId })) as GameState;
    return delay({ fen: '', moveCount: 0, turn: 'red' });
  },
  async analyzeGame(kind: string, gameId: string): Promise<{ moves: ScoredMove[]; summary: string }> {
    if (isTauri()) return (await rawInvoke('analyze_game', { kind, gameId })) as { moves: ScoredMove[]; summary: string };
    return delay({ moves: MOCK.score, summary: '这盘最该复盘第 5、7、9 手：第 5 手兵七进一是丢先手的转折点。' }, 600);
  },
  async loadSettings(): Promise<CoachSettings> {
    if (isTauri()) return (await rawInvoke('load_settings')) as CoachSettings;
    return delay({ baseUrl: '', apiKey: '', model: '', coachEnabled: true, ttsEnabled: false, difficulty: 'intermediate' as const });
  },
  async saveSettings(settings: CoachSettings): Promise<void> {
    if (isTauri()) return (await rawInvoke('save_settings', { settings })) as Promise<void>;
    await delay(undefined, 120);
  },
};
