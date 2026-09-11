use serde::Serialize;
use std::path::Path;
use std::process::Command;

const MAX_DIFF_CHARS: usize = 400_000;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitChangedFile {
    path: String,
    old_path: Option<String>,
    status: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFileDiff {
    path: String,
    content: String,
    truncated: bool,
}

#[tauri::command]
pub async fn get_commit_files(
    repo_path: String,
    commit_hash: String,
) -> Result<Vec<GitChangedFile>, String> {
    let path = Path::new(&repo_path);
    validate_git_repository(path)?;
    validate_commit_hash(&commit_hash)?;

    let output = if let Some(parent) = get_first_parent(path, &commit_hash)? {
        run_git(
            path,
            &[
                "diff",
                "--name-status",
                "-r",
                "-M",
                "-C",
                "-z",
                &parent,
                &commit_hash,
            ],
        )?
    } else {
        run_git(
            path,
            &[
                "diff-tree",
                "--root",
                "--no-commit-id",
                "--name-status",
                "-r",
                "-M",
                "-C",
                "-z",
                &commit_hash,
            ],
        )?
    };

    Ok(parse_changed_files(&output))
}

#[tauri::command]
pub async fn get_commit_file_diff(
    repo_path: String,
    commit_hash: String,
    file_path: String,
) -> Result<GitFileDiff, String> {
    let path = Path::new(&repo_path);
    validate_git_repository(path)?;
    validate_commit_hash(&commit_hash)?;

    if file_path.trim().is_empty() {
        return Err("文件路径不能为空".to_string());
    }

    let output = if let Some(parent) = get_first_parent(path, &commit_hash)? {
        run_git(
            path,
            &[
                "diff",
                "--no-ext-diff",
                "--find-renames",
                "--find-copies",
                "--unified=3",
                &parent,
                &commit_hash,
                "--",
                &file_path,
            ],
        )?
    } else {
        run_git(
            path,
            &[
                "show",
                "--format=",
                "--no-ext-diff",
                "--find-renames",
                "--find-copies",
                "--unified=3",
                &commit_hash,
                "--",
                &file_path,
            ],
        )?
    };

    let total_chars = output.chars().count();
    let truncated = total_chars > MAX_DIFF_CHARS;
    let content = if truncated {
        output.chars().take(MAX_DIFF_CHARS).collect()
    } else {
        output
    };

    Ok(GitFileDiff {
        path: file_path,
        content,
        truncated,
    })
}

fn parse_changed_files(output: &str) -> Vec<GitChangedFile> {
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

            files.push(GitChangedFile {
                path: new_path.to_string(),
                old_path: Some(old_path.to_string()),
                status: status_code.to_string(),
            });
        } else {
            let Some(file_path) = parts.next() else {
                break;
            };

            files.push(GitChangedFile {
                path: file_path.to_string(),
                old_path: None,
                status: status_code.to_string(),
            });
        }
    }

    files
}

fn get_first_parent(path: &Path, commit_hash: &str) -> Result<Option<String>, String> {
    let output = run_git(path, &["rev-list", "--parents", "-n", "1", commit_hash])?;
    let mut parts = output.split_whitespace();
    let _commit = parts.next();
    Ok(parts.next().map(ToOwned::to_owned))
}

fn validate_commit_hash(value: &str) -> Result<(), String> {
    if !(7..=64).contains(&value.len()) || !value.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("无效的 commit hash".to_string());
    }

    Ok(())
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
