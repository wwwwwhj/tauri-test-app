use serde::Serialize;
use std::path::Path;
use std::process::Command;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranch {
    name: String,
    full_name: String,
    hash: String,
    current: bool,
    remote: bool,
    upstream: Option<String>,
    date: String,
    subject: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranchesResult {
    current_branch: String,
    local: Vec<GitBranch>,
    remote: Vec<GitBranch>,
}

#[tauri::command]
pub async fn get_git_branches(repo_path: String) -> Result<GitBranchesResult, String> {
    let path = Path::new(&repo_path);
    validate_git_repository(path)?;

    let current = run_git(path, &["branch", "--show-current"])?;
    let current_branch = if current.trim().is_empty() {
        "DETACHED HEAD".to_string()
    } else {
        current.trim().to_string()
    };

    let format = "--format=%(refname)%00%(objectname)%00%(HEAD)%00%(upstream:short)%00%(committerdate:iso-strict)%00%(subject)%00%(symref)";
    let output = run_git(
        path,
        &["for-each-ref", "--sort=-committerdate", format, "refs/heads", "refs/remotes"],
    )?;

    let mut local = Vec::new();
    let mut remote = Vec::new();

    for line in output.lines().filter(|line| !line.trim().is_empty()) {
        let fields: Vec<&str> = line.split('\0').collect();
        if fields.len() < 7 {
            continue;
        }

        let full_name = fields[0];
        let symref = fields[6].trim();
        if !symref.is_empty() {
            continue;
        }

        let is_remote = full_name.starts_with("refs/remotes/");
        let name = full_name
            .strip_prefix("refs/heads/")
            .or_else(|| full_name.strip_prefix("refs/remotes/"))
            .unwrap_or(full_name)
            .to_string();

        let branch = GitBranch {
            name,
            full_name: full_name.to_string(),
            hash: fields[1].to_string(),
            current: fields[2].trim() == "*",
            remote: is_remote,
            upstream: match fields[3].trim() {
                "" => None,
                value => Some(value.to_string()),
            },
            date: fields[4].to_string(),
            subject: fields[5].to_string(),
        };

        if is_remote {
            remote.push(branch);
        } else {
            local.push(branch);
        }
    }

    Ok(GitBranchesResult {
        current_branch,
        local,
        remote,
    })
}

#[tauri::command]
pub async fn checkout_git_branch(repo_path: String, branch_name: String) -> Result<String, String> {
    let path = Path::new(&repo_path);
    validate_git_repository(path)?;
    validate_branch_name(path, &branch_name)?;
    run_git(path, &["switch", &branch_name])
}

#[tauri::command]
pub async fn checkout_remote_git_branch(
    repo_path: String,
    remote_branch: String,
) -> Result<String, String> {
    let path = Path::new(&repo_path);
    validate_git_repository(path)?;

    if remote_branch.trim().is_empty() || remote_branch.starts_with('-') {
        return Err("无效的远程分支名".to_string());
    }

    run_git(path, &["switch", "--track", &remote_branch])
}

#[tauri::command]
pub async fn create_git_branch(
    repo_path: String,
    branch_name: String,
    checkout: bool,
) -> Result<String, String> {
    let path = Path::new(&repo_path);
    validate_git_repository(path)?;
    validate_branch_name(path, &branch_name)?;

    if checkout {
        run_git(path, &["switch", "-c", &branch_name])
    } else {
        run_git(path, &["branch", &branch_name])
    }
}

#[tauri::command]
pub async fn delete_git_branch(
    repo_path: String,
    branch_name: String,
    force: bool,
) -> Result<String, String> {
    let path = Path::new(&repo_path);
    validate_git_repository(path)?;
    validate_branch_name(path, &branch_name)?;

    let flag = if force { "-D" } else { "-d" };
    run_git(path, &["branch", flag, &branch_name])
}

fn validate_branch_name(path: &Path, branch_name: &str) -> Result<(), String> {
    let branch_name = branch_name.trim();
    if branch_name.is_empty() || branch_name.starts_with('-') {
        return Err("无效的分支名".to_string());
    }

    run_git(path, &["check-ref-format", "--branch", branch_name])?;
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
        .map_err(|error| format!("无法执行 Git。请确认系统已安装 git 并已加入 PATH：{error}"))?;

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
