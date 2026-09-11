use serde::Serialize;
use std::path::Path;
use std::process::{Command, Output};

const MAX_DIFF_CHARS: usize = 400_000;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkingTreeFile {
    path: String,
    old_path: Option<String>,
    status: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkingTreeStatus {
    staged: Vec<WorkingTreeFile>,
    unstaged: Vec<WorkingTreeFile>,
    untracked: Vec<WorkingTreeFile>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkingFileDiff {
    path: String,
    content: String,
    truncated: bool,
}

#[tauri::command]
pub async fn get_working_tree(repo_path: String) -> Result<WorkingTreeStatus, String> {
    let path = Path::new(&repo_path);
    validate_git_repository(path)?;

    let staged = run_git(
        path,
        &["diff", "--cached", "--name-status", "-z", "-M", "-C"],
    )?;
    let unstaged = run_git(path, &["diff", "--name-status", "-z", "-M", "-C"])?;
    let untracked = run_git(path, &["ls-files", "--others", "--exclude-standard", "-z"])?;

    Ok(WorkingTreeStatus {
        staged: parse_name_status_z(&staged),
        unstaged: parse_name_status_z(&unstaged),
        untracked: untracked
            .split('\0')
            .filter(|value| !value.is_empty())
            .map(|file_path| WorkingTreeFile {
                path: file_path.to_string(),
                old_path: None,
                status: "?".to_string(),
            })
            .collect(),
    })
}

#[tauri::command]
pub async fn get_working_file_diff(
    repo_path: String,
    file_path: String,
    old_path: Option<String>,
    area: String,
) -> Result<WorkingFileDiff, String> {
    let path = Path::new(&repo_path);
    validate_git_repository(path)?;
    validate_file_path(&file_path)?;

    let mut args: Vec<String> = match area.as_str() {
        "staged" => vec![
            "diff".into(),
            "--cached".into(),
            "--no-ext-diff".into(),
            "--find-renames".into(),
            "--find-copies".into(),
            "--unified=3".into(),
            "--".into(),
        ],
        "unstaged" => vec![
            "diff".into(),
            "--no-ext-diff".into(),
            "--find-renames".into(),
            "--find-copies".into(),
            "--unified=3".into(),
            "--".into(),
        ],
        "untracked" => {
            let null_device = if cfg!(target_os = "windows") {
                "NUL"
            } else {
                "/dev/null"
            };
            let output = run_git_allow_diff_exit(
                path,
                &[
                    "diff",
                    "--no-index",
                    "--no-ext-diff",
                    "--unified=3",
                    "--",
                    null_device,
                    &file_path,
                ],
            )?;
            return Ok(truncate_diff(file_path, output));
        }
        _ => return Err("未知的工作区类型".to_string()),
    };

    if let Some(old_path) = old_path.as_deref() {
        validate_file_path(old_path)?;
        if old_path != file_path {
            args.push(old_path.to_string());
        }
    }
    args.push(file_path.clone());

    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let output = run_git(path, &refs)?;
    Ok(truncate_diff(file_path, output))
}

#[tauri::command]
pub async fn stage_working_file(
    repo_path: String,
    file_path: String,
    old_path: Option<String>,
) -> Result<(), String> {
    let path = Path::new(&repo_path);
    validate_git_repository(path)?;
    let paths = validated_paths(&file_path, old_path.as_deref())?;

    let mut args = vec!["add", "-A", "--"];
    args.extend(paths.iter().map(String::as_str));
    run_git(path, &args)?;
    Ok(())
}

#[tauri::command]
pub async fn unstage_working_file(
    repo_path: String,
    file_path: String,
    old_path: Option<String>,
) -> Result<(), String> {
    let path = Path::new(&repo_path);
    validate_git_repository(path)?;
    let paths = validated_paths(&file_path, old_path.as_deref())?;

    if has_head(path) {
        let mut args = vec!["restore", "--staged", "--"];
        args.extend(paths.iter().map(String::as_str));
        run_git(path, &args)?;
    } else {
        let mut args = vec!["rm", "--cached", "-r", "--ignore-unmatch", "--"];
        args.extend(paths.iter().map(String::as_str));
        run_git(path, &args)?;
    }

    Ok(())
}

#[tauri::command]
pub async fn discard_working_file(
    repo_path: String,
    file_path: String,
    old_path: Option<String>,
    untracked: bool,
) -> Result<(), String> {
    let path = Path::new(&repo_path);
    validate_git_repository(path)?;
    let paths = validated_paths(&file_path, old_path.as_deref())?;

    if untracked {
        let mut args = vec!["clean", "-fd", "--"];
        args.extend(paths.iter().map(String::as_str));
        run_git(path, &args)?;
    } else {
        let mut args = vec!["restore", "--worktree", "--"];
        args.extend(paths.iter().map(String::as_str));
        run_git(path, &args)?;
    }

    Ok(())
}

#[tauri::command]
pub async fn commit_staged_changes(
    repo_path: String,
    message: String,
) -> Result<String, String> {
    let path = Path::new(&repo_path);
    validate_git_repository(path)?;

    let message = message.trim();
    if message.is_empty() {
        return Err("Commit message 不能为空".to_string());
    }

    run_git(path, &["commit", "-m", message])
}

fn truncate_diff(path: String, output: String) -> WorkingFileDiff {
    let total_chars = output.chars().count();
    let truncated = total_chars > MAX_DIFF_CHARS;
    let content = if truncated {
        output.chars().take(MAX_DIFF_CHARS).collect()
    } else {
        output
    };

    WorkingFileDiff {
        path,
        content,
        truncated,
    }
}

fn parse_name_status_z(output: &str) -> Vec<WorkingTreeFile> {
    let mut parts = output.split('\0').filter(|value| !value.is_empty());
    let mut files = Vec::new();

    while let Some(status) = parts.next() {
        let status_code = status.chars().next().unwrap_or('?');

        if matches!(status_code, 'R' | 'C') {
            let Some(old_path) = parts.next() else {
                break;
            };
            let Some(new_path) = parts.next() else {
                break;
            };
            files.push(WorkingTreeFile {
                path: new_path.to_string(),
                old_path: Some(old_path.to_string()),
                status: status_code.to_string(),
            });
        } else {
            let Some(file_path) = parts.next() else {
                break;
            };
            files.push(WorkingTreeFile {
                path: file_path.to_string(),
                old_path: None,
                status: status_code.to_string(),
            });
        }
    }

    files
}

fn validated_paths(file_path: &str, old_path: Option<&str>) -> Result<Vec<String>, String> {
    validate_file_path(file_path)?;
    let mut paths = Vec::new();

    if let Some(old_path) = old_path {
        validate_file_path(old_path)?;
        if old_path != file_path {
            paths.push(old_path.to_string());
        }
    }

    paths.push(file_path.to_string());
    Ok(paths)
}

fn validate_file_path(value: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        return Err("文件路径不能为空".to_string());
    }
    if value.contains('\0') {
        return Err("文件路径包含非法字符".to_string());
    }
    Ok(())
}

fn has_head(path: &Path) -> bool {
    command_output(path, &["rev-parse", "--verify", "HEAD"])
        .map(|output| output.status.success())
        .unwrap_or(false)
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
    output_to_string(output, false)
}

fn run_git_allow_diff_exit(path: &Path, args: &[&str]) -> Result<String, String> {
    let output = command_output(path, args)?;
    output_to_string(output, true)
}

fn output_to_string(output: Output, allow_diff_exit: bool) -> Result<String, String> {
    let ok = output.status.success() || (allow_diff_exit && output.status.code() == Some(1));
    if !ok {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("Git 命令执行失败，退出码：{:?}", output.status.code())
        } else {
            stderr
        });
    }

    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}
