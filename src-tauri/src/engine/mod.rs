// ============ 引擎对接层 ============
// pikafish（象棋）/ Stockfish（国象）走 UCI 协议
// KataGo（围棋）走 GTP 协议
// 引擎二进制由外部路径注入（不打包进仓库）；不可用时降级内置简单搜索

use crate::rules::{GameKind, Move, Side};
use crate::common::error::{CoreError, CoreResult};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufReader, BufWriter, Read, Write};
use std::process::{Child, Command, Stdio};

/// 引擎种类
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EngineKind {
    Pikafish,
    Stockfish,
    KataGo,
    Simple,
}

impl EngineKind {
    pub fn from_game(kind: GameKind) -> Self {
        match kind {
            GameKind::Xiangqi => EngineKind::Pikafish,
            GameKind::Chess => EngineKind::Stockfish,
            GameKind::Go => EngineKind::KataGo,
        }
    }
    pub fn name(&self) -> &'static str {
        match self {
            EngineKind::Pikafish => "pikafish",
            EngineKind::Stockfish => "stockfish",
            EngineKind::KataGo => "katago",
            EngineKind::Simple => "simple",
        }
    }
}

/// 引擎配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineConfig {
    pub kind: EngineKind,
    pub binary_path: Option<String>,
    pub args: Vec<String>,
    pub hash_mb: usize,
    pub threads: usize,
    pub max_depth: usize,
    pub max_seconds: f64,
}

impl EngineConfig {
    pub fn default(kind: EngineKind) -> Self {
        Self {
            kind,
            binary_path: None,
            args: vec![],
            hash_mb: 256,
            threads: 2,
            max_depth: 12,
            max_seconds: 5.0,
        }
    }
    pub fn is_available(&self) -> bool {
        if self.kind == EngineKind::Simple {
            return true;
        }
        self.binary_path
            .as_ref()
            .map(|p| std::path::Path::new(p).exists())
            .unwrap_or(false)
    }
}

/// 引擎进程封装（简化版：同步读写，生产应用需异步/超时）
pub struct EngineProcess {
    pub kind: EngineKind,
    pub config: EngineConfig,
    child: Option<Child>,
    stdin: Option<BufWriter<Box<dyn Write>>>,
    stdout: Option<BufReader<Box<dyn Read>>>,
}

impl std::fmt::Debug for EngineProcess {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("EngineProcess")
            .field("kind", &self.kind)
            .field("config", &self.config)
            .field("child_alive", &self.child.is_some())
            .field("stdin_connected", &self.stdin.is_some())
            .field("stdout_connected", &self.stdout.is_some())
            .finish()
    }
}

