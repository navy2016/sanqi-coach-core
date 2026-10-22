// ============ 统一错误类型 ============
// 所有模块共享的错误定义与 From 转换，供 Tauri command 层统一序列化为 String。

use thiserror::Error;

pub type CoreResult<T> = Result<T, CoreError>;

#[derive(Debug, Error)]
pub enum CoreError {
    #[error("非法走法: {0}")]
    IllegalMove(String),

    #[error("棋局已结束: {0}")]
    GameOver(String),

    #[error("棋盘状态无效: {0}")]
    InvalidState(String),

    #[error("引擎不可用: {0}")]
    EngineUnavailable(String),

    #[error("引擎通信错误: {0}")]
    EngineIo(String),

    #[error("引擎响应异常: {0}")]
    EngineBadResponse(String),

    #[error("AI 讲解服务错误: {0}")]
    AiService(String),

    #[error("AI 讲解请求超时")]
    AiTimeout,

    #[error("设置读写错误: {0}")]
    Settings(String),

    #[error("功能未实现: {0}")]
    NotImplemented(String),

    #[error("IO 错误: {0}")]
    Io(#[from] std::io::Error),

    #[error("序列化错误: {0}")]
    Serde(#[from] serde_json::Error),
}

impl serde::Serialize for CoreError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}
