import { execFile } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs/promises'
import { promisify } from 'node:util'
import { isLocalizationFile, extractLocaleFromFilename } from '../../src/services/localizationDetector'
import { getLanguageDisplayName } from '../../src/services/localizationCoverage'
import type {
  GitRepositoryInfo,
  GitStatusSummary,
  GitFileStatus,
  GitFileChangeType,
  GitStagingStatus,
  GitCommitSummary,
  GitCommitDetails,
  GitCommitFileChange,
  GitFileDiff,
  GitBranchInfo,
  GitBranchListResult,
  GitBranchSwitchResult,
  GitBranchCreateResult,
  GitCommitSelectedResult,
  GitRemoteInfo,
  GitSyncStatus,
  GitFetchResult,
  GitPullResult,
  GitPushResult,
  GitSyncErrorCode,
} from '../../src/types/git'

const execFileAsync = promisify(execFile)

/**
 * Executes a Git command safely with structured argument array.
 * Never constructs a shell command string.
 */
export async function runGit(
  cwd: string,
  args: string[]
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const defaultArgs = ['-c', 'core.quotepath=false', ...args]
    const { stdout, stderr } = await execFileAsync('git', defaultArgs, {
      cwd,
      env: {
        ...process.env,
        LC_ALL: 'C',
        LANG: 'C',
      },
      maxBuffer: 20 * 1024 * 1024,
    })
    return {
      stdout: stdout.toString(),
      stderr: stderr.toString(),
      exitCode: 0,
    }
  } catch (error: unknown) {
    const err = error as { code?: string | number; stdout?: string | Buffer; stderr?: string | Buffer }
    return {
      stdout: err.stdout?.toString() || '',
      stderr: err.stderr?.toString() || (error instanceof Error ? error.message : String(error)),
      exitCode: typeof err.code === 'number' ? err.code : 1,
    }
  }
}

/**
 * Checks if Git executable is available on the host system.
 */
export async function checkGitAvailable(): Promise<boolean> {
  try {
    const result = await runGit(process.cwd(), ['--version'])
    return result.exitCode === 0 && result.stdout.toLowerCase().includes('git version')
  } catch {
    return false
  }
}

/**
 * Determines whether a directory is inside a Git repository and retrieves basic repo info.
 */
export async function getRepositoryInfo(dirPath: string): Promise<GitRepositoryInfo> {
  const isAvailable = await checkGitAvailable()
  if (!isAvailable) {
    return {
      isGitAvailable: false,
      isRepository: false,
      error: 'Git is not installed or could not be executed on this system.',
    }
  }

  const rootRes = await runGit(dirPath, ['rev-parse', '--show-toplevel'])
  if (rootRes.exitCode !== 0) {
    return {
      isGitAvailable: true,
      isRepository: false,
    }
  }

  const rootPath = path.normalize(rootRes.stdout.trim())

  // Get current branch / HEAD
  const branchRes = await runGit(dirPath, ['rev-parse', '--abbrev-ref', 'HEAD'])
  let currentBranch = branchRes.stdout.trim() || 'HEAD'
  let isDetachedHead = false

  if (currentBranch === 'HEAD') {
    isDetachedHead = true
    const shortHashRes = await runGit(dirPath, ['rev-parse', '--short', 'HEAD'])
    const shortHash = shortHashRes.stdout.trim()
    currentBranch = shortHash ? `HEAD (${shortHash})` : 'Detached HEAD'
  }

  return {
    isGitAvailable: true,
    isRepository: true,
    rootPath,
    currentBranch,
    isDetachedHead,
  }
}

/**
 * Parses numstat diff output lines into a map of path -> { additions, deletions }.
 */
export function parseNumstatOutput(output: string): Map<string, { additions: number; deletions: number }> {
  const map = new Map<string, { additions: number; deletions: number }>()
  if (!output) return map

  const lines = output.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const parts = trimmed.split(/\t+/)
    if (parts.length >= 3) {
      const adds = parts[0] === '-' ? 0 : parseInt(parts[0], 10) || 0
      const dels = parts[1] === '-' ? 0 : parseInt(parts[1], 10) || 0
      let filePath = parts.slice(2).join('\t').trim()

      // In renames, format can be "old => new" or "prefix/{old => new}/suffix"
      if (filePath.includes(' => ')) {
        const renameMatch = filePath.match(/(?:(.*)\{)?(.+?) => (.+?)(?:\}(.*))?$/)
        if (renameMatch) {
          const pre = renameMatch[1] || ''
          const target = renameMatch[3]
          const post = renameMatch[4] || ''
          filePath = path.normalize(`${pre}${target}${post}`)
        } else {
          filePath = filePath.split(' => ')[1] || filePath
        }
      }

      filePath = path.normalize(filePath).replace(/\\/g, '/')
      const existing = map.get(filePath) || { additions: 0, deletions: 0 }
      map.set(filePath, {
        additions: existing.additions + adds,
        deletions: existing.deletions + dels,
      })
    }
  }

  return map
}

/**
 * Pure parser for `git status --porcelain=v1 -uall` output.
 */
