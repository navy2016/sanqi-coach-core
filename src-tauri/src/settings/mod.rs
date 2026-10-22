// ============ 设置读写模块 ============
// 使用 Tauri app data 目录读写 JSON 配置文件。
// TODO: 集成 tauri::path 获取 app_data_dir 实现真正文件读写。

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub ai: AiConfig,
    pub engine_paths: Vec<EnginePathEntry>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            ai: AiConfig::default(),
            engine_paths: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnginePathEntry {
    pub game_kind: String,
    pub engine_kind: String,
    pub path: String,
}

impl AppSettings {
    /// 从 Tauri app data 目录加载 settings.json（未实现时返回 Default）
    pub fn load() -> CoreResult<Self> {
        // TODO: tauri::path::app_data_dir() + std::fs::read_to_string + serde_json::from_str
        Ok(Self::default())
    }

    /// 保存到 Tauri app data 目录
    pub fn save(&self) -> CoreResult<()> {
        // TODO: serde_json::to_str_pretty + std::fs::write
        Ok(())
    }
}

use crate::ai::AiConfig;
use crate::common::error::CoreResult;