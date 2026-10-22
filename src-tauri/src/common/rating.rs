// ============ 评级分档模块 ============
// 胜率损失（厘兵）→ 五档评级 + 全局最优标记。规则来自产品规格：
//   0-30   ✓ 最佳
//   31-80  ✓ 良好
//   81-180 ⚠ 可疑
//   181-350 ✗ 失误
//   >350   ✗✗ 严重失误
// 另有全局最优走法标记 ★（与档位独立叠加）。

use serde::{Deserialize, Serialize};

pub const CENTIPAWN_PER_PAWN: i32 = 100;

/// 五档评级
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Grade {
    Best,       // 0-30    ✓ 最佳
    Good,       // 31-80   ✓ 良好
    Dubious,    // 81-180  ⚠ 可疑
    Mistake,    // 181-350 ✗ 失误
    Blunder,    // >350    ✗✗ 严重失误
}

impl Grade {
    /// 根据胜率损失（厘兵）计算档位
    pub fn from_loss(loss_cp: i32) -> Self {
        let loss = loss_cp.max(0);
        if loss <= 30 {
            Grade::Best
        } else if loss <= 80 {
            Grade::Good
        } else if loss <= 180 {
            Grade::Dubious
        } else if loss <= 350 {
            Grade::Mistake
        } else {
            Grade::Blunder
        }
    }

    pub fn symbol(&self) -> &'static str {
        match self {
            Grade::Best => "✓",
            Grade::Good => "✓",
            Grade::Dubious => "⚠",
            Grade::Mistake => "✗",
            Grade::Blunder => "✗✗",
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            Grade::Best => "最佳",
            Grade::Good => "良好",
            Grade::Dubious => "可疑",
            Grade::Mistake => "失误",
            Grade::Blunder => "严重失误",
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Grade::Best => "best",
            Grade::Good => "good",
            Grade::Dubious => "dubious",
            Grade::Mistake => "mistake",
            Grade::Blunder => "blunder",
        }
    }
}

/// 单手评级结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MoveGrade {
    /// 走法（协议格式，如 "e2e4" / "h2e2" / "Q16"）
    pub move_str: String,
    /// 胜率损失（厘兵，非负）
    pub loss_cp: i32,
    /// 档位
    pub grade: Grade,
    /// 是否全局最优（★）
    #[serde(default)]
    pub is_best: bool,
    /// 引擎对该走法的原始评分（厘兵，当前行棋方视角）
    #[serde(default)]
    pub eval_cp: Option<i32>,
    /// 对方最强回应（1 手）
    #[serde(default)]
    pub best_reply: Option<String>,
    /// 3 层变化树（对方→我方→对方，协议走法字符串）
    #[serde(default)]
    pub pv_lines: Vec<String>,
}

impl MoveGrade {
    pub fn new(move_str: impl Into<String>, loss_cp: i32) -> Self {
        let loss = loss_cp.max(0);
        Self {
            move_str: move_str.into(),
            loss_cp: loss,
            grade: Grade::from_loss(loss),
            is_best: false,
            eval_cp: None,
            best_reply: None,
            pv_lines: Vec::new(),
        }
    }
}

/// 复盘中的转折点：损失分突然显著上升的手数
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TurningPoint {
    /// 手数（1 起始）
    pub ply: usize,
    /// 该手走法
    pub move_str: String,
    /// 该手损失（厘兵）
    pub loss_cp: i32,
    /// 档位
    pub grade: Grade,
    /// 转折原因说明（如"损失较前一手大幅上升"）
    pub reason: String,
}

/// 检测转折点：损失较前一手显著上升（差值 ≥ 80 厘兵）且本手 ≥ Good 档
pub fn detect_turning_points(moves: &[MoveGrade]) -> Vec<TurningPoint> {
    let mut out = Vec::new();
    let mut prev_loss = 0i32;
    for (i, m) in moves.iter().enumerate() {
        let rise = m.loss_cp - prev_loss;
        if rise >= 80 && m.loss_cp >= 31 {
            out.push(TurningPoint {
                ply: i + 1,
                move_str: m.move_str.clone(),
                loss_cp: m.loss_cp,
                grade: m.grade,
                reason: format!("损失较前一手上升 {} 厘兵", rise),
            });
        }
        prev_loss = m.loss_cp;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_grade_boundaries() {
        assert_eq!(Grade::from_loss(0), Grade::Best);
        assert_eq!(Grade::from_loss(30), Grade::Best);
        assert_eq!(Grade::from_loss(31), Grade::Good);
        assert_eq!(Grade::from_loss(80), Grade::Good);
        assert_eq!(Grade::from_loss(81), Grade::Dubious);
        assert_eq!(Grade::from_loss(180), Grade::Dubious);
        assert_eq!(Grade::from_loss(181), Grade::Mistake);
        assert_eq!(Grade::from_loss(350), Grade::Mistake);
        assert_eq!(Grade::from_loss(351), Grade::Blunder);
        assert_eq!(Grade::from_loss(-5), Grade::Best); // 负数截断为 0
    }

    #[test]
    fn test_grade_symbols() {
        assert_eq!(Grade::Best.symbol(), "✓");
        assert_eq!(Grade::Dubious.symbol(), "⚠");
        assert_eq!(Grade::Blunder.symbol(), "✗✗");
        assert_eq!(Grade::Mistake.label(), "失误");
    }

    #[test]
    fn test_turning_point_detection() {
        let moves = vec![
            MoveGrade::new("e2e4", 10),  // 平稳
            MoveGrade::new("e7e5", 20),  // 平稳
            MoveGrade::new("g1f3", 200), // 突然上升 → 转折点
            MoveGrade::new("b8c6", 210), // 持续高
        ];
        let tps = detect_turning_points(&moves);
        assert_eq!(tps.len(), 1);
        assert_eq!(tps[0].ply, 3);
        assert_eq!(tps[0].move_str, "g1f3");
        assert_eq!(tps[0].grade, Grade::Mistake);
    }

    #[test]
    fn test_no_turning_points_when_steady() {
        let moves = vec![
            MoveGrade::new("e2e4", 10),
            MoveGrade::new("e7e5", 15),
            MoveGrade::new("g1f3", 25),
        ];
        assert!(detect_turning_points(&moves).is_empty());
    }
}