export function parsePorcelainStatus(
  porcelainOutput: string,
  numstatMap: Map<string, { additions: number; deletions: number }> = new Map()
): GitFileStatus[] {
  const result: GitFileStatus[] = []
  if (!porcelainOutput) return result

  const lines = porcelainOutput.split('\n')

  for (const line of lines) {
    if (!line || line.length < 3) continue

    const indexStatus = line[0]
    const workTreeStatus = line[1]
    let pathPart = line.substring(3).trim()

    let oldPath: string | undefined
    if (pathPart.includes(' -> ')) {
      const [from, to] = pathPart.split(' -> ')
      oldPath = from?.trim().replace(/^"|"$/g, '').replace(/\\/g, '/')
      pathPart = to?.trim().replace(/^"|"$/g, '') || pathPart
    } else {
      pathPart = pathPart.replace(/^"|"$/g, '')
    }

    const normalizedPath = path.normalize(pathPart).replace(/\\/g, '/')
    const filename = path.basename(normalizedPath)

    // Staging status & change type classification
    let status: GitFileChangeType = 'modified'
    let stagingStatus: GitStagingStatus = 'unstaged'
    let hasStagedChanges = false
    let hasUnstagedChanges = false

    if (indexStatus === '?' && workTreeStatus === '?') {
      status = 'untracked'
      stagingStatus = 'untracked'
      hasUnstagedChanges = true
    } else {
      hasStagedChanges = indexStatus !== ' ' && indexStatus !== '?'
      hasUnstagedChanges = workTreeStatus !== ' ' && workTreeStatus !== '?'

      if (hasStagedChanges && hasUnstagedChanges) {
        stagingStatus = 'partially_staged'
      } else if (hasStagedChanges) {
        stagingStatus = 'staged'
      } else {
        stagingStatus = 'unstaged'
      }

      if (indexStatus === 'R' || workTreeStatus === 'R') {
        status = 'renamed'
      } else if (indexStatus === 'D' || workTreeStatus === 'D') {
        status = 'deleted'
      } else if (indexStatus === 'A' || workTreeStatus === 'A') {
        status = 'added'
      } else {
        status = 'modified'
      }
    }

    const stats = numstatMap.get(normalizedPath) || { additions: 0, deletions: 0 }
    const isLoc = isLocalizationFile(filename)
    const langCode = isLoc ? extractLocaleFromFilename(filename) : undefined
    const langName = langCode ? getLanguageDisplayName(filename) : undefined

    result.push({
      path: normalizedPath,
      filename,
      oldPath,
      status,
      stagingStatus,
      statusCode: `${indexStatus}${workTreeStatus}`,
      hasStagedChanges,
      hasUnstagedChanges,
      additions: stats.additions,
      deletions: stats.deletions,
      isLocalization: isLoc,
      languageCode: langCode,
      languageName: langName,
    })
  }

  // Sort deterministically: localization files first, then alphabetically
  return result.sort((a, b) => {
    if (a.isLocalization !== b.isLocalization) {
      return a.isLocalization ? -1 : 1
    }
    return a.path.localeCompare(b.path)
  })
}

/**
 * Obtains complete Git working tree status for a directory.
 */
export async function getGitStatus(dirPath: string, localizationOnly?: boolean): Promise<GitStatusSummary> {
  const repoInfo = await getRepositoryInfo(dirPath)
  if (!repoInfo.isRepository || !repoInfo.rootPath) {
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
      error: repoInfo.error || 'Not a git repository.',
    }
  }

  const rootPath = repoInfo.rootPath

  // 1. Status porcelain
  const statusRes = await runGit(rootPath, ['status', '--porcelain=v1', '-uall'])
  if (statusRes.exitCode !== 0) {
    return {
      isRepository: true,
      rootPath,
      branch: repoInfo.currentBranch || '',
      isDetachedHead: !!repoInfo.isDetachedHead,
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
      error: statusRes.stderr || 'Failed to read git status.',
    }
  }

  // 2. Numstats for unstaged & staged
  const diffUnstagedRes = await runGit(rootPath, ['diff', '--numstat'])
  const diffStagedRes = await runGit(rootPath, ['diff', '--cached', '--numstat'])

  const unstagedMap = parseNumstatOutput(diffUnstagedRes.stdout)
  const stagedMap = parseNumstatOutput(diffStagedRes.stdout)

  // Merge numstat maps
  const combinedMap = new Map<string, { additions: number; deletions: number }>()
  for (const [p, stats] of unstagedMap.entries()) {
    combinedMap.set(p, { ...stats })
  }
  for (const [p, stats] of stagedMap.entries()) {
    const cur = combinedMap.get(p) || { additions: 0, deletions: 0 }
    combinedMap.set(p, {
      additions: cur.additions + stats.additions,
      deletions: cur.deletions + stats.deletions,
    })
  }

  const allFiles = parsePorcelainStatus(statusRes.stdout, combinedMap)

  let totalModified = 0
  let totalAdded = 0
  let totalDeleted = 0
  let totalRenamed = 0
  let totalUntracked = 0
  let totalStaged = 0
  let totalUnstaged = 0
  let totalPartiallyStaged = 0
  let locCount = 0

  for (const f of allFiles) {
    if (f.status === 'modified') totalModified++
    if (f.status === 'added') totalAdded++
    if (f.status === 'deleted') totalDeleted++
    if (f.status === 'renamed') totalRenamed++
    if (f.status === 'untracked') totalUntracked++

    if (f.stagingStatus === 'staged') totalStaged++
    if (f.stagingStatus === 'unstaged') totalUnstaged++
    if (f.stagingStatus === 'partially_staged') totalPartiallyStaged++

    if (f.isLocalization) locCount++
  }

  const files = localizationOnly ? allFiles.filter(f => f.isLocalization) : allFiles

  return {
    isRepository: true,
    rootPath,
    branch: repoInfo.currentBranch || 'HEAD',
    isDetachedHead: !!repoInfo.isDetachedHead,
    files,
    totalChanges: files.length,
    totalModified,
    totalAdded,
    totalDeleted,
    totalRenamed,
    totalUntracked,
    totalStaged,
    totalUnstaged,
    totalPartiallyStaged,
    localizationFilesCount: locCount,
    allFilesCount: allFiles.length,
  }
}

/**
 * Pure parser for `git log` output formatted with unit separators (%x1f) and record separators (%x1e).
 */
export function parseGitLogOutput(rawOutput: string): GitCommitSummary[] {
  const result: GitCommitSummary[] = []
  if (!rawOutput) return result

  // Split by record separator (%x1e)
  const records = rawOutput.split('\x1e')

  for (const record of records) {
    const trimmed = record.trim()
    if (!trimmed) continue

    const lines = trimmed.split('\n')
    const headerLine = lines[0]
    if (!headerLine) continue

    const fields = headerLine.split('\x1f')
    if (fields.length < 6) continue

    const [hash, shortHash, authorName, authorEmail, unixTimestampStr, subject] = fields

    const timestamp = (parseInt(unixTimestampStr, 10) || 0) * 1000

    // Parse numstat lines following the header
    const numstatLines = lines.slice(1).join('\n')
    const numstatMap = parseNumstatOutput(numstatLines)

    let totalAdditions = 0
    let totalDeletions = 0
    let localizationFilesCount = 0
    let totalFilesCount = 0

    for (const [filePath, stats] of numstatMap.entries()) {
      totalFilesCount++
      totalAdditions += stats.additions
      totalDeletions += stats.deletions

      const filename = path.basename(filePath)
      if (isLocalizationFile(filename)) {
        localizationFilesCount++
      }
    }

    result.push({
      hash,
      shortHash,
      authorName,
      authorEmail,
      timestamp,
      subject,
      isLocalizationCommit: localizationFilesCount > 0,
      localizationFilesCount,
      totalFilesCount,
      totalAdditions,
      totalDeletions,
    })
  }

  return result
}