impl EngineProcess {
    pub fn start(config: &EngineConfig) -> CoreResult<Self> {
        if !config.is_available() {
            return Err(CoreError::EngineUnavailable(
                format!("{} 引擎不可用：二进制未配置或路径不存在", config.kind.name())
            ));
        }
        if config.kind == EngineKind::Simple {
            return Ok(Self {
                kind: EngineKind::Simple,
                config: config.clone(),
                child: None,
                stdin: None,
                stdout: None,
            });
        }
        let binary = config.binary_path.as_ref().ok_or_else(|| {
            CoreError::EngineUnavailable("引擎路径未配置".into())
        })?;
        let cmd = Command::new(binary.clone())
            .args(&config.args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn();
        if let Err(e) = cmd {
            return Err(CoreError::EngineIo(format!("启动引擎失败: {}", e)));
        }
        let mut child = cmd.unwrap();
        let stdin = child.stdin.take().map(|s| BufWriter::new(Box::new(s) as Box<dyn Write>));
        let stdout = child.stdout.take().map(|s| BufReader::new(Box::new(s) as Box<dyn Read>));
        Ok(Self {
            kind: config.kind,
            config: config.clone(),
            child: Some(child),
            stdin,
            stdout,
        })
    }

    pub fn send_uci(&mut self, line: &str) -> CoreResult<()> {
        if self.stdin.is_none() {
            return Err(CoreError::EngineUnavailable("引擎进程 stdin 未连接".into()));
        }
        let input = format!("{}\n", line);
        self.stdin.as_mut().unwrap().write_all(input.as_bytes())?;
        self.stdin.as_mut().unwrap().flush()?;
        Ok(())
    }

    /// 读取引擎输出直到出现 marker（简化：行读取，无超时）
    pub fn recv_until(&mut self, marker: &str) -> CoreResult<String> {
        if self.stdout.is_none() {
            return Err(CoreError::EngineUnavailable("引擎进程 stdout 未连接".into()));
        }
        let mut out = String::new();
        let reader = self.stdout.as_mut().unwrap();
        let mut line = vec![0u8; 4096];
        loop {
            let n = reader.read(&mut line)?;
            if n == 0 {
                break;
            }
            let chunk = String::from_utf8_lossy(&line[..n]);
            out.push_str(&chunk);
            if out.contains(marker) {
                break;
            }
        }
        Ok(out)
    }

    pub fn stop(&mut self) {
        if let Some(c) = self.child.as_mut() {
            c.kill();
            c.wait();
        }
        self.child = None;
        self.stdin = None;
        self.stdout = None;
    }

    /// 获取引擎最佳走法（UCI 协议）
    pub fn best_move_uci(&mut self, fen: &str) -> CoreResult<String> {
        self.send_uci(&format!("position fen {}", fen))?;
        self.send_uci(&format!("go movetime {}", (self.config.max_seconds * 1000.0) as u64))?;
        let resp = self.recv_until("bestmove")?;
        for line in resp.split('\n') {
            let t = line.trim();
            if t.starts_with("bestmove ") {
                return Ok(t[9..].trim().to_string());
            }
        }
        Err(CoreError::EngineBadResponse("UCI 引擎未返回 bestmove".into()))
    }

    /// 获取引擎最佳走法（GTP 协议）
    pub fn best_move_gtp(&mut self, color: &str, move_list: &[(Side, String)]) -> CoreResult<String> {
        self.send_uci("boardsize 19")?;
        self.recv_until("\n")?;
        self.send_uci("clear_board")?;
        self.recv_until("\n")?;
        for (_, mv) in move_list {
            self.send_uci(&format!("play {}", mv))?;
            self.recv_until("\n")?;
        }
        self.send_uci(&format!("genmove {}", color))?;
        let resp = self.recv_until("\n")?;
        let t = resp.trim();
        if t.starts_with("= ") {
            return Ok(t[2..].trim().to_string());
        }
        if t.starts_with("? ") {
            return Err(CoreError::EngineBadResponse(format!("GTP 引擎错误: {}", t)));
        }
        Ok(t.to_string())
    }
}

/// 全局引擎管理器
#[derive(Debug)]
pub struct EngineManager {
    engines: HashMap<(GameKind, Side), EngineProcess>,
    configs: HashMap<GameKind, EngineConfig>,
}

impl EngineManager {
    pub fn new() -> Self {
        Self {
            engines: HashMap::new(),
            configs: HashMap::new(),
        }
    }
    pub fn register_config(&mut self, kind: GameKind, config: EngineConfig) {
        self.configs.insert(kind, config);
    }
    pub fn get_config(&self, kind: GameKind) -> EngineConfig {
        self.configs.get(&kind).map(|c| c.clone()).unwrap_or_else(|| {
            EngineConfig::default(EngineKind::from_game(kind))
        })
    }
    pub fn get_or_start(&mut self, kind: GameKind, side: Side) -> CoreResult<&mut EngineProcess> {
        let key = (kind, side);
        if !self.engines.contains_key(&key) {
            let config = self.get_config(kind);
            let engine = EngineProcess::start(&config)?;
            self.engines.insert(key, engine);
        }
        Ok(self.engines.get_mut(&key).unwrap())
    }
    pub fn stop_all(&mut self) {
        for (_, eng) in self.engines.iter_mut() {
            eng.stop();
        }
        self.engines.clear();
    }
}
// ============ 内置运行时：引擎二进制解析 ============
// 原文要求「内置运行时」：引擎随包分发，不依赖用户手动配置。
// 查找顺序：环境变量 → 应用资源目录 → Android 原生库目录 → 同目录可执行文件。

/// 按棋种解析内置引擎可执行文件路径
pub fn resolve_binary(kind: EngineKind) -> Option<String> {
    let name = kind.name();
    // 1) 环境变量显式指定（开发/调试）
    for key in [format!("SANQI_ENGINE_{}", name.to_uppercase()), "SANQI_ENGINE".to_string()] {
        if let Ok(p) = std::env::var(&key) {
            if std::path::Path::new(&p).exists() {
                return Some(p);
            }
        }
    }
    // 2) 候选路径：桌面资源目录 / Android 原生库 / 当前目录
    let exe = std::env::current_exe().ok();
    let exe_dir = exe.as_ref().and_then(|p| p.parent().map(|d| d.to_path_buf()));
    let mut candidates: Vec<std::path::PathBuf> = Vec::new();
    if let Some(dir) = &exe_dir {
        candidates.push(dir.join("resources").join("engine").join(name));
        candidates.push(dir.join("engine").join(name));
        candidates.push(dir.join(name));
        // Android: 原生库以 lib<name>.so 形式随 APK 分发
        candidates.push(dir.join(format!("lib{name}.so")));
        candidates.push(dir.join("..").join("lib").join(format!("lib{name}.so")));
    }
    candidates.push(std::path::PathBuf::from(format!("/data/local/tmp/{name}")));
    candidates.push(std::path::PathBuf::from(format!("/usr/local/bin/{name}")));
    for c in candidates {
        if c.exists() {
            return Some(c.to_string_lossy().to_string());
        }
    }
    None
}

/// 构建带内置路径的默认配置
pub fn config_with_bundled(kind: GameKind) -> EngineConfig {
    let ek = EngineKind::from_game(kind);
    let mut cfg = EngineConfig::default(ek);
    cfg.binary_path = resolve_binary(ek);
    cfg
}
