/** 三棋思维教练 · 前端公共类型 */

/** 棋种 */
export type GameKind = 'xiangqi' | 'chess' | 'go';

/** 走法评级档位（SPEC 分档 A：0-30✓ / 31-80良好 / 81-180⚠ / 181-350✗ / >350✗✗） */
export type Grade =
  | 'best'     // ✓ 最佳（绿）
  | 'good'     // ✓ 良好（蓝）
  | 'suspect'  // ⚠ 可疑（黄）
  | 'mistake'  // ✗ 失误（橙）
  | 'blunder'  // ✗✗ 严重失误（红）
  | 'global';  // ★ 全局最优（金）

/** 棋盘坐标：col/row 从 0 起（象棋 0..8 × 0..9；国象 0..7 × 0..7；围棋 0..18 × 0..18） */
export interface Pos {
  col: number;
  row: number;
}

/** 一次走子（前端 → 后端） */
export interface Move {
  /** 起点坐标；围棋落子为 null */
  from: Pos | null;
  to: Pos;
  /** 国象升变可选 'q' | 'r' | 'b' | 'n' */
  promotion?: 'q' | 'r' | 'b' | 'n';
}

/** 走子后由引擎返回的局面快照 */
export interface GameState {
  /** 引擎侧局面表示：象棋/国象 FEN，围棋 棋盘串（如 "B...W" 行序） */
  fen: string;
  /** 已走手数 */
  moveCount: number;
  /** 轮到哪方（象棋/国象：'red'|'black' / 'white'|'black'；围棋：'black'|'white'） */
  turn: string;
  /** 终局标记与描述 */
  gameOver?: boolean;
  result?: string;
  /** 最近一手（用于棋盘高亮） */
  lastMove?: { from: Pos | null; to: Pos };
  /** 被提子的坐标（围棋提子/象棋吃子高亮） */
  captured?: Pos[];
}

/** 变化树节点（假设推演结果） */
export interface VariationNode {
  /** 本方候选走法着法名（如 "车九进一" / "Nf3" / "Q16"） */
  move: string;
  /** 质量评级 */
  grade: Grade;
  /** 引擎评分（厘兵/目） */
  score?: number;
  /** 标签：[威胁]/[防守]/[捉子]/[发展]/[主动]/[反击] 等 */
  tags?: string[];
  /** 对方最强回应 */
  bestReply?: {
    move: string;
    /** 回应后我方推荐应对 */
    followUps?: { move: string; tags?: string[] }[];
  };
  /** 对方次选/第三候选（各带推荐应对） */
  altReplies?: { move: string; reply: string }[];
}

/** 逐手评分（全局复盘） */
export interface ScoredMove {
  /** 手数（1 起） */
  index: number;
  side: string;
  move: string;
  grade: Grade;
  /** 损失分（厘兵） */
  loss: number;
  /** 复盘转折点标注 */
  turning?: boolean;
  /** 一句话点评（可选） */
  note?: string;
}

/** AI 讲解请求模式 */
export type CoachMode = 'situation' | 'piece';

/** AI 服务设置（baseUrl/key/model，支持 DeepSeek/智谱 GLM/火山引擎） */
export interface CoachSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** 讲解开关（围棋 Android 版 AI 讲解可选） */
  coachEnabled: boolean;
  /** TTS 播报 */
  ttsEnabled: boolean;
  /** 三级 AI 难度 */
  difficulty: 'beginner' | 'intermediate' | 'challenge';
}

export const DEFAULT_SETTINGS: CoachSettings = {
  baseUrl: '',
  apiKey: '',
  model: '',
  coachEnabled: true,
  ttsEnabled: false,
  difficulty: 'intermediate',
};

/** 常用服务商预设（art2：DeepSeek / 智谱 GLM；art6：火山引擎 Doubao） */
export const PROVIDER_PRESETS: { name: string; baseUrl: string; model: string }[] = [
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  { name: '火山引擎 Doubao', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-seed-1.6' },
];