/**
 * Retrieves Git commit history up to the specified limit.
 */
export async function getGitLog(
  dirPath: string,
  limit = 50,
  localizationOnly = false
): Promise<GitCommitSummary[]> {
  const repoInfo = await getRepositoryInfo(dirPath)
  if (!repoInfo.isRepository || !repoInfo.rootPath) {
    return []
  }

  const rootPath = repoInfo.rootPath
  const safeLimit = Math.max(1, Math.min(limit, 200))

  const logRes = await runGit(rootPath, [
    'log',
    `-n`,
    String(safeLimit),
    `--pretty=format:%x1e%H%x1f%h%x1f%an%x1f%ae%x1f%at%x1f%s`,
    '--numstat',
  ])

  if (logRes.exitCode !== 0) {
    return []
  }

  const allCommits = parseGitLogOutput(logRes.stdout)
  return localizationOnly ? allCommits.filter(c => c.isLocalizationCommit) : allCommits
}

/**
 * Retrieves details and changed files for a specific commit hash.
 */
export async function getCommitDetails(dirPath: string, commitHash: string): Promise<GitCommitDetails> {
  const repoInfo = await getRepositoryInfo(dirPath)
  if (!repoInfo.isRepository || !repoInfo.rootPath) {
    throw new Error('Not a git repository.')
  }

  // Validate commitHash format
  if (!/^[a-zA-Z0-9_.-]+$/.test(commitHash)) {
    throw new Error('Invalid commit identifier.')
  }

  const rootPath = repoInfo.rootPath

  const showRes = await runGit(rootPath, [
    'show',
    '-n',
    '1',
    `--pretty=format:%H%x1f%h%x1f%an%x1f%ae%x1f%at%x1f%s%x1f%b%x1e`,
    '--numstat',
    commitHash,
  ])

  if (showRes.exitCode !== 0) {
    throw new Error(`Failed to load commit details: ${showRes.stderr}`)
  }

  const [headerPart, numstatPart = ''] = showRes.stdout.split('\x1e')
  const fields = headerPart.split('\x1f')

  const [hash, shortHash, authorName, authorEmail, unixTimestampStr, subject, body = ''] = fields
  const timestamp = (parseInt(unixTimestampStr, 10) || 0) * 1000

  const numstatMap = parseNumstatOutput(numstatPart)

  const changedFiles: GitCommitFileChange[] = []
  let totalAdditions = 0
  let totalDeletions = 0
  let locCount = 0

  for (const [filePath, stats] of numstatMap.entries()) {
    const filename = path.basename(filePath)
    const isLoc = isLocalizationFile(filename)
    const langCode = isLoc ? extractLocaleFromFilename(filename) : undefined
    const langName = langCode ? getLanguageDisplayName(filename) : undefined

    if (isLoc) locCount++
    totalAdditions += stats.additions
    totalDeletions += stats.deletions

    changedFiles.push({
      path: filePath,
      filename,
      additions: stats.additions,
      deletions: stats.deletions,
      isLocalization: isLoc,
      languageCode: langCode,
      languageName: langName,
    })
  }

  // Sort files: localization files first, then alphabetically
  changedFiles.sort((a, b) => {
    if (a.isLocalization !== b.isLocalization) {
      return a.isLocalization ? -1 : 1
    }
    return a.path.localeCompare(b.path)
  })

  return {
    hash: hash || commitHash,
    shortHash: shortHash || commitHash.substring(0, 7),
    authorName: authorName || 'Unknown',
    authorEmail: authorEmail || '',
    timestamp,
    subject: subject || 'No commit message',
    body: body.trim(),
    isLocalizationCommit: locCount > 0,
    localizationFilesCount: locCount,
    totalFilesCount: changedFiles.length,
    totalAdditions,
    totalDeletions,
    changedFiles,
  }
}

/**
 * Obtains diff output for a file (working tree changes or historical commit diff).
 */
export async function getFileDiff(
  dirPath: string,
  filePath: string,
  commitHash?: string,
  staged?: boolean
): Promise<GitFileDiff> {
  const repoInfo = await getRepositoryInfo(dirPath)
  if (!repoInfo.isRepository || !repoInfo.rootPath) {
    return {
      filePath,
      diff: '',
      isBinary: false,
      additions: 0,
      deletions: 0,
      error: 'Not a git repository.',
    }
  }

  const rootPath = repoInfo.rootPath
  const normalizedFilePath = path.normalize(filePath).replace(/\\/g, '/')

  let diffOutput = ''

  if (commitHash) {
    if (!/^[a-zA-Z0-9_.-]+$/.test(commitHash)) {
      return {
        filePath,
        diff: '',
        isBinary: false,
        additions: 0,
        deletions: 0,
        error: 'Invalid commit hash.',
      }
    }

    // Historical commit diff
    const showRes = await runGit(rootPath, ['show', commitHash, '--', normalizedFilePath])
    if (showRes.exitCode === 0) {
      diffOutput = showRes.stdout
    } else {
      diffOutput = showRes.stderr
    }
  } else {
    // Working changes diff against HEAD (or staged)
    const diffArgs = staged
      ? ['diff', '--cached', '--', normalizedFilePath]
      : ['diff', 'HEAD', '--', normalizedFilePath]
    const diffRes = await runGit(rootPath, diffArgs)
    if (diffRes.stdout) {
      diffOutput = diffRes.stdout
    } else {
      // Check if file is untracked
      try {
        const fullPath = path.isAbsolute(normalizedFilePath)
          ? normalizedFilePath
          : path.join(rootPath, normalizedFilePath)
        const fileContent = await fs.readFile(fullPath, 'utf8')
        const lines = fileContent.split('\n')
        diffOutput = `--- /dev/null\n+++ b/${normalizedFilePath}\n@@ -0,0 +1,${lines.length} @@\n` +
          lines.map((l) => `+${l}`).join('\n')
      } catch {
        diffOutput = diffRes.stderr || 'No differences detected.'
      }
    }
  }

  // Count additions & deletions from patch lines
  let additions = 0
  let deletions = 0
  let isBinary = false

  const lines = diffOutput.split('\n')
  for (const line of lines) {
    if (line.startsWith('Binary files')) {
      isBinary = true
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      additions++
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions++
    }
  }

  return {
    filePath: normalizedFilePath,
    diff: diffOutput,
    isBinary,
    additions,
    deletions,
  }
}

