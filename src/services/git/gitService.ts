import type {
  GitRepositoryInfo,
  GitStatusSummary,
  GitCommitSummary,
  GitCommitDetails,
  GitFileDiff,
  GitFileStatus,
} from '../../types/git'

export interface ParsedDiffLine {
  type: 'addition' | 'deletion' | 'hunk' | 'context' | 'meta'
  text: string
  oldLineNumber?: number
  newLineNumber?: number
}

/**
 * Invokes preload API to fetch repository status and info safely.
 */
export async function fetchRepositoryInfo(dirPath: string): Promise<GitRepositoryInfo> {
  if (typeof window === 'undefined' || !window.electronAPI?.gitGetRepositoryInfo) {
    return {
      isGitAvailable: false,
      isRepository: false,
      error: 'Git integration requires Electron runtime environment.',
    }
  }

  try {
    const res = await window.electronAPI.gitGetRepositoryInfo(dirPath)
    return res as GitRepositoryInfo
  } catch (err) {
    return {
      isGitAvailable: false,
      isRepository: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Invokes preload API to fetch working tree changes.
 */
export async function fetchGitStatus(
  dirPath: string,
  localizationOnly?: boolean
): Promise<GitStatusSummary> {
  if (typeof window === 'undefined' || !window.electronAPI?.gitGetStatus) {
    return {
      isRepository: false,
      rootPath: '',
      branch: '',
      isDetachedHead: false,
      files: [],
      totalChanges: 0,
      totalModified: 0,
      totalAdded: 0,
      totalDeleted: 0,
      totalRenamed: 0,
      totalUntracked: 0,
      totalStaged: 0,
      totalUnstaged: 0,
      totalPartiallyStaged: 0,
      localizationFilesCount: 0,
      allFilesCount: 0,
      error: 'Git integration requires Electron runtime environment.',
    }
  }

  try {
    const res = await window.electronAPI.gitGetStatus(dirPath, localizationOnly)
    return res as GitStatusSummary
  } catch (err) {
    return {
      isRepository: false,
      rootPath: '',
      branch: '',
      isDetachedHead: false,
      files: [],
      totalChanges: 0,
      totalModified: 0,
      totalAdded: 0,
      totalDeleted: 0,
      totalRenamed: 0,
      totalUntracked: 0,
      totalStaged: 0,
      totalUnstaged: 0,
      totalPartiallyStaged: 0,
      localizationFilesCount: 0,
      allFilesCount: 0,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Invokes preload API to fetch commit history.
 */
export async function fetchGitLog(
  dirPath: string,
  maxCount = 50,
  localizationOnly = false
): Promise<GitCommitSummary[]> {
  if (typeof window === 'undefined' || !window.electronAPI?.gitGetLog) {
    return []
  }

  try {
    const res = await window.electronAPI.gitGetLog(dirPath, maxCount, localizationOnly)
    return (res as GitCommitSummary[]) || []
  } catch {
    return []
  }
}

/**
 * Invokes preload API to fetch details of a single commit.
 */
export async function fetchCommitDetails(
  dirPath: string,
  hash: string
): Promise<GitCommitDetails | null> {
  if (typeof window === 'undefined' || !window.electronAPI?.gitGetCommitDetails) {
    return null
  }

  try {
    const res = await window.electronAPI.gitGetCommitDetails(dirPath, hash)
    return res as GitCommitDetails
  } catch {
    return null
  }
}

/**
 * Invokes preload API to fetch diff for a specific file.
 */
export async function fetchFileDiff(
  dirPath: string,
  filePath: string,
  hash?: string,
  staged?: boolean
): Promise<GitFileDiff> {
  if (typeof window === 'undefined' || !window.electronAPI?.gitGetFileDiff) {
    return {
      filePath,
      diff: '',
      isBinary: false,
      additions: 0,
      deletions: 0,
      error: 'Git integration requires Electron runtime environment.',
    }
  }

  try {
    const res = await window.electronAPI.gitGetFileDiff(dirPath, filePath, hash, staged)
    return res as GitFileDiff
  } catch (err) {
    return {
      filePath,
      diff: '',
      isBinary: false,
      additions: 0,
      deletions: 0,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Formats a timestamp into a human-readable localized date string.
 */
export function formatGitCommitDate(timestamp: number, locale = 'en-US'): string {
  if (!timestamp || isNaN(timestamp)) return ''
  try {
    const date = new Date(timestamp)
    return date.toLocaleDateString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return new Date(timestamp).toISOString()
  }
}

/**
 * Parses raw git diff text into structured lines for UI rendering with line numbers and syntax highlighting classes.
 */
export function parseDiffContent(diffText: string): ParsedDiffLine[] {
  if (!diffText) return []

  const lines = diffText.split('\n')
  const result: ParsedDiffLine[] = []

  let oldLine = 0
  let newLine = 0

  for (const line of lines) {
    if (line.startsWith('@@')) {
      // Hunk header: @@ -oldStart,oldCount +newStart,newCount @@
      const hunkMatch = line.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/)
      if (hunkMatch) {
        oldLine = parseInt(hunkMatch[1], 10)
        newLine = parseInt(hunkMatch[2], 10)
      }
      result.push({
        type: 'hunk',
        text: line,
      })
    } else if (
      line.startsWith('diff --git') ||
      line.startsWith('index ') ||
      line.startsWith('--- ') ||
      line.startsWith('+++ ') ||
      line.startsWith('Binary files')
    ) {
      result.push({
        type: 'meta',
        text: line,
      })
    } else if (line.startsWith('+')) {
      result.push({
        type: 'addition',
        text: line,
        newLineNumber: newLine,
      })
      newLine++
    } else if (line.startsWith('-')) {
      result.push({
        type: 'deletion',
        text: line,
        oldLineNumber: oldLine,
      })
      oldLine++
    } else {
      result.push({
        type: 'context',
        text: line,
        oldLineNumber: oldLine > 0 ? oldLine : undefined,
        newLineNumber: newLine > 0 ? newLine : undefined,
      })
      if (oldLine > 0) oldLine++
      if (newLine > 0) newLine++
    }
  }

  return result
}

/**
 * Pure filter helpers for working files and commits.
 */
export function filterLocalizationFiles(files: GitFileStatus[]): GitFileStatus[] {
  return files.filter((f) => f.isLocalization)
}

export function filterLocalizationCommits(commits: GitCommitSummary[]): GitCommitSummary[] {
  return commits.filter((c) => c.isLocalizationCommit)
}
