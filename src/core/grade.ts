/** 走法评级分档与颜色（SPEC 分档 A，原文三处交叉印证） */
import type { Grade } from './types';

/** 损失分 → 档位（单位：厘兵/分） */
export function gradeForLoss(loss: number): Grade {
  if (loss <= 30) return 'best';
  if (loss <= 80) return 'good';
  if (loss <= 180) return 'suspect';
  if (loss <= 350) return 'mistake';
  return 'blunder';
}

/** 档位展示文案 */
export const GRADE_LABEL: Record<Grade, string> = {
  best: '✓ 最佳',
  good: '良好',
  suspect: '⚠ 可疑',
  mistake: '✗ 失误',
  blunder: '✗✗ 严重失误',
  global: '★ 全局最优',
};

/** 档位 → CSS class 后缀 */
export const GRADE_CLASS: Record<Grade, string> = {
  best: 'grade-best',
  good: 'grade-good',
  suspect: 'grade-suspect',
  mistake: 'grade-mistake',
  blunder: 'grade-blunder',
  global: 'grade-global',
};