/**
 * Validates a proposed Git branch name according to standard Git ref format rules.
 */
export function validateBranchName(name: string): { valid: boolean; error?: string } {
  const trimmed = name.trim()
  if (!trimmed) {
    return { valid: false, error: 'Branch name cannot be empty.' }
  }
  if (trimmed.includes(' ')) {
    return { valid: false, error: 'Branch name cannot contain spaces.' }
  }
  if (trimmed.startsWith('/') || trimmed.endsWith('/') || trimmed.endsWith('.')) {
    return { valid: false, error: 'Branch name cannot start or end with "/" or ".".' }
  }
  if (trimmed.includes('..') || trimmed.includes('//') || trimmed.includes('@{')) {
    return { valid: false, error: 'Branch name cannot contain consecutive dots, slashes, or "@{"' }
  }
  if (/[~^:?*[\\]/.test(trimmed)) {
    return { valid: false, error: 'Branch name contains invalid characters (~, ^, :, ?, *, [, \\).' }
  }
  if (trimmed.endsWith('.lock')) {
    return { valid: false, error: 'Branch name cannot end with .lock.' }
  }
  for (let i = 0; i < trimmed.length; i++) {
    const code = trimmed.charCodeAt(i)
    if (code < 32 || code === 127) {
      return { valid: false, error: 'Branch name cannot contain control characters.' }
    }
  }
  return { valid: true }
}

/**
 * Parses machine-readable output from `git branch --format=...`
 */
export function parseBranchOutput(output: string): GitBranchListResult {
  if (!output || !output.trim()) {
    return {
      currentBranch: '',
      isDetachedHead: false,
      branches: [],
    }
  }

  const lines = output.split('\n')
  const branches: GitBranchInfo[] = []
  let currentBranch = ''
  let isDetachedHead = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const parts = trimmed.split('\0')
    const headFlag = parts[0]?.trim() || ''
    const branchName = parts[1]?.trim() || ''
    const commitHash = parts[2]?.trim() || undefined
    const upstream = parts[3]?.trim() || undefined

    const isHead = headFlag === '*'

    if (isHead) {
      // Check if detached HEAD
      const detachedMatch = branchName.match(/^\(HEAD detached (?:at|from) (.+)\)$/) || branchName.match(/^\(detached from (.+)\)$/)
      if (detachedMatch) {
        isDetachedHead = true
        currentBranch = `HEAD (${detachedMatch[1] || commitHash || 'detached'})`
        // We don't add the pseudo "(HEAD detached at...)" as a normal local branch
      } else {
        isDetachedHead = false
        currentBranch = branchName
        branches.push({
          name: branchName,
          isCurrent: true,
          commitHash,
          upstream: upstream || undefined,
        })
      }
    } else {
      if (branchName && !branchName.startsWith('(')) {
        branches.push({
          name: branchName,
          isCurrent: false,
          commitHash,
          upstream: upstream || undefined,
        })
      }
    }
  }

  // Deterministic sorting: current branch first, then alphabetically
  branches.sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) {
      return a.isCurrent ? -1 : 1
    }
    return a.name.localeCompare(b.name)
  })

  return {
    currentBranch: currentBranch || (branches[0]?.isCurrent ? branches[0].name : 'main'),
    isDetachedHead,
    branches,
  }
}

/**
 * Retrieves list of local branches for a workspace.
 */
export async function getGitBranches(dirPath: string): Promise<GitBranchListResult> {
  const repoInfo = await getRepositoryInfo(dirPath)
  if (!repoInfo.isRepository || !repoInfo.rootPath) {
    return {
      currentBranch: '',
      isDetachedHead: false,
      branches: [],
      error: 'Not a git repository.',
    }
  }

  const rootPath = repoInfo.rootPath
  const branchRes = await runGit(rootPath, [
    'branch',
    '--format=%(HEAD)%00%(refname:short)%00%(objectname:short)%00%(upstream:short)',
  ])

  if (branchRes.exitCode !== 0) {
    return {
      currentBranch: repoInfo.currentBranch || '',
      isDetachedHead: !!repoInfo.isDetachedHead,
      branches: [],
      error: branchRes.stderr || 'Failed to list branches.',
    }
  }

  return parseBranchOutput(branchRes.stdout)
}

/**
 * Safely switches / checkouts an existing local branch.
 * Does NOT discard or force overwrite local changes.
 */
export async function switchGitBranch(
  dirPath: string,
  branchName: string
): Promise<GitBranchSwitchResult> {
  const repoInfo = await getRepositoryInfo(dirPath)
  if (!repoInfo.isRepository || !repoInfo.rootPath) {
    return {
      success: false,
      currentBranch: '',
      isDetachedHead: false,
      error: 'Not a git repository.',
    }
  }

  const trimmedBranch = branchName.trim()
  if (!trimmedBranch) {
    return {
      success: false,
      currentBranch: repoInfo.currentBranch || '',
      isDetachedHead: !!repoInfo.isDetachedHead,
      error: 'Branch name cannot be empty.',
    }
  }

  const rootPath = repoInfo.rootPath
  const checkoutRes = await runGit(rootPath, ['checkout', trimmedBranch])

  if (checkoutRes.exitCode === 0) {
    return {
      success: true,
      currentBranch: trimmedBranch,
      isDetachedHead: false,
    }
  }

  const stderr = checkoutRes.stderr.toLowerCase()
  const isBlockedByChanges =
    stderr.includes('would be overwritten by checkout') ||
    stderr.includes('please commit your changes or stash them') ||
    stderr.includes('untracked working tree files would be overwritten') ||
    stderr.includes('your local changes')

  return {
    success: false,
    currentBranch: repoInfo.currentBranch || '',
    isDetachedHead: !!repoInfo.isDetachedHead,
    error: checkoutRes.stderr || 'Failed to switch branch.',
    blockedByWorkingChanges: isBlockedByChanges,
  }
}

/**
 * Creates a new local branch and switches to it.
 */
