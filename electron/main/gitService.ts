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
    `--pretty=format:%H%x1f%h%x1f%an%x1f%ae%x1f%at%x1f%s%x1f%b`,
    '--numstat',
    commitHash,
  ])

  if (showRes.exitCode !== 0) {
    throw new Error(`Failed to load commit details: ${showRes.stderr}`)
  }

  const lines = showRes.stdout.split('\n')
  const header = lines[0] || ''
  const fields = header.split('\x1f')

  const [hash, shortHash, authorName, authorEmail, unixTimestampStr, subject, body = ''] = fields
  const timestamp = (parseInt(unixTimestampStr, 10) || 0) * 1000

  const numstatText = lines.slice(1).join('\n')
  const numstatMap = parseNumstatOutput(numstatText)

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

