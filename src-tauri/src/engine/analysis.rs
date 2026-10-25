// ============ 引擎分析层 ============
// 职责：把「内置引擎」变成可用的分析能力。
//  1) bootstrap：把随包分发的引擎/NNUE 释放到可执行、可读路径
//  2) analyze_uci：position fen + go depth，解析 score cp 与 pv
//  3) analyze_go：围棋走自研 MCTS（go_mcts），不依赖外部二进制

use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use crate::common::error::{CoreError, CoreResult};
use crate::engine::EngineKind;
use crate::rules::{GameKind, Piece, PieceKind, Side};
use std::collections::HashMap;

pub struct EngineEval {
    pub best_move: String,
    /// 以走子方视角的评分（厘兵）；围棋为胜率千分比
    pub score_cp: i32,
    pub pv: Vec<String>,
}

/// 把随包资源释放到 app_data_dir，并确保可执行
pub fn bootstrap(kind: EngineKind, app_data_dir: &Path) -> CoreResult<PathBuf> {
    let name = kind.name();
    std::fs::create_dir_all(app_data_dir)
        .map_err(|e| CoreError::EngineIo(format!("创建数据目录失败: {e}")))?;

    // 1) 引擎本体
    let src = crate::engine::resolve_binary(kind)
        .ok_or_else(|| CoreError::EngineUnavailable(format!("未找到内置引擎 {name}")))?;
    let src_path = PathBuf::from(&src);
    let dst = app_data_dir.join(name);

    let need_copy = match (std::fs::metadata(&dst), std::fs::metadata(&src_path)) {
        (Ok(d), Ok(s)) => d.len() != s.len(),
        _ => true,
    };
    if need_copy {
        std::fs::copy(&src_path, &dst)
            .map_err(|e| CoreError::EngineIo(format!("释放引擎失败: {e}")))?;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&dst, std::fs::Permissions::from_mode(0o755));
    }

    // 2) NNUE（pikafish/stockfish 需要）
    if let Some(nnue_src) = resolve_nnue(kind) {
        let nnue_dst = app_data_dir.join(format!("{name}.nnue"));
        let need = match (std::fs::metadata(&nnue_dst), std::fs::metadata(&nnue_src)) {
            (Ok(d), Ok(s)) => d.len() != s.len(),
            _ => true,
        };
        if need {
            std::fs::copy(&nnue_src, &nnue_dst)
                .map_err(|e| CoreError::EngineIo(format!("释放 NNUE 失败: {e}")))?;
        }
    }

    Ok(dst)
}

fn resolve_nnue(kind: EngineKind) -> Option<PathBuf> {
    let name = kind.name();
    let exe_dir = std::env::current_exe().ok()?.parent()?.to_path_buf();
    let cands = [
        exe_dir.join("resources").join("engine").join(format!("{name}.nnue")),
        exe_dir.join("engine").join(format!("{name}.nnue")),
        exe_dir.join(format!("{name}.nnue")),
        PathBuf::from(format!("/data/local/tmp/{name}.nnue")),
    ];
    cands.into_iter().find(|p| p.exists())
}

/// 同步分析一个局面（UCI）。depth 建议 8~14，移动端别开太高。
pub fn analyze_uci(kind: EngineKind, engine_path: &Path, fen: &str, depth: u32) -> CoreResult<EngineEval> {
    let mut child = Command::new(engine_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| CoreError::EngineIo(format!("启动引擎失败: {e}")))?;

    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| CoreError::EngineIo("stdin 不可用".into()))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| CoreError::EngineIo("stdout 不可用".into()))?;

    let mut send = |s: &str| -> CoreResult<()> {
        writeln!(stdin, "{s}").map_err(|e| CoreError::EngineIo(e.to_string()))?;
        stdin.flush().map_err(|e| CoreError::EngineIo(e.to_string()))?;
        Ok(())
    };

    send("uci")?;
    // NNUE 路径（若存在）
    if let Some(dir) = engine_path.parent() {
        let nnue = dir.join(format!("{}.nnue", kind.name()));
        if nnue.exists() {
            send(&format!("setoption name EvalFile value {}", nnue.display()))?;
        }
    }
    send("isready")?;
    send(&format!("position fen {fen}"))?;
    send(&format!("go depth {depth}"))?;

    use std::io::{BufRead, BufReader};
    let reader = BufReader::new(stdout);
    let mut best = String::new();
    let mut score = 0i32;
    let mut pv: Vec<String> = Vec::new();
    let mut lines = 0usize;

    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };
        lines += 1;
        if lines > 200_000 {
            break;
        }
        if let Some(rest) = line.strip_prefix("info ") {
            if let Some(idx) = rest.find(" score ") {
                let tail = &rest[idx + 7..];
                let mut it = tail.split_whitespace();
                let kind_s = it.next().unwrap_or("");
                let val = it.next().and_then(|v| v.parse::<i32>().ok()).unwrap_or(0);
                score = if kind_s == "mate" { if val > 0 { 30_000 } else { -30_000 } } else { val };
            }
            if let Some(idx) = rest.find(" pv ") {
                pv = rest[idx + 4..]
                    .split_whitespace()
                    .map(|s| s.to_string())
                    .collect();
            }
        }
        if line.starts_with("bestmove ") {
            best = line[9..].split_whitespace().next().unwrap_or("").to_string();
            break;
        }
    }

    let _ = send("quit");
    let _ = child.wait();

    if best.is_empty() || best == "(none)" {
        return Err(CoreError::EngineBadResponse("引擎未返回 bestmove".into()));
    }
    Ok(EngineEval { best_move: best, score_cp: score, pv })
}

