/** 三棋思维教练 v2 · 公共类型（对齐原文截图字段） */

export type GameKind = 'xiangqi' | 'chess' | 'go';
export type Side = 'red' | 'black' | 'white';
export type Difficulty = 'beginner' | 'intermediate' | 'challenge';

export interface Pos {
  row: number;
  col: number;
}

export type Cell = string | null;
export type BoardMatrix = Cell[][];

export interface Move {
  from: Pos | null;
  to: Pos;
  drop?: boolean;
  promotion?: string | null;
}

/** 五档评级 + 全局最优（金★） */
export type Grade = 'best' | 'good' | 'suspect' | 'mistake' | 'blunder' | 'global';

export interface CandidateEval {
  move: Move;
  /** 走法文本：象棋「炮二平五」/ 国象「Bf4」/ 围棋「D4」 */
  san: string;
  /** 评分损失（象棋/国象：厘兵；围棋：百分点×100） */
  loss: number;
  grade: Grade;
  global?: boolean;
  /** 引擎原始分（象棋/国象厘兵，围棋胜率×1000） */
  score?: number;
}

/** 变化树节点：对 F3 / 我 D4 交替 */
export interface VariationNode {
  /** 'opp' 对方 / 'me' 我方 */
  who: 'opp' | 'me';
  san: string;
  tag?: string;
  grade?: Grade;
  score?: number;
}

export interface PreviewResult {
  candidates: CandidateEval[];
  /** 对方应对序列（编号 1..n） */
  line: VariationNode[];
  /** 一句话结论 */
  verdict: string;
  /** 当前局面更优的选择（若有） */
  better?: { san: string; delta: number } | null;
  /** 围棋专用：胜率与目差 */
  winrate?: { from: number; to: number; lossPct: number; lossPt: number } | null;
}

export interface ReviewItem {
  ply: number;
  san: string;
  loss: number;
  grade: Grade;
  turning?: boolean;
}

export interface CoachText {
  text: string;
  degraded: boolean;
}

export interface AiSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface StudyGame {
  id: string;
  name: string;
  category: '启蒙' | '开局' | '中局' | '杀法' | '战术' | '残局';
  moves: string[];
}

export interface EndgamePuzzle {
  id: string;
  name: string;
  goal: string;
  fen: string;
}

/** 对局信息（左栏） */
export interface GameInfo {
  side: string;
  turn: string;
  difficulty: Difficulty;
  mode: string;
  evaluation: string;
  history: { ply: number; san: string }[];
}
