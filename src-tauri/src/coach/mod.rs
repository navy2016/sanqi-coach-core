// ============ 变化树与复盘评分模块（骨架） ============
// 完整实现依赖 engine 层评估走法。TODO: 集成引擎评估后补全

use serde::{Deserialize, Serialize};
use crate::common::rating::Grade;

/// 单候选走法评估
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CandidateEval {
    pub move_str: String,
    pub loss_cp: i32,
    pub grade: Grade,
    pub is_best: bool,
    pub eval_cp: Option<i32>,
    pub best_reply: Option<String>,
    pub pv_lines: Vec<String>,
}

/// 评级档位（复导出，与 common::rating::Grade 相同）
pub type EvalGrade = Grade;

/// 复盘单步记录
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewStep {
    pub index: usize,
    pub side: String,
    #[serde(rename = "move")]
    pub mv: String,
    pub grade: Grade,
    pub loss: i32,
    pub turning: bool,
    pub note: Option<String>,
}

/// 变化树节点
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VariationNode {
    #[serde(rename = "move")]
    pub mv: String,
    pub grade: String,
    pub score: Option<i32>,
    pub tags: Option<Vec<String>>,
    pub bestReply: Option<BestReply>,
    pub altReplies: Option<Vec<AltReply>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BestReply {
    #[serde(rename = "move")]
    pub mv: String,
    pub followUps: Option<Vec<FollowUp>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AltReply {
    #[serde(rename = "move")]
    pub mv: String,
    pub reply: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FollowUp {
    #[serde(rename = "move")]
    pub mv: String,
    pub tags: Option<Vec<String>>,
}

/// 复盘逐手评分（与前端 ScoredMove 对齐）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoredMove {
    pub index: i32,
    pub side: String,
    #[serde(rename = "move")]
    pub mv: String,
    pub grade: String,
    pub loss: i32,
    pub turning: Option<bool>,
    pub note: Option<String>,
}