export async function createGitBranch(
  dirPath: string,
  branchName: string
): Promise<GitBranchCreateResult> {
  const repoInfo = await getRepositoryInfo(dirPath)
  if (!repoInfo.isRepository || !repoInfo.rootPath) {
    return {
      success: false,
      branchName,
      error: 'Not a git repository.',
    }
  }

  const validation = validateBranchName(branchName)
  if (!validation.valid) {
    return {
      success: false,
      branchName,
      error: validation.error || 'Invalid branch name.',
    }
  }

  const rootPath = repoInfo.rootPath
  const trimmedBranch = branchName.trim()
  const createRes = await runGit(rootPath, ['checkout', '-b', trimmedBranch])

  if (createRes.exitCode === 0) {
    return {
      success: true,
      branchName: trimmedBranch,
    }
  }

  return {
    success: false,
    branchName: trimmedBranch,
    error: createRes.stderr || 'Failed to create branch.',
  }
}

/**
 * Selectively commits specific working tree changes safely.
 * Stages only the selected paths and re-verifies the index before commit.
 */
export async function commitGitSelected(
  dirPath: string,
  filePaths: string[],
  message: string
): Promise<GitCommitSelectedResult> {
  const repoInfo = await getRepositoryInfo(dirPath)
  if (!repoInfo.isRepository || !repoInfo.rootPath) {
    return {
      success: false,
      error: 'Not a git repository.',
    }
  }

  const rootPath = repoInfo.rootPath
  const trimmedMessage = message.trim()
  if (!trimmedMessage) {
    return {
      success: false,
      error: 'Commit message cannot be empty.',
    }
  }

  if (!filePaths || filePaths.length === 0) {
    return {
      success: false,
      error: 'No files selected for commit.',
    }
  }

  const norm = (p: string) => p.replace(/\\/g, '/').replace(/^\.\//, '').trim()
  const selectedNormSet = new Set(filePaths.map(norm))

  // Step 1: Read initial status
  const initialStatus = await getGitStatus(rootPath)

  // Step 2: Check for unrelated staged files
  const existingStagedFiles = initialStatus.files.filter(
    (f) => f.hasStagedChanges || f.stagingStatus === 'staged' || f.stagingStatus === 'partially_staged'
  )
  const unrelatedStaged = existingStagedFiles.filter(
    (f) => !selectedNormSet.has(norm(f.path)) && (!f.oldPath || !selectedNormSet.has(norm(f.oldPath)))
  )

  if (unrelatedStaged.length > 0) {
    return {
      success: false,
      blockedByUnrelatedStaged: true,
      unrelatedStagedFiles: unrelatedStaged.map((f) => f.path),
      error: 'Repository contains unrelated staged files in the index. Please commit or unstage them first.',
    }
  }

  // Step 3: Verify selection freshness against working changes
  const workingMap = new Map<string, GitFileStatus>()
  for (const f of initialStatus.files) {
    workingMap.set(norm(f.path), f)
    if (f.oldPath) {
      workingMap.set(norm(f.oldPath), f)
    }
  }

  for (const selPath of selectedNormSet) {
    if (!workingMap.has(selPath)) {
      return {
        success: false,
        staleSelection: true,
        error: `Selected file "${selPath}" is no longer modified or present in working changes.`,
      }
    }
  }

  // Step 4: Stage ONLY the selected paths
  const addPaths: string[] = []
  const rmPaths: string[] = []

  for (const selPath of selectedNormSet) {
    const fileStat = workingMap.get(selPath)
    if (fileStat && fileStat.status === 'deleted') {
      rmPaths.push(selPath)
    } else {
      addPaths.push(selPath)
    }
  }

  if (addPaths.length > 0) {
    const addRes = await runGit(rootPath, ['add', '--', ...addPaths])
    if (addRes.exitCode !== 0) {
      return {
        success: false,
        error: addRes.stderr || 'Failed to stage selected files.',
      }
    }
  }

  if (rmPaths.length > 0) {
    const rmRes = await runGit(rootPath, ['add', '--', ...rmPaths])
    if (rmRes.exitCode !== 0) {
      await runGit(rootPath, ['rm', '--', ...rmPaths])
    }
  }

  // Step 5: Re-verify Git index immediately before commit
  const postStageStatus = await getGitStatus(rootPath)
  const stagedAfter = postStageStatus.files.filter(
    (f) => f.hasStagedChanges || f.stagingStatus === 'staged' || f.stagingStatus === 'partially_staged'
  )
  const stagedPaths = stagedAfter.map((f) => norm(f.path))
  const stagedPathSet = new Set(stagedPaths)

  // Verify that all selected paths are staged
  for (const selPath of selectedNormSet) {
    if (!stagedPathSet.has(selPath)) {
      const matched = stagedAfter.some((f) => f.oldPath && norm(f.oldPath) === selPath)
      if (!matched) {
        return {
          success: false,
          error: `Selected file "${selPath}" was not successfully staged in the index.`,
        }
      }
    }
  }

  // Verify no unselected path is staged
  for (const stagedFile of stagedAfter) {
    const stagedNorm = norm(stagedFile.path)
    const oldNorm = stagedFile.oldPath ? norm(stagedFile.oldPath) : null
    if (!selectedNormSet.has(stagedNorm) && (!oldNorm || !selectedNormSet.has(oldNorm))) {
      return {
        success: false,
        blockedByUnrelatedStaged: true,
        unrelatedStagedFiles: [stagedFile.path],
        error: `Unexpected file "${stagedFile.path}" was found staged in the index before commit.`,
      }
    }
  }

  // Step 6: Execute commit
  const commitRes = await runGit(rootPath, ['commit', '-m', trimmedMessage])
  if (commitRes.exitCode !== 0) {
    const stderrLower = commitRes.stderr.toLowerCase()
    const isHook =
      stderrLower.includes('hook') ||
      stderrLower.includes('pre-commit') ||
      stderrLower.includes('commit-msg')

    return {
      success: false,
      hookFailed: isHook,
      error: commitRes.stderr || 'Git commit was rejected.',
    }
  }

  // Step 7: Inspect new commit
  const hashRes = await runGit(rootPath, ['rev-parse', 'HEAD'])
  const shortHashRes = await runGit(rootPath, ['rev-parse', '--short', 'HEAD'])
  const commitHash = hashRes.stdout.trim()
  const shortHash = shortHashRes.stdout.trim()

  const showRes = await runGit(rootPath, ['show', '--numstat', '--format=', commitHash])
  const showNumstats = parseNumstatOutput(showRes.stdout)

  let totalAdditions = 0
  let totalDeletions = 0
  const committedFilesList: string[] = []

  for (const [filePath, stats] of showNumstats.entries()) {
    committedFilesList.push(filePath)
    totalAdditions += stats.additions
    totalDeletions += stats.deletions
  }

  return {
    success: true,
    commitHash,
    shortHash,
    committedFiles: committedFilesList.length > 0 ? committedFilesList : Array.from(selectedNormSet),
    additions: totalAdditions,
    deletions: totalDeletions,
  }
}

/**
 * Sanitizes remote Git URLs by redacting embedded passwords or access tokens.
 * Handles HTTPS/HTTP, SSH with userinfo, and token URLs.
 */
export function sanitizeGitUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return ''
  const trimmed = rawUrl.trim()

  // Match standard URLs with scheme://user:pass@host or scheme://token@host
  // e.g. https://user:secret@github.com/org/repo.git -> https://***@github.com/org/repo.git
  // e.g. https://ghp_1234567890@github.com/org/repo.git -> https://***@github.com/org/repo.git
  const schemeUserinfoRegex = /^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)([^@/\s]+)@(.*)$/
  const match = trimmed.match(schemeUserinfoRegex)
  if (match) {
    const scheme = match[1]
    const userinfo = match[2]
    const rest = match[3]

    // If userinfo contains password (user:pass) or looks like a token/secret
    if (userinfo.includes(':') || userinfo.length > 15 || /^(ghp_|gho_|github_pat_|glpat-|x-oauth-basic)/i.test(userinfo)) {
      return `${scheme}***@${rest}`
    }
    // If it's a simple user without password like git://git@host, preserve user or sanitize if sensitive
    if (userinfo.toLowerCase() === 'git') {
      return `${scheme}git@${rest}`
    }
    return `${scheme}***@${rest}`
  }

  // Match scp-like syntax with password: user:password@host:repo.git
  const scpUserinfoRegex = /^([^@\s:]+):([^@\s]+)@([^/:\s]+):(.*)$/
  const scpMatch = trimmed.match(scpUserinfoRegex)
  if (scpMatch) {
    return `***@${scpMatch[3]}:${scpMatch[4]}`
  }

  return trimmed
}

