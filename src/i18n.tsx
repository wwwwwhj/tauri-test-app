import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Language = "zh-CN" | "en-US";

const STORAGE_KEY = "git-workbench.language.v1";

const zhCN = {
  "app.name": "Git Workbench",
  "common.refresh": "刷新",
  "common.refreshing": "刷新中…",
  "common.reading": "读取中…",
  "common.retry": "重试",
  "common.apply": "应用",
  "common.clear": "清除",
  "common.local": "本地",
  "common.remote": "远程",
  "common.noFiles": "无文件",
  "common.filtered": "已筛选",
  "common.entries": "{count} 项",
  "common.files": "{count} 个文件",
  "common.stagedCount": "{count} 个已暂存",
  "common.noCommitMessage": "（无提交说明）",

  "preferences.language": "语言",
  "preferences.switchToChinese": "切换到中文",
  "preferences.switchToEnglish": "切换到英文",
  "preferences.lightMode": "切换到浅色模式",
  "preferences.darkMode": "切换到深色模式",

  "repositories.title": "仓库",
  "repositories.add": "添加仓库",
  "repositories.addLocal": "添加本地 Git 仓库",
  "repositories.none": "暂无仓库",
  "repositories.remove": "从列表移除 {name}",
  "repositories.emptyTitle": "添加本地 Git 仓库",
  "repositories.emptyDescription": "可以保存多个仓库，并从左侧列表随时切换。",

  "nav.log": "日志",
  "nav.changes": "本地更改",
  "nav.branches": "分支",
  "nav.settings": "仓库设置",

  "log.title": "提交记录",
  "log.count": "{count} 条",
  "log.lanes": "{count} 条活动图轨",
  "log.loading": "正在读取 Git…",
  "log.message": "提交信息",
  "log.messagePlaceholder": "搜索提交信息",
  "log.branch": "分支",
  "log.allBranches": "所有分支",
  "log.author": "作者",
  "log.authorPlaceholder": "姓名或邮箱",
  "log.hash": "Commit Hash",
  "log.hashPlaceholder": "例如 a1b2c3d",
  "log.noFilteredResults": "没有符合当前筛选条件的提交。",
  "log.noCommits": "当前仓库没有可显示的提交记录。",
  "log.mergeParents": "合并 · {count} 个父提交",

  "commit.selectTitle": "选择一个提交",
  "commit.selectDescription": "点击左侧提交，查看修改文件和单文件 Diff。",
  "commit.changedFiles": "修改文件",
  "commit.noFiles": "这个提交没有可显示的文件差异。",
  "commit.selectFile": "选择文件后显示 Diff。",
  "commit.loadingDiff": "正在读取文件差异…",
  "commit.largeDiff": "Diff 过大，只显示前 400,000 个字符。",
  "commit.noTextDiff": "没有文本 Diff，文件可能是二进制文件。",
  "commit.noDiff": "暂无 Diff。",

  "changes.title": "本地更改",
  "changes.stage": "暂存",
  "changes.unstage": "取消暂存",
  "changes.discard": "丢弃",
  "changes.staged": "已暂存更改",
  "changes.unstaged": "未暂存更改",
  "changes.untracked": "未跟踪文件",
  "changes.deleteUntrackedConfirm": "永久删除未跟踪文件？\n\n{path}",
  "changes.discardConfirm": "永久丢弃本地更改？\n\n{path}",
  "changes.commitCreated": "提交已创建。",
  "changes.commitMessage": "提交说明",
  "changes.commit": "提交",
  "changes.diffTitle": "工作区 Diff",
  "changes.clean": "工作区是干净的。",
  "changes.loadingDiff": "正在加载 Diff…",
  "changes.noTextDiff": "没有可显示的文本 Diff。",
  "changes.noDiff": "暂无 Diff。",
  "changes.largeDiff": "Diff 过大，只显示前 400,000 个字符。",

  "branches.title": "分支",
  "branches.current": "当前",
  "branches.checkout": "切换",
  "branches.delete": "删除",
  "branches.filter": "筛选分支",
  "branches.newName": "新分支名称",
  "branches.createCheckout": "创建并切换",
  "branches.noLocal": "没有本地分支。",
  "branches.noRemote": "没有远程分支。",
  "branches.noMessage": "（无提交说明）",
  "branches.checkedOut": "已切换到 {name}",
  "branches.created": "已创建 {name}",
  "branches.deleted": "已删除 {name}",
  "branches.deleteConfirm": "删除本地分支？\n\n{name}",
  "branches.unmergedHint": "未合并分支不会被强制删除。",

  "settings.title": "仓库设置",
  "settings.readOnly": "只读",
  "settings.unable": "无法读取仓库设置。",
  "settings.cacheTitle": "仓库设置按仓库缓存",
  "settings.notCached": "尚未缓存",
  "settings.updated": "更新于 {time}",
  "settings.autoRefresh": "自动刷新 · 10 分钟",
  "settings.refreshNow": "立即刷新",
  "settings.refreshFailed": "刷新失败，当前显示上一次缓存快照。",
  "settings.repository": "仓库",
  "settings.repositoryRoot": "仓库根目录",
  "settings.gitDirectory": "Git 目录",
  "settings.currentBranch": "当前分支",
  "settings.noCommits": "暂无提交",
  "settings.upstream": "上游分支",
  "settings.notConfigured": "未配置",
  "settings.syncStatus": "同步状态",
  "settings.noUpstream": "无上游分支",
  "settings.upToDate": "已同步",
  "settings.workingClean": "工作区干净",
  "settings.workingDirty": "工作区有更改",
  "settings.staged": "已暂存 {count}",
  "settings.unstaged": "未暂存 {count}",
  "settings.untracked": "未跟踪 {count}",
  "settings.conflicts": "冲突 {count}",
  "settings.remotes": "远程仓库",
  "settings.noRemotes": "未配置远程仓库。",
  "settings.fetch": "拉取",
  "settings.push": "推送",
  "settings.gitConfig": "Git 配置",
  "settings.safeReadOnly": "仅安全配置项 · 只读",
  "settings.effective": "最终生效",
  "settings.effectiveDescription": "最终生效值。Local、Global、System、include 等作用域合并后 Git 实际读取到的配置。",
  "settings.local": "本地",
  "settings.localDescription": "仅当前仓库的配置层，通常来自 .git/config，可覆盖 Global 配置。",
  "settings.global": "全局",
  "settings.globalDescription": "当前操作系统用户的 Git 配置层，通常来自 ~/.gitconfig 或用户级 include 文件。",
  "settings.configNote": "当前页面只读取配置，不执行 git config 写入。HTTP authorization headers、原始凭据等敏感配置不会被读取。当前快照按仓库缓存，过期后才后台刷新，也可使用“立即刷新”强制读取。",
  "settings.noConfig": "没有匹配的{scope}配置项。",
  "settings.key": "键",
  "settings.value": "值",
  "settings.sourceScope": "来源作用域",
  "settings.origin": "来源文件",
  "settings.scopeSystem": "系统",
  "settings.scopeWorktree": "工作树",
  "settings.scopeCommand": "命令行",
  "settings.scopeOther": "其他",
} as const;

