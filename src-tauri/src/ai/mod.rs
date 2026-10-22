// ============ AI 讲解服务层（骨架） ============
// OpenAI 兼容 API 客户端：可配 baseUrl/key/model（DeepSeek/智谱 GLM 均兼容），
// SSE 流式输出；请求失败时降级为基础提示文案，绝不编造棋理。
// TODO: 接入真实 SSE 解析（reqwest stream + futures-util 已在依赖中）

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiConfig {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
}

impl Default for AiConfig {
    fn default() -> Self {
        Self {
            base_url: "https://api.deepseek.com/v1".into(),
            api_key: "".into(),
            model: "deepseek-chat".into(),
        }
    }
}

impl AiConfig {
    pub fn is_configured(&self) -> bool {
        !self.base_url.is_empty() && !self.api_key.is_empty() && !self.model.is_empty()
    }
}

/// 讲解模式：当前局面 / 选中棋子（与前端 CoachMode 对齐）
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CoachMode {
    /// 讲解当前局面
    Position,
    /// 讲解选中棋子
    Piece,
}

impl CoachMode {
    pub fn as_str(&self) -> &'static str {
        match self {
            CoachMode::Position => "position",
            CoachMode::Piece => "piece",
        }
    }
}

/// 降级基础文案：引擎结论确定性翻译，不调用 AI 也能给出基础讲解
pub fn fallback_note(kind: &str, detail: &str) -> String {
    format!("（AI 服务未配置或不可用，以下为基础提示）{kind}：{detail}")
}