/**
 * Parses machine-readable output from `git remote -v`.
 */
export function parseGitRemoteOutput(output: string): GitRemoteInfo[] {
  if (!output || typeof output !== 'string') return []

  const remoteMap = new Map<string, { fetchUrl?: string; pushUrl?: string }>()
  const lines = output.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Format: <name>\t<url> (fetch|push)
    const match = trimmed.match(/^([^\s]+)\s+([^\s]+)\s+\((fetch|push)\)$/i)
    if (match) {
      const name = match[1]
      const rawUrl = match[2]
      const type = match[3].toLowerCase()
      const sanitized = sanitizeGitUrl(rawUrl)

      if (!remoteMap.has(name)) {
        remoteMap.set(name, {})
      }
      const entry = remoteMap.get(name)!
      if (type === 'fetch') {
        entry.fetchUrl = sanitized
      } else if (type === 'push') {
        entry.pushUrl = sanitized
      }
    }
  }

  const result: GitRemoteInfo[] = []
  for (const [name, urls] of remoteMap.entries()) {
    result.push({
      name,
      fetchUrl: urls.fetchUrl || urls.pushUrl,
      pushUrl: urls.pushUrl || urls.fetchUrl,
    })
  }

  // Deterministic sort: 'origin' first, then alphabetical
  result.sort((a, b) => {
    if (a.name === 'origin') return -1
    if (b.name === 'origin') return 1
    return a.name.localeCompare(b.name)
  })

  return result
}

/**
 * Checks whether the repository has an in-progress operation (merge, rebase, cherry-pick, revert).
 */
export async function checkUnfinishedOperation(
  rootPath: string
): Promise<{ inProgress: boolean; type?: 'merge' | 'rebase' | 'cherry-pick' | 'revert' }> {
  try {
    const gitDirRes = await runGit(rootPath, ['rev-parse', '--git-dir'])
    const gitDir = gitDirRes.exitCode === 0 && gitDirRes.stdout.trim()
      ? path.resolve(rootPath, gitDirRes.stdout.trim())
      : path.join(rootPath, '.git')

    // Check MERGE_HEAD
    try {
      await fs.stat(path.join(gitDir, 'MERGE_HEAD'))
      return { inProgress: true, type: 'merge' }
    } catch {
      // not merge
    }

    // Check rebase-apply or rebase-merge or REBASE_HEAD
    try {
      await fs.stat(path.join(gitDir, 'rebase-merge'))
      return { inProgress: true, type: 'rebase' }
    } catch {
      // not rebase-merge
    }
    try {
      await fs.stat(path.join(gitDir, 'rebase-apply'))
      return { inProgress: true, type: 'rebase' }
    } catch {
      // not rebase-apply
    }
    try {
      await fs.stat(path.join(gitDir, 'REBASE_HEAD'))
      return { inProgress: true, type: 'rebase' }
    } catch {
      // not REBASE_HEAD
    }

    // Check CHERRY_PICK_HEAD
    try {
      await fs.stat(path.join(gitDir, 'CHERRY_PICK_HEAD'))
      return { inProgress: true, type: 'cherry-pick' }
    } catch {
      // not cherry-pick
    }

    // Check REVERT_HEAD
    try {
      await fs.stat(path.join(gitDir, 'REVERT_HEAD'))
      return { inProgress: true, type: 'revert' }
    } catch {
      // not revert
    }

    return { inProgress: false }
  } catch {
    return { inProgress: false }
  }
}

/**
 * Parses machine-readable ahead/behind counts from `git rev-list --left-right --count HEAD...@{upstream}`.
 */
export function parseAheadBehindOutput(output: string): { ahead: number; behind: number } {
  if (!output) return { ahead: 0, behind: 0 }
  const trimmed = output.trim()
  const parts = trimmed.split(/\s+/)
  if (parts.length >= 2) {
    const ahead = parseInt(parts[0], 10)
    const behind = parseInt(parts[1], 10)
    return {
      ahead: isNaN(ahead) ? 0 : ahead,
      behind: isNaN(behind) ? 0 : behind,
    }
  }
  return { ahead: 0, behind: 0 }
}

/**
 * Classifies Git error messages into structured categories for UI localization.
 */
