// ============ 引擎对接层 ============
// pikafish（象棋）/ Stockfish（国象）走 UCI 协议
// KataGo（围棋）走 GTP 协议
// 引擎二进制由外部路径注入（不打包进仓库）；不可用时降级内置简单搜索

use crate::rules::{GameKind, Move, Side};
use crate::common::error::{CoreError, CoreResult};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufWriter, Read, Write};
use std::process::{Child, Command, Stdio};

/// 引擎种类
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
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
#[derive(Debug)]
pub struct EngineProcess {
    pub kind: EngineKind,
    pub config: EngineConfig,
    child: Option<Child>,
    stdin: Option<BufWriter<Box<Write>>>,
    stdout: Option<BufRead<Box<Read>>>,
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
                config: *config,
                child: None,
                stdin: None,
                stdout: None,
            });
        }
        let cmd = Command::new(config.binary_path.clone())
            .args(&config.args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn();
        if let Err(e) = cmd {
            return Err(CoreError::EngineIo(format!("启动引擎失败: {}", e)));
        }
        let child = cmd.unwrap();
        let stdin = child.stdin().map(|s| BufWriter::new(s));
        let stdout = child.stdout().map(|s| BufRead::new(s));
        Ok(Self {
            kind: config.kind,
            config: *config,
            child: Some(child),
            stdin,
            stdout,
        })
    }

    pub fn send_uci(&mut self, line: &str) -> CoreResult<()> {
        if self.stdin.is_none() {
            return Err(CoreError::EngineUnavailable("引擎进程 stdin 未连接"));
        }
        let input = format!("{}\n", line);
        self.stdin.as_mut().unwrap().write_all(input.as_bytes())?;
        self.stdin.as_mut().unwrap().flush()?;
        Ok(())
    }

    pub fn recv_until(&mut self, marker: &str, timeout_ms: u64) -> CoreResult<String> {
        if self.stdout.is_none() {
            return Err(CoreError::EngineUnavailable("引擎进程 stdout 未连接"));
        }
        let mut out = String::new();
        let deadline = std::time::Instant::now() + std::time::Duration::from_millis(timeout_ms);
        let mut buf = [0u8; 4096];
        loop {
            if self.stdout.as_ref().unwrap().buf_peek(&mut [0u8; 1]).unwrap_or(0) == 0 {
                if std::time::Instant::now() > deadline {
                    return Err(CoreError::EngineIo("引擎响应超时"));
                }
                std::thread::sleep(std::time::Duration::from_millis(10));
                continue;
            }
            let n = self.stdout.as_mut().unwrap().read(&mut buf)?;
            if n == 0 {
                break;
            }
            let chunk = String::from_utf8_lossy(&buf[..n]);
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
        self.send_uci(format!("position fen {}", fen))?;
        self.send_uci(format!("go movetime {}", (self.config.max_seconds * 1000.0) as u64))?;
        let resp = self.recv_until("bestmove", 30000)?;
        for line in resp.split('\n') {
            let t = line.trim();
            if t.starts_with("bestmove ") {
                return Ok(t[9..].trim().to_string());
            }
        }
        Err(CoreError::EngineBadResponse("UCI 引擎未返回 bestmove"))
    }

    /// 获取引擎最佳走法（GTP 协议）
    pub fn best_move_gtp(&mut self, color: &str, move_list: &[(Side, String)]) -> CoreResult<String> {
        self.send_uci("boardsize 19")?;
        self.recv_until("\n", 1000)?;
        self.send_uci("clear_board")?;
        self.recv_until("\n", 1000)?;
        for (_, mv) in move_list {
            self.send_uci(format!("play {}", mv))?;
            self.recv_until("\n", 1000)?;
        }
        self.send_uci(format!("genmove {}", color))?;
        let resp = self.recv_until("\n", 30000)?;
        let t = resp.trim();
        if t.starts_with("= ") {
            return Ok(t[2..].trim().to_string());
        }
        if t.starts_with("? ") {
            return Err(CoreError::EngineBadResponse(format!("GTP 引擎错误: {}", t)));
        }
        // 也可能直接返回坐标
        Ok(t)
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
        self.engines.get_mut(&key).unwrap()
    }
    pub fn stop_all(&mut self) {
        for (_, eng) in self.engines {
            eng.stop();
        }
        self.engines.clear();
    }
}