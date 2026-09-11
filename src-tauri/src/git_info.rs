use serde::Serialize;
use std::path::Path;
use std::process::{Command, Output};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRemoteInfo {
    name: String,
    fetch_url: String,
    push_url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitConfigEntry {
    key: String,
    value: String,
    origin: Option<String>,
    source_scope: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitConfigLayers {
    global: Vec<GitConfigEntry>,
    local: Vec<GitConfigEntry>,
    effective: Vec<GitConfigEntry>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitWorkingState {
    clean: bool,
    staged: usize,
    unstaged: usize,
    untracked: usize,
    conflicted: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRepositoryInfo {
    repository_path: String,
    git_dir: String,
    git_version: String,
    current_branch: String,
    detached_head: bool,
    head_hash: Option<String>,
    head_short_hash: Option<String>,
    upstream: Option<String>,
    ahead: usize,
    behind: usize,
    working_state: GitWorkingState,
    remotes: Vec<GitRemoteInfo>,
    config: GitConfigLayers,
}

const SAFE_CONFIG_KEYS: &[&str] = &[
    "user.name",
    "user.email",
    "core.autocrlf",
    "core.safecrlf",
    "core.filemode",
    "core.ignorecase",
    "core.editor",
    "init.defaultBranch",
    "pull.rebase",
    "push.default",
    "fetch.prune",
    "rebase.autostash",
    "commit.gpgSign",
    "tag.gpgSign",
    "gpg.format",
    "diff.algorithm",
    "merge.conflictStyle",
    "rerere.enabled",
    "color.ui",
    "credential.helper",
];

#[tauri::command]
pub async fn get_git_repository_info(repo_path: String) -> Result<GitRepositoryInfo, String> {
    let path = Path::new(&repo_path);
    validate_git_repository(path)?;

    let repository_path = run_git(path, &["rev-parse", "--show-toplevel"])?
        .trim()
        .to_string();
    let git_dir = run_git(path, &["rev-parse", "--absolute-git-dir"])?
        .trim()
        .to_string();
    let git_version = run_git(path, &["--version"])?.trim().to_string();

    let branch_output = run_git(path, &["branch", "--show-current"])?;
    let branch_name = branch_output.trim();
    let detached_head = branch_name.is_empty();
    let current_branch = if detached_head {
        "DETACHED HEAD".to_string()
    } else {
        branch_name.to_string()
    };

    let head_hash = run_git_optional(path, &["rev-parse", "--verify", "HEAD"])?
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let head_short_hash = run_git_optional(path, &["rev-parse", "--short", "HEAD"])?
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let upstream = run_git_optional(
        path,
        &[
            "rev-parse",
            "--abbrev-ref",
            "--symbolic-full-name",
            "@{upstream}",
        ],
    )?
    .map(|value| value.trim().to_string())
    .filter(|value| !value.is_empty());

    let (ahead, behind) = if upstream.is_some() && head_hash.is_some() {
        let counts = run_git(path, &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"])?;
        parse_ahead_behind(&counts)
    } else {
        (0, 0)
    };

    Ok(GitRepositoryInfo {
        repository_path,
        git_dir,
        git_version,
        current_branch,
        detached_head,
        head_hash,
        head_short_hash,
        upstream,
        ahead,
        behind,
        working_state: read_working_state(path)?,
        remotes: read_remotes(path)?,
        config: read_config_layers(path)?,
    })
}

fn read_working_state(path: &Path) -> Result<GitWorkingState, String> {
    let output = run_git(
        path,
        &["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    )?;

    let mut staged = 0;
    let mut unstaged = 0;
    let mut untracked = 0;
    let mut conflicted = 0;
    let mut records = output.split('\0').filter(|record| !record.is_empty());

    while let Some(record) = records.next() {
        let bytes = record.as_bytes();
        if bytes.len() < 3 {
            continue;
        }

        let x = bytes[0] as char;
        let y = bytes[1] as char;
        let is_conflict = matches!(
            (x, y),
            ('D', 'D')
                | ('A', 'U')
                | ('U', 'D')
                | ('U', 'A')
                | ('D', 'U')
                | ('A', 'A')
                | ('U', 'U')
        );

        if x == '?' && y == '?' {
            untracked += 1;
        } else if is_conflict {
            conflicted += 1;
        } else {
            if x != ' ' {
                staged += 1;
            }
            if y != ' ' {
                unstaged += 1;
            }
        }

        if matches!(x, 'R' | 'C') || matches!(y, 'R' | 'C') {
            let _ = records.next();
        }
    }

    Ok(GitWorkingState {
        clean: staged == 0 && unstaged == 0 && untracked == 0 && conflicted == 0,
        staged,
        unstaged,
        untracked,
        conflicted,
    })
}

fn read_remotes(path: &Path) -> Result<Vec<GitRemoteInfo>, String> {
    let output = run_git(path, &["remote"])?;
    let mut remotes = Vec::new();

    for name in output.lines().map(str::trim).filter(|value| !value.is_empty()) {
        let fetch_url = run_git_optional(path, &["remote", "get-url", name])?
            .map(|value| sanitize_remote_url(value.trim()))
            .unwrap_or_default();
        let push_url = run_git_optional(path, &["remote", "get-url", "--push", name])?
            .map(|value| sanitize_remote_url(value.trim()))
            .unwrap_or_else(|| fetch_url.clone());

        remotes.push(GitRemoteInfo {
            name: name.to_string(),
            fetch_url,
            push_url,
        });
    }

    Ok(remotes)
}

fn read_config_layers(path: &Path) -> Result<GitConfigLayers, String> {
    let mut global = Vec::new();
    let mut local = Vec::new();
    let mut effective = Vec::new();

    for key in SAFE_CONFIG_KEYS {
        let global_entries = read_scoped_config(path, key, "--global", "global")?;
        let local_entries = read_scoped_config(path, key, "--local", "local")?;
        let effective_entries = read_effective_config(path, key, &global_entries, &local_entries)?;

        global.extend(global_entries);
        local.extend(local_entries);
        effective.extend(effective_entries);
    }

    Ok(GitConfigLayers {
        global,
        local,
        effective,
    })
}

fn read_scoped_config(
    path: &Path,
    key: &str,
    scope_flag: &str,
    scope_name: &str,
) -> Result<Vec<GitConfigEntry>, String> {
    let Some(output) = run_git_optional(
        path,
        &["config", scope_flag, "--show-origin", "--get-all", key],
    )? else {
        return Ok(Vec::new());
    };

    Ok(parse_origin_value_lines(&output)
        .into_iter()
        .map(|(origin, value)| GitConfigEntry {
            key: key.to_string(),
            value,
            origin,
            source_scope: scope_name.to_string(),
        })
        .collect())
}

fn read_effective_config(
    path: &Path,
    key: &str,
    global_entries: &[GitConfigEntry],
    local_entries: &[GitConfigEntry],
) -> Result<Vec<GitConfigEntry>, String> {
    let scoped_output = command_output(
        path,
        &["config", "--show-scope", "--show-origin", "--get", key],
    )?;

    if scoped_output.status.success() {
        let output = String::from_utf8_lossy(&scoped_output.stdout);
        let entries = parse_scope_origin_value_lines(&output, key);
        if !entries.is_empty() {
            return Ok(entries);
        }
    } else if matches!(scoped_output.status.code(), Some(1)) {
        return Ok(Vec::new());
    }

    // Git versions before --show-scope are still supported. Fall back to
    // origin-based classification using the independently read local/global layers.
    let Some(output) = run_git_optional(path, &["config", "--show-origin", "--get", key])? else {
        return Ok(Vec::new());
    };

    Ok(parse_origin_value_lines(&output)
        .into_iter()
        .map(|(origin, value)| {
            let source_scope = infer_scope(origin.as_deref(), global_entries, local_entries);
            GitConfigEntry {
                key: key.to_string(),
                value,
                origin,
                source_scope,
            }
        })
        .collect())
}

fn parse_scope_origin_value_lines(output: &str, key: &str) -> Vec<GitConfigEntry> {
    output
        .lines()
        .filter_map(|line| {
            let line = line.trim_end();
            if line.is_empty() {
                return None;
            }

            let parts: Vec<&str> = line.splitn(3, '\t').collect();
            let (scope, origin, value) = if parts.len() == 3 {
                (parts[0].trim(), parts[1].trim(), parts[2].to_string())
            } else {
                let mut tokens = line.split_whitespace();
                let scope = tokens.next()?;
                let origin = tokens.next()?;
                let prefix_len = line.find(origin)? + origin.len();
                let value = line[prefix_len..].trim_start().to_string();
                (scope, origin, value)
            };

            if value.is_empty() {
                return None;
            }

            Some(GitConfigEntry {
                key: key.to_string(),
                value,
                origin: if origin.is_empty() {
                    None
                } else {
                    Some(origin.to_string())
                },
                source_scope: scope.to_string(),
            })
        })
        .collect()
}

fn parse_origin_value_lines(output: &str) -> Vec<(Option<String>, String)> {
    output
        .lines()
        .filter_map(|line| {
            let line = line.trim_end();
            if line.is_empty() {
                return None;
            }

            let (origin, value) = if let Some((origin, value)) = line.split_once('\t') {
                (origin.trim(), value.to_string())
            } else if let Some(index) = line.find(char::is_whitespace) {
                let origin = line[..index].trim();
                let value = line[index..].trim_start().to_string();
                (origin, value)
            } else {
                ("", line.to_string())
            };

            if value.is_empty() {
                return None;
            }

            Some((
                if origin.is_empty() {
                    None
                } else {
                    Some(origin.to_string())
                },
                value,
            ))
        })
        .collect()
}

fn infer_scope(
    origin: Option<&str>,
    global_entries: &[GitConfigEntry],
    local_entries: &[GitConfigEntry],
) -> String {
    if let Some(origin) = origin {
        if local_entries
            .iter()
            .any(|entry| entry.origin.as_deref() == Some(origin))
        {
            return "local".to_string();
        }
        if global_entries
            .iter()
            .any(|entry| entry.origin.as_deref() == Some(origin))
        {
            return "global".to_string();
        }
    }

    "other".to_string()
}

fn parse_ahead_behind(output: &str) -> (usize, usize) {
    let mut values = output.split_whitespace();
    let ahead = values
        .next()
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(0);
    let behind = values
        .next()
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(0);
    (ahead, behind)
}

fn sanitize_remote_url(value: &str) -> String {
    let value = value.trim();
    let without_fragment = value.split('#').next().unwrap_or(value);
    let without_query = without_fragment.split('?').next().unwrap_or(without_fragment);

    let Some(scheme_index) = without_query.find("://") else {
        return without_query.to_string();
    };

    let scheme_end = scheme_index + 3;
    let scheme = &without_query[..scheme_end];
    let rest = &without_query[scheme_end..];

    match rest.rfind('@') {
        Some(index) => format!("{}{}", scheme, &rest[index + 1..]),
        None => without_query.to_string(),
    }
}

fn validate_git_repository(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Err("目录不存在".to_string());
    }

    let result = run_git(path, &["rev-parse", "--is-inside-work-tree"])?;
    if result.trim() != "true" {
        return Err("所选目录不是有效的 Git 仓库".to_string());
    }
    Ok(())
}

fn command_output(path: &Path, args: &[&str]) -> Result<Output, String> {
    Command::new("git")
        .arg("-C")
        .arg(path)
        .arg("-c")
        .arg("core.quotepath=false")
        .arg("-c")
        .arg("i18n.logOutputEncoding=UTF-8")
        .args(args)
        .output()
        .map_err(|error| format!("无法执行 Git。请确认系统已安装 git 并已加入 PATH：{error}"))
}

fn run_git(path: &Path, args: &[&str]) -> Result<String, String> {
    let output = command_output(path, args)?;
    if !output.status.success() {
        return Err(command_error(&output));
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

fn run_git_optional(path: &Path, args: &[&str]) -> Result<Option<String>, String> {
    let output = command_output(path, args)?;
    if output.status.success() {
        return Ok(Some(String::from_utf8_lossy(&output.stdout).into_owned()));
    }

    match output.status.code() {
        Some(1) | Some(128) => Ok(None),
        _ => Err(command_error(&output)),
    }
}

fn command_error(output: &Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stderr.is_empty() {
        format!("Git 命令执行失败，退出码：{:?}", output.status.code())
    } else {
        stderr
    }
}