export function classifyGitError(stderr: string, stdout?: string): GitSyncErrorCode {
  const combined = `${stderr || ''} ${stdout || ''}`.toLowerCase()

  if (
    combined.includes('authentication failed') ||
    combined.includes('permission denied (publickey)') ||
    combined.includes('could not read username') ||
    combined.includes('invalid username or password') ||
    combined.includes('http 401') ||
    combined.includes('http 403') ||
    combined.includes('access denied') ||
    combined.includes('fatal: remote error: git-upload-pack: not found')
  ) {
    return 'auth_failed'
  }

  if (
    combined.includes('could not resolve host') ||
    combined.includes('failed to connect') ||
    combined.includes('connection timed out') ||
    combined.includes('network is unreachable') ||
    combined.includes('operation timed out') ||
    combined.includes('the remote end hung up unexpectedly') ||
    combined.includes('fatal: unable to access') ||
    combined.includes('port 22: connection refused')
  ) {
    return 'network_failed'
  }

  if (
    combined.includes('[rejected]') ||
    combined.includes('non-fast-forward') ||
    combined.includes('updates were rejected because the remote contains work') ||
    combined.includes('fetch first') ||
    combined.includes('failed to push some refs') ||
    combined.includes('remote contains work that you do not have locally')
  ) {
    return 'push_rejected'
  }

  if (
    combined.includes('conflict (content): merge conflict in') ||
    combined.includes('automatic merge failed; fix conflicts') ||
    combined.includes('fix conflicts and then commit the result') ||
    combined.includes('conflicts:')
  ) {
    return 'conflict'
  }

  if (
    combined.includes('your local changes to the following files would be overwritten by merge') ||
    combined.includes('please commit your changes or stash them before you merge') ||
    combined.includes('error: your local changes to the following files would be overwritten')
  ) {
    return 'blocked_by_changes'
  }

  if (
    combined.includes('you have not concluded your merge') ||
    combined.includes('rebase in progress') ||
    combined.includes('cherry-pick in progress')
  ) {
    return 'unfinished_operation'
  }

  if (
    combined.includes('no tracking information for the current branch') ||
    combined.includes('has no upstream branch') ||
    combined.includes('no upstream configured')
  ) {
    return 'no_upstream'
  }

  return 'generic'
}

/**
 * Retrieves configured Git remotes.
 */
export async function getGitRemotes(dirPath: string): Promise<GitRemoteInfo[]> {
  const repoInfo = await getRepositoryInfo(dirPath)
  if (!repoInfo.isRepository || !repoInfo.rootPath) {
    return []
  }

  const rootPath = repoInfo.rootPath
  const remoteRes = await runGit(rootPath, ['remote', '-v'])
  if (remoteRes.exitCode !== 0) {
    return []
  }

  return parseGitRemoteOutput(remoteRes.stdout)
}

/**
 * Retrieves comprehensive remote sync status for the current branch and repository.
 */
export async function getGitSyncStatus(dirPath: string): Promise<GitSyncStatus> {
  const repoInfo = await getRepositoryInfo(dirPath)
  if (!repoInfo.isRepository || !repoInfo.rootPath) {
    return {
      hasRemote: false,
      remotes: [],
      currentBranch: '',
      isDetachedHead: false,
      hasUpstream: false,
      ahead: 0,
      behind: 0,
      isDiverged: false,
      isSynchronized: false,
      error: 'Not a git repository.',
    }
  }

  const rootPath = repoInfo.rootPath
  const remotes = await getGitRemotes(rootPath)
  const hasRemote = remotes.length > 0

  const unfinishedOp = await checkUnfinishedOperation(rootPath)

  if (repoInfo.isDetachedHead) {
    return {
      hasRemote,
      remotes,
      currentBranch: repoInfo.currentBranch || 'HEAD',
      isDetachedHead: true,
      hasUpstream: false,
      ahead: 0,
      behind: 0,
      isDiverged: false,
      isSynchronized: false,
      unfinishedOperation: unfinishedOp.inProgress ? { type: unfinishedOp.type! } : undefined,
    }
  }

  const currentBranch = repoInfo.currentBranch || 'main'

  // Check upstream tracking branch using machine-readable ref format
  const upstreamRes = await runGit(rootPath, ['rev-parse', '--abbrev-ref', '@{upstream}'])
  if (upstreamRes.exitCode !== 0 || !upstreamRes.stdout.trim()) {
    return {
      hasRemote,
      remotes,
      currentBranch,
      isDetachedHead: false,
      hasUpstream: false,
      ahead: 0,
      behind: 0,
      isDiverged: false,
      isSynchronized: false,
      unfinishedOperation: unfinishedOp.inProgress ? { type: unfinishedOp.type! } : undefined,
    }
  }

  const upstreamRef = upstreamRes.stdout.trim()
  let upstreamRemote: string | undefined
  let upstreamBranch: string | undefined

  // Split upstream remote and branch (e.g. origin/main -> origin, main)
  const slashIdx = upstreamRef.indexOf('/')
  if (slashIdx > 0) {
    upstreamRemote = upstreamRef.substring(0, slashIdx)
    upstreamBranch = upstreamRef.substring(slashIdx + 1)
  }

  // Get machine-readable ahead/behind counts
  const revListRes = await runGit(rootPath, [
    'rev-list',
    '--left-right',
    '--count',
    'HEAD...@{upstream}',
  ])

  let ahead = 0
  let behind = 0

  if (revListRes.exitCode === 0) {
    const counts = parseAheadBehindOutput(revListRes.stdout)
    ahead = counts.ahead
    behind = counts.behind
  }

  const isSynchronized = ahead === 0 && behind === 0
  const isDiverged = ahead > 0 && behind > 0

  return {
    hasRemote,
    remotes,
    currentBranch,
    isDetachedHead: false,
    hasUpstream: true,
    upstream: upstreamRef,
    upstreamRemote,
    upstreamBranch,
    ahead,
    behind,
    isDiverged,
    isSynchronized,
    unfinishedOperation: unfinishedOp.inProgress ? { type: unfinishedOp.type! } : undefined,
  }
}

/**
 * Fetches remote references safely without modifying the working tree.
 */
export async function fetchGit(dirPath: string, remote?: string): Promise<GitFetchResult> {
  const repoInfo = await getRepositoryInfo(dirPath)
  if (!repoInfo.isRepository || !repoInfo.rootPath) {
    return {
      success: false,
      error: 'Not a git repository.',
      errorCode: 'generic',
    }
  }

  const rootPath = repoInfo.rootPath
  const remotes = await getGitRemotes(rootPath)
  if (remotes.length === 0) {
    return {
      success: false,
      error: 'No Git remotes configured for this repository.',
      errorCode: 'no_remote',
    }
  }

  const targetRemote = remote?.trim() || (remotes.some((r) => r.name === 'origin') ? 'origin' : remotes[0].name)
  const fetchRes = await runGit(rootPath, ['fetch', targetRemote])

  if (fetchRes.exitCode === 0) {
    return {
      success: true,
      remote: targetRemote,
    }
  }

  const errorCode = classifyGitError(fetchRes.stderr, fetchRes.stdout)
  return {
    success: false,
    remote: targetRemote,
    error: fetchRes.stderr || 'Git fetch failed.',
    errorCode,
  }
}

