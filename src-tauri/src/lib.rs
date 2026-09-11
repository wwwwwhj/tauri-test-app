mod branches;
mod git_detail;
mod git_info;
mod working_tree;

use serde::Serialize;
use std::path::Path;
use std::process::{Command, Output};
use sysinfo::System;
use tauri_plugin_dialog::DialogExt;

#[derive(Serialize)]
struct CpuInfo {
    brand: String,
    vendor: String,
    architecture: String,
    physical_cores: Option<usize>,
    logical_cores: usize,
    frequency_mhz: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitRefInfo {
    name: String,
    kind: String,
    current: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitCommit {
    hash: String,
    short_hash: String,
    parents: Vec<String>,
    author_name: String,
    author_email: String,
    date: String,
    message: String,
    refs: Vec<GitRefInfo>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitLogResult {
    repository_path: String,
    current_branch: String,
    commits: Vec<GitCommit>,
}

#[tauri::command]
fn get_cpu_info() -> CpuInfo {
    let sys = System::new_all();
    let cpus = sys.cpus();
    let first_cpu = cpus.first();

    CpuInfo {
        brand: first_cpu
            .map(|cpu| cpu.brand().to_string())
            .unwrap_or_default(),
        vendor: first_cpu
            .map(|cpu| cpu.vendor_id().to_string())
            .unwrap_or_default(),
        architecture: System::cpu_arch(),
        physical_cores: System::physical_core_count(),
        logical_cores: cpus.len(),
        frequency_mhz: first_cpu.map(|cpu| cpu.frequency()).unwrap_or(0),
    }
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn cpu_info() -> String {
    "Intel Core i9".into()
}

#[tauri::command]
fn my_custom_command() -> String {
    "Hello from Rust!".into()
}

#[tauri::command]
async fn pick_git_repository(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let selected = app
        .dialog()
        .file()
        .set_title("选择 Git 仓库")
        .blocking_pick_folder();

    let Some(selected) = selected else {
        return Ok(None);
    };

    let path = selected
        .into_path()
        .map_err(|_| "无法读取所选目录路径".to_string())?;

    validate_git_repository(&path)?;

    let root = run_git(&path, &["rev-parse", "--show-toplevel"])?;
    Ok(Some(root.trim().to_string()))
}

#[tauri::command]
async fn get_git_log(
    repo_path: String,
    skip: Option<usize>,
    limit: Option<usize>,
    branch_filter: Option<String>,
    author_filter: Option<String>,
    message_filter: Option<String>,
    hash_filter: Option<String>,
) -> Result<GitLogResult, String> {
    let path = Path::new(&repo_path);
    validate_git_repository(path)?;

    let repository_path = run_git(path, &["rev-parse", "--show-toplevel"])?
        .trim()
        .to_string();

    let current_branch = run_git(path, &["branch", "--show-current"])?;
    let current_branch = if current_branch.trim().is_empty() {
        "DETACHED HEAD".to_string()
    } else {
        current_branch.trim().to_string()
    };

    let branch_filter = normalize_branch_filter(path, branch_filter.as_deref())?;
    let author_filter = non_empty(author_filter.as_deref());
    let message_filter = non_empty(message_filter.as_deref());
    let hash_filter = non_empty(hash_filter.as_deref());
    let skip = skip.unwrap_or(0);
    let limit = limit.unwrap_or(100).clamp(1, 500);
    let format_arg =
        "--pretty=format:%H%x1f%h%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%s%x1f%D%x1e";

    let commits = if let Some(hash_filter) = hash_filter {
        if skip > 0 {
            Vec::new()
        } else {
            let resolved_hash = resolve_commit_hash(path, hash_filter)?;

            if let Some(branch_ref) = branch_filter.as_deref() {
                if !is_ancestor(path, &resolved_hash, branch_ref)? {
                    return Ok(GitLogResult {
                        repository_path,
                        current_branch,
                        commits: Vec::new(),
                    });
                }
            }

            let output = run_git(
                path,
                &[
                    "show",
                    "-s",
                    "--decorate=full",
                    format_arg,
                    &resolved_hash,
                ],
            )?;

            parse_commits(&output, &current_branch)
                .into_iter()
                .filter(|commit| matches_commit_filters(commit, author_filter, message_filter))
                .take(limit)
                .collect()
        }
    } else {
        let skip_arg = format!("--skip={skip}");
        let limit_arg = format!("-n{limit}");
        let mut args = vec![
            "log".to_string(),
            "--topo-order".to_string(),
            "--decorate=full".to_string(),
            skip_arg,
            limit_arg,
            format_arg.to_string(),
        ];

        if author_filter.is_some() || message_filter.is_some() {
            args.push("--regexp-ignore-case".to_string());
        }
        if let Some(author) = author_filter {
            args.push(format!("--author={author}"));
        }
        if let Some(message) = message_filter {
            args.push(format!("--grep={message}"));
        }

        if let Some(branch_ref) = branch_filter {
            args.push(branch_ref);
        } else {
            args.push("--all".to_string());
        }

        let refs: Vec<&str> = args.iter().map(String::as_str).collect();
        let output = run_git(path, &refs)?;
        parse_commits(&output, &current_branch)
    };

    Ok(GitLogResult {
        repository_path,
        current_branch,
        commits,
    })
}

fn parse_commits(output: &str, current_branch: &str) -> Vec<GitCommit> {
    output
        .split('\x1e')
        .filter_map(|record| {
            let record = record.trim();
            if record.is_empty() {
                return None;
            }

            let fields: Vec<&str> = record.split('\x1f').collect();
            if fields.len() != 8 {
                return None;
            }

            Some(GitCommit {
                hash: fields[0].to_string(),
                short_hash: fields[1].to_string(),
                parents: fields[2]
                    .split_whitespace()
                    .map(ToOwned::to_owned)
                    .collect(),
                author_name: fields[3].to_string(),
                author_email: fields[4].to_string(),
                date: fields[5].to_string(),
                message: fields[6].to_string(),
                refs: parse_git_refs(fields[7], current_branch),
            })
        })
        .collect()
}

fn matches_commit_filters(
    commit: &GitCommit,
    author_filter: Option<&str>,
    message_filter: Option<&str>,
) -> bool {
    let author_matches = author_filter.map_or(true, |author| {
        let needle = author.to_lowercase();
        commit.author_name.to_lowercase().contains(&needle)
            || commit.author_email.to_lowercase().contains(&needle)
    });

    let message_matches = message_filter.map_or(true, |message| {
        commit
            .message
            .to_lowercase()
            .contains(&message.to_lowercase())
    });

    author_matches && message_matches
}

fn non_empty(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|value| !value.is_empty())
}

fn normalize_branch_filter(path: &Path, value: Option<&str>) -> Result<Option<String>, String> {
    let Some(value) = non_empty(value) else {
        return Ok(None);
    };

    if !(value.starts_with("refs/heads/") || value.starts_with("refs/remotes/")) {
        return Err("无效的 branch filter".to_string());
    }

    let revision = format!("{value}^{{commit}}");
    run_git(path, &["rev-parse", "--verify", &revision])?;
    Ok(Some(value.to_string()))
}

fn resolve_commit_hash(path: &Path, value: &str) -> Result<String, String> {
    let value = value.trim();
    if !(4..=64).contains(&value.len()) || !value.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("Commit hash 必须是至少 4 位的十六进制 hash".to_string());
    }

    let revision = format!("{value}^{{commit}}");
    Ok(run_git(path, &["rev-parse", "--verify", &revision])?
        .trim()
        .to_string())
}

fn is_ancestor(path: &Path, commit: &str, branch_ref: &str) -> Result<bool, String> {
    let output = command_output(path, &["merge-base", "--is-ancestor", commit, branch_ref])?;
    match output.status.code() {
        Some(0) => Ok(true),
        Some(1) => Ok(false),
        _ => Err(command_error(&output)),
    }
}

fn parse_git_refs(value: &str, current_branch: &str) -> Vec<GitRefInfo> {
    let mut refs = Vec::new();

    for raw in value.split(',').map(str::trim).filter(|value| !value.is_empty()) {
        if let Some(target) = raw.strip_prefix("HEAD -> ") {
            let name = target.strip_prefix("refs/heads/").unwrap_or(target).to_string();
            refs.push(GitRefInfo {
                current: true,
                kind: "branch".to_string(),
                name,
            });
            continue;
        }

        if raw == "HEAD" {
            refs.push(GitRefInfo {
                name: "HEAD".to_string(),
                kind: "head".to_string(),
                current: true,
            });
            continue;
        }

        if let Some(name) = raw.strip_prefix("tag: refs/tags/") {
            refs.push(GitRefInfo {
                name: name.to_string(),
                kind: "tag".to_string(),
                current: false,
            });
            continue;
        }

        if let Some(name) = raw.strip_prefix("refs/heads/") {
            refs.push(GitRefInfo {
                name: name.to_string(),
                kind: "branch".to_string(),
                current: name == current_branch,
            });
            continue;
        }

        if let Some(name) = raw.strip_prefix("refs/remotes/") {
            refs.push(GitRefInfo {
                name: name.to_string(),
                kind: "remote".to_string(),
                current: false,
            });
            continue;
        }

        refs.push(GitRefInfo {
            name: raw.to_string(),
            kind: "ref".to_string(),
            current: false,
        });
    }

    refs
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
        .map_err(|error| {
            format!(
                "无法执行 Git。请确认系统已安装 git 并已加入 PATH：{error}"
            )
        })
}

fn command_error(output: &Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stderr.is_empty() {
        format!("Git 命令执行失败，退出码：{:?}", output.status.code())
    } else {
        stderr
    }
}

fn run_git(path: &Path, args: &[&str]) -> Result<String, String> {
    let output = command_output(path, args)?;

    if !output.status.success() {
        return Err(command_error(&output));
    }

    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            cpu_info,
            get_cpu_info,
            my_custom_command,
            pick_git_repository,
            get_git_log,
            git_detail::get_commit_files,
            git_detail::get_commit_file_diff,
            git_info::get_git_repository_info,
            working_tree::get_working_tree,
            working_tree::get_working_file_diff,
            working_tree::stage_working_file,
            working_tree::unstage_working_file,
            working_tree::discard_working_file,
            working_tree::commit_staged_changes,
            branches::get_git_branches,
            branches::checkout_git_branch,
            branches::checkout_remote_git_branch,
            branches::create_git_branch,
            branches::delete_git_branch
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
