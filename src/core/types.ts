/** 三棋思维教练 v2 · 公共类型 */

export type GameKind = 'xiangqi' | 'chess' | 'go';
export type Side = 'red' | 'black' | 'white';
export type Difficulty = 'beginner' | 'intermediate' | 'challenge';

export interface Pos {
  row: number;
  col: number;
}

/** 棋盘格：null=空；否则为棋子标识（象棋用中文，国象用字母，围棋用 B/W） */
export type Cell = string | null;
export type BoardMatrix = Cell[][];

export interface Move {
  from: Pos | null;
  to: Pos;
  /** 围棋为 true */
  drop?: boolean;
  promotion?: string | null;
}

/** 五档评级（原文分档 A） */
export type Grade = 'best' | 'good' | 'suspect' | 'mistake' | 'blunder' | 'global';

export interface CandidateEval {
  move: Move;
  /** 走法文本，如「炮二平五」「Bc4」 */
  san: string;
  /** 评分损失（厘兵/胜率折算） */
  loss: number;
  grade: Grade;
  /** 是否全局最优（金色 ★） */
  global?: boolean;
}

export interface VariationNode {
  move: string;
  /** 手段标签：[威胁] [防守] [发展] [捉子] [抢占中心] [主动] */
  tag?: string;
  grade?: Grade;
  /** 该层走法后我方推荐应对 */
  reply?: string;
  replyTag?: string;
  children?: VariationNode[];
}

export interface PreviewResult {
  /** 候选走法（按质量排序，含本次点击的走法） */
  candidates: CandidateEval[];
  /** 本次点击走法的完整变化树 */
  tree: VariationNode[];
  /** 一句话结论，如「这步给了对手机会」 */
  verdict: string;
}

export interface ReviewItem {
  ply: number;
  san: string;
  loss: number;
  grade: Grade;
  /** 转折点 */
  turning?: boolean;
}

export interface CoachText {
  text: string;
  /** 是否降级（未配置 AI） */
  degraded: boolean;
}

export interface AiSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** 棋谱教学条目 */
export interface StudyGame {
  id: string;
  name: string;
  category: '启蒙' | '开局' | '中局' | '杀法' | '战术' | '残局';
  moves: string[];
}

/** 残局挑战条目 */
export interface EndgamePuzzle {
  id: string;
  name: string;
  goal: '红方胜' | '和棋' | '白方胜';
  fen: string;
}