export type TranslationKey = keyof typeof zhCN;

const enUS: Record<TranslationKey, string> = {
  "app.name": "Git Workbench",
  "common.refresh": "Refresh",
  "common.refreshing": "Refreshing…",
  "common.reading": "Reading…",
  "common.retry": "Retry",
  "common.apply": "Apply",
  "common.clear": "Clear",
  "common.local": "Local",
  "common.remote": "Remote",
  "common.noFiles": "No files",
  "common.filtered": "FILTERED",
  "common.entries": "{count} entries",
  "common.files": "{count} files",
  "common.stagedCount": "{count} staged",
  "common.noCommitMessage": "(no commit message)",

  "preferences.language": "Language",
  "preferences.switchToChinese": "Switch to Chinese",
  "preferences.switchToEnglish": "Switch to English",
  "preferences.lightMode": "Switch to light mode",
  "preferences.darkMode": "Switch to dark mode",

  "repositories.title": "Repositories",
  "repositories.add": "Add Repository",
  "repositories.addLocal": "Add local Git repository",
  "repositories.none": "No repositories",
  "repositories.remove": "Remove {name} from list",
  "repositories.emptyTitle": "Add a local Git repository",
  "repositories.emptyDescription": "Keep multiple repositories and switch between them from the sidebar.",

  "nav.log": "Log",
  "nav.changes": "Local Changes",
  "nav.branches": "Branches",
  "nav.settings": "Repository Settings",

  "log.title": "Commit Log",
  "log.count": "{count} commits",
  "log.lanes": "{count} graph lanes",
  "log.loading": "Reading Git…",
  "log.message": "Message",
  "log.messagePlaceholder": "Search commit message",
  "log.branch": "Branch",
  "log.allBranches": "All branches",
  "log.author": "Author",
  "log.authorPlaceholder": "Name or email",
  "log.hash": "Commit Hash",
  "log.hashPlaceholder": "e.g. a1b2c3d",
  "log.noFilteredResults": "No commits match the current filters.",
  "log.noCommits": "There are no commits to display in this repository.",
  "log.mergeParents": "merge · {count} parents",

  "commit.selectTitle": "Select a commit",
  "commit.selectDescription": "Select a commit on the left to inspect changed files and the file diff.",
  "commit.changedFiles": "Changed Files",
  "commit.noFiles": "This commit has no file changes to display.",
  "commit.selectFile": "Select a file to display its diff.",
  "commit.loadingDiff": "Loading file diff…",
  "commit.largeDiff": "Diff is large. Showing the first 400,000 characters.",
  "commit.noTextDiff": "No text diff is available. The file may be binary.",
  "commit.noDiff": "No diff.",

  "changes.title": "Local Changes",
  "changes.stage": "Stage",
  "changes.unstage": "Unstage",
  "changes.discard": "Discard",
  "changes.staged": "Staged Changes",
  "changes.unstaged": "Unstaged Changes",
  "changes.untracked": "Untracked Files",
  "changes.deleteUntrackedConfirm": "Delete untracked file permanently?\n\n{path}",
  "changes.discardConfirm": "Discard local changes permanently?\n\n{path}",
  "changes.commitCreated": "Commit created.",
  "changes.commitMessage": "Commit message",
  "changes.commit": "Commit",
  "changes.diffTitle": "Working Tree Diff",
  "changes.clean": "Working tree is clean.",
  "changes.loadingDiff": "Loading diff…",
  "changes.noTextDiff": "No text diff available.",
  "changes.noDiff": "No diff.",
  "changes.largeDiff": "Diff is large. Showing the first 400,000 characters.",

  "branches.title": "Branches",
  "branches.current": "CURRENT",
  "branches.checkout": "Checkout",
  "branches.delete": "Delete",
  "branches.filter": "Filter branches",
  "branches.newName": "New branch name",
  "branches.createCheckout": "Create & Checkout",
  "branches.noLocal": "No local branches.",
  "branches.noRemote": "No remote branches.",
  "branches.noMessage": "(no commit message)",
  "branches.checkedOut": "Checked out {name}",
  "branches.created": "Created {name}",
  "branches.deleted": "Deleted {name}",
  "branches.deleteConfirm": "Delete local branch?\n\n{name}",
  "branches.unmergedHint": "Unmerged branches are not force-deleted.",

  "settings.title": "Repository Settings",
  "settings.readOnly": "READ ONLY",
  "settings.unable": "Unable to read repository settings.",
  "settings.cacheTitle": "Repository settings are cached per repository",
  "settings.notCached": "Not cached",
  "settings.updated": "Updated {time}",
  "settings.autoRefresh": "Auto refresh · 10 min",
  "settings.refreshNow": "Refresh now",
  "settings.refreshFailed": "Refresh failed. Showing the last cached snapshot.",
  "settings.repository": "Repository",
  "settings.repositoryRoot": "Repository root",
  "settings.gitDirectory": "Git directory",
  "settings.currentBranch": "Current branch",
  "settings.noCommits": "No commits yet",
  "settings.upstream": "Upstream",
  "settings.notConfigured": "Not configured",
  "settings.syncStatus": "Sync status",
  "settings.noUpstream": "No upstream",
  "settings.upToDate": "Up to date",
  "settings.workingClean": "Working tree clean",
  "settings.workingDirty": "Working tree has changes",
  "settings.staged": "Staged {count}",
  "settings.unstaged": "Unstaged {count}",
  "settings.untracked": "Untracked {count}",
  "settings.conflicts": "Conflicts {count}",
  "settings.remotes": "Remotes",
  "settings.noRemotes": "No remotes configured.",
  "settings.fetch": "Fetch",
  "settings.push": "Push",
  "settings.gitConfig": "Git Configuration",
  "settings.safeReadOnly": "Safe keys only · read only",
  "settings.effective": "Effective",
  "settings.effectiveDescription": "The final value Git resolves after Local, Global, System, includes and other scopes are merged.",
  "settings.local": "Local",
  "settings.localDescription": "Configuration for this repository only, usually from .git/config. It can override Global configuration.",
  "settings.global": "Global",
  "settings.globalDescription": "Configuration for the current operating-system user, usually from ~/.gitconfig or user-level include files.",
  "settings.configNote": "This page is read-only and never writes git config. Sensitive values such as HTTP authorization headers and raw credentials are not read. Snapshots are cached per repository and refresh in the background only after expiry; use Refresh now to force a read.",
  "settings.noConfig": "No matching {scope} configuration entries.",
  "settings.key": "Key",
  "settings.value": "Value",
  "settings.sourceScope": "Source scope",
  "settings.origin": "Origin",
  "settings.scopeSystem": "System",
  "settings.scopeWorktree": "Worktree",
  "settings.scopeCommand": "Command",
  "settings.scopeOther": "Other",
};

const dictionaries: Record<Language, Record<TranslationKey, string>> = {
  "zh-CN": zhCN,
  "en-US": enUS,
};

interface I18nContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  formatDate: (value: string | number | Date) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function readInitialLanguage(): Language {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "en-US" ? "en-US" : "zh-CN";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(readInitialLanguage);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<I18nContextValue>(() => {
    const t = (key: TranslationKey, vars?: Record<string, string | number>) => {
      let text = dictionaries[language][key] ?? zhCN[key];
      if (vars) {
        for (const [name, value] of Object.entries(vars)) {
          text = text.replaceAll(`{${name}}`, String(value));
        }
      }
      return text;
    };

    return {
      language,
      setLanguage: setLanguageState,
      toggleLanguage: () => setLanguageState((current) => current === "zh-CN" ? "en-US" : "zh-CN"),
      t,
      formatDate: (value) => {
        const date = value instanceof Date ? value : new Date(value);
        return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString(language);
      },
    };
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}