/**
 * Pulls remote changes into the current branch.
 * Respects configured upstream, blocks if unfinished operations exist, never auto-stashes.
 */
export async function pullGit(
  dirPath: string,
  remote?: string,
  branch?: string
): Promise<GitPullResult> {
  const repoInfo = await getRepositoryInfo(dirPath)
  if (!repoInfo.isRepository || !repoInfo.rootPath) {
    return {
      success: false,
      error: 'Not a git repository.',
      errorCode: 'generic',
    }
  }

  const rootPath = repoInfo.rootPath

  if (repoInfo.isDetachedHead) {
    return {
      success: false,
      error: 'Cannot pull in detached HEAD state.',
      errorCode: 'detached_head',
    }
  }

  // Check unfinished operations
  const unfinishedOp = await checkUnfinishedOperation(rootPath)
  if (unfinishedOp.inProgress) {
    return {
      success: false,
      error: `Cannot pull: An unfinished Git ${unfinishedOp.type} is in progress.`,
      errorCode: 'unfinished_operation',
      unfinishedOperation: { type: unfinishedOp.type! },
    }
  }

  // Check sync status & upstream
  const syncStatus = await getGitSyncStatus(rootPath)
  if (!syncStatus.hasRemote) {
    return {
      success: false,
      error: 'No Git remotes configured for this repository.',
      errorCode: 'no_remote',
    }
  }

  let pullArgs = ['pull']
  let effectiveRemote = remote?.trim()
  let effectiveBranch = branch?.trim()

  if (effectiveRemote && effectiveBranch) {
    pullArgs = ['pull', effectiveRemote, effectiveBranch]
  } else if (syncStatus.hasUpstream && syncStatus.upstreamRemote && syncStatus.upstreamBranch) {
    effectiveRemote = syncStatus.upstreamRemote
    effectiveBranch = syncStatus.upstreamBranch
    pullArgs = ['pull', effectiveRemote, effectiveBranch]
  } else if (!syncStatus.hasUpstream) {
    return {
      success: false,
      noUpstream: true,
      error: 'The current branch has no configured upstream branch.',
      errorCode: 'no_upstream',
    }
  }

  const pullRes = await runGit(rootPath, pullArgs)

  if (pullRes.exitCode === 0) {
    return {
      success: true,
      remote: effectiveRemote,
      branch: effectiveBranch,
    }
  }

  const errorCode = classifyGitError(pullRes.stderr, pullRes.stdout)
  const combinedOutput = `${pullRes.stdout}\n${pullRes.stderr}`

  // Parse conflict files if present
  let conflictFiles: string[] | undefined
  if (errorCode === 'conflict') {
    const conflictMatches = combinedOutput.match(/CONFLICT \([^)]+\): Merge conflict in (.+)/g)
    if (conflictMatches) {
      conflictFiles = conflictMatches.map((m) => {
        const fileMatch = m.match(/Merge conflict in (.+)$/)
        return fileMatch ? fileMatch[1].trim() : m
      })
    }
  }

  return {
    success: false,
    remote: effectiveRemote,
    branch: effectiveBranch,
    error: pullRes.stderr || pullRes.stdout || 'Git pull failed.',
    errorCode,
    hasConflicts: errorCode === 'conflict',
    conflictFiles,
    blockedByWorkingChanges: errorCode === 'blocked_by_changes',
  }
}

/**
 * Pushes local commits to the remote repository.
 * Never performs force push. Supports setting upstream on unconfigured branches.
 */
export async function pushGit(
  dirPath: string,
  remote?: string,
  branch?: string,
  setUpstream?: boolean
): Promise<GitPushResult> {
  const repoInfo = await getRepositoryInfo(dirPath)
  if (!repoInfo.isRepository || !repoInfo.rootPath) {
    return {
      success: false,
      error: 'Not a git repository.',
      errorCode: 'generic',
    }
  }

  const rootPath = repoInfo.rootPath

  if (repoInfo.isDetachedHead) {
    return {
      success: false,
      error: 'Cannot push in detached HEAD state.',
      errorCode: 'detached_head',
    }
  }

  // Check unfinished operations
  const unfinishedOp = await checkUnfinishedOperation(rootPath)
  if (unfinishedOp.inProgress) {
    return {
      success: false,
      error: `Cannot push: An unfinished Git ${unfinishedOp.type} is in progress.`,
      errorCode: 'unfinished_operation',
    }
  }

  const syncStatus = await getGitSyncStatus(rootPath)
  if (!syncStatus.hasRemote) {
    return {
      success: false,
      error: 'No Git remotes configured for this repository.',
      errorCode: 'no_remote',
    }
  }

  const currentBranch = repoInfo.currentBranch || 'main'
  let targetRemote = remote?.trim() || syncStatus.upstreamRemote
  const targetBranch = branch?.trim() || syncStatus.upstreamBranch || currentBranch

  if (!targetRemote) {
    targetRemote = syncStatus.remotes.some((r) => r.name === 'origin')
      ? 'origin'
      : syncStatus.remotes[0]?.name || 'origin'
  }

  const pushArgs: string[] = ['push']

  if (setUpstream || !syncStatus.hasUpstream) {
    pushArgs.push('-u', targetRemote, `${currentBranch}:${targetBranch}`)
  } else if (remote || branch) {
    pushArgs.push(targetRemote, `${currentBranch}:${targetBranch}`)
  }

  const pushRes = await runGit(rootPath, pushArgs)

  if (pushRes.exitCode === 0) {
    return {
      success: true,
      remote: targetRemote,
      branch: targetBranch,
    }
  }

  const errorCode = classifyGitError(pushRes.stderr, pushRes.stdout)
  return {
    success: false,
    remote: targetRemote,
    branch: targetBranch,
    error: pushRes.stderr || pushRes.stdout || 'Git push failed.',
    errorCode,
    rejected: errorCode === 'push_rejected',
    noUpstream: errorCode === 'no_upstream',
  }
}


