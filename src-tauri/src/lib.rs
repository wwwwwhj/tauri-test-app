mod branches;
mod git_detail;
mod working_tree;

use serde::Serialize;
use std::path::Path;
use std::process::Command;
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

    let skip = skip.unwrap_or(0);
    let limit = limit.unwrap_or(100).clamp(1, 500);
    let skip_arg = format!("--skip={skip}");
    let limit_arg = format!("-n{limit}");
    let format_arg =
        "--pretty=format:%H%x1f%h%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%s%x1f%D%x1e";

    let output = run_git(
        path,
        &[
            "log",
            "--all",
            "--topo-order",
            "--decorate=full",
            &skip_arg,
            &limit_arg,
            format_arg,
        ],
    )?;

    let commits = output
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
                refs: parse_git_refs(fields[7], &current_branch),
            })
        })
        .collect();

    Ok(GitLogResult {
        repository_path,
        current_branch,
        commits,
    })
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

fn run_git(path: &Path, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
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
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("Git 命令执行失败，退出码：{:?}", output.status.code())
        } else {
            stderr
        });
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