/// 局面 → FEN（象棋/国象）
pub fn to_fen(kind: GameKind, board: &[Vec<Option<Piece>>], side: Side) -> String {
    let mut rows: Vec<String> = Vec::new();
    for row in board {
        let mut s = String::new();
        let mut empty = 0;
        for cell in row {
            match cell {
                None => empty += 1,
                Some(p) => {
                    if empty > 0 { s.push_str(&empty.to_string()); empty = 0; }
                    let ch = piece_char(kind, p);
                    s.push(if p.side == Side::White { ch.to_ascii_uppercase() } else { ch });
                }
            }
        }
        if empty > 0 { s.push_str(&empty.to_string()); }
        rows.push(s);
    }
    let stm = if side == Side::White { "w" } else { "b" };
    format!("{} {} - - 0 1", rows.join("/"), stm)
}

fn piece_char(kind: GameKind, p: &Piece) -> char {
    match kind {
        GameKind::Xiangqi => match p.kind {
            PieceKind::King => 'k',
            PieceKind::Advisor => 'a',
            PieceKind::Elephant => 'b',
            PieceKind::Horse => 'n',
            PieceKind::Rook => 'r',
            PieceKind::Cannon => 'c',
            PieceKind::Pawn => 'p',
            _ => '?',
        },
        _ => match p.kind {
            PieceKind::King => 'k',
            PieceKind::Queen => 'q',
            PieceKind::Rook => 'r',
            PieceKind::Bishop => 'b',
            PieceKind::Knight => 'n',
            PieceKind::Pawn => 'p',
            _ => '?',
        },
    }
}

/// MultiPV 分析：返回 (uci 着法, 厘兵评分) 列表，按评分降序
pub fn analyze_multipv(
    kind: EngineKind,
    engine_path: &Path,
    fen: &str,
    depth: u32,
    n: usize,
) -> CoreResult<Vec<(String, i32)>> {
    use std::io::{BufRead, BufReader};
    let mut child = Command::new(engine_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| CoreError::EngineIo(format!("启动引擎失败: {e}")))?;
    let mut stdin = child.stdin.take().ok_or_else(|| CoreError::EngineIo("stdin".into()))?;
    let stdout = child.stdout.take().ok_or_else(|| CoreError::EngineIo("stdout".into()))?;
    let mut send = |s: &str| -> CoreResult<()> {
        writeln!(stdin, "{s}").map_err(|e| CoreError::EngineIo(e.to_string()))?;
        stdin.flush().map_err(|e| CoreError::EngineIo(e.to_string()))?;
        Ok(())
    };
    send("uci")?;
    if let Some(dir) = engine_path.parent() {
        let nnue = dir.join(format!("{}.nnue", kind.name()));
        if nnue.exists() {
            send(&format!("setoption name EvalFile value {}", nnue.display()))?;
        }
    }
    send(&format!("setoption name MultiPV value {}", n.max(1)))?;
    send("isready")?;
    send(&format!("position fen {fen}"))?;
    send(&format!("go depth {depth}"))?;

    let mut best: HashMap<usize, (String, i32)> = HashMap::new();
    let reader = BufReader::new(stdout);
    for line in reader.lines() {
        let line = match line { Ok(l) => l, Err(_) => break };
        if let Some(rest) = line.strip_prefix("info ") {
            let mut pv_idx = 1usize;
            let mut score = 0i32;
            let mut mv = String::new();
            let toks: Vec<&str> = rest.split_whitespace().collect();
            let mut i = 0;
            while i < toks.len() {
                match toks[i] {
                    "multipv" => { pv_idx = toks.get(i + 1).and_then(|v| v.parse().ok()).unwrap_or(1); i += 2; }
                    "score" => {
                        let kind_s = toks.get(i + 1).copied().unwrap_or("");
                        let val = toks.get(i + 2).and_then(|v| v.parse::<i32>().ok()).unwrap_or(0);
                        score = if kind_s == "mate" { if val > 0 { 30_000 } else { -30_000 } } else { val };
                        i += 3;
                    }
                    "pv" => { mv = toks.get(i + 1).copied().unwrap_or("").to_string(); break; }
                    _ => i += 1,
                }
            }
            if !mv.is_empty() && mv != "(none)" {
                best.insert(pv_idx, (mv, score));
            }
        }
        if line.starts_with("bestmove ") { break; }
    }
    let _ = send("quit");
    let _ = child.wait();
    let mut out: Vec<(String, i32)> = best.into_values().collect();
    out.sort_by(|a, b| b.1.cmp(&a.1));
    if out.is_empty() {
        return Err(CoreError::EngineBadResponse("MultiPV 无输出".into()));
    }
    Ok(out)
}
