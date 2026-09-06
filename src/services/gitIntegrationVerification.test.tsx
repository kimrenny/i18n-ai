import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {
  checkGitAvailable,
  getRepositoryInfo,
  getGitStatus,
  getGitLog,
  getCommitDetails,
  getFileDiff,
  runGit,
} from '../../electron/main/gitService'
import {
  parseDiffContent,
  filterLocalizationFiles,
  filterLocalizationCommits,
} from './git/gitService'

describe('Comprehensive Real Git Repository End-to-End Verification', () => {
  let tempRepoDir: string | null = null
  let nonGitDir: string | null = null
  let nestedWorkspaceDir: string | null = null
  let isGitAvailable = false

  beforeAll(async () => {
    isGitAvailable = await checkGitAvailable()
    if (!isGitAvailable) {
      console.warn('Git is not installed, skipping real repo tests')
      return
    }

    // 1. Create a real temporary Git repository
    tempRepoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-full-verification-'))
    nonGitDir = await fs.mkdtemp(path.join(os.tmpdir(), 'non-git-verification-'))

    // Initialize Git repository
    await runGit(tempRepoDir, ['init'])
    await runGit(tempRepoDir, ['config', 'user.name', 'Integration Bot'])
    await runGit(tempRepoDir, ['config', 'user.email', 'bot@integration.test'])
    await runGit(tempRepoDir, ['config', 'commit.gpgSign', 'false'])

    // Create nested directory structure: locales/ and src/
    const localesDir = path.join(tempRepoDir, 'locales')
    const srcDir = path.join(tempRepoDir, 'src')
    await fs.mkdir(localesDir, { recursive: true })
    await fs.mkdir(srcDir, { recursive: true })

    // Create localization files & non-localization files
    await fs.writeFile(
      path.join(localesDir, 'en.json'),
      JSON.stringify({ greeting: 'Hello', cancel: 'Cancel' }, null, 2),
      'utf8'
    )
    await fs.writeFile(
      path.join(localesDir, 'de.json'),
      JSON.stringify({ greeting: 'Hallo', cancel: 'Abbrechen' }, null, 2),
      'utf8'
    )
    await fs.writeFile(
      path.join(localesDir, 'to_rename.json'),
      JSON.stringify({ greeting: 'Hola' }, null, 2),
      'utf8'
    )
    await fs.writeFile(
      path.join(localesDir, 'to_delete.json'),
      JSON.stringify({ greeting: 'Bonjour' }, null, 2),
      'utf8'
    )
    await fs.writeFile(
      path.join(srcDir, 'index.ts'),
      'console.log("App startup")\n',
      'utf8'
    )

    // Make initial commit (Commit 1 - Mixed localization and non-localization)
    await runGit(tempRepoDir, ['add', '.'])
    await runGit(tempRepoDir, ['commit', '-m', 'feat(core): initial commit with i18n & code'])

    // Make a code-only commit (Commit 2 - Non-localization)
    await fs.writeFile(
      path.join(srcDir, 'utils.ts'),
      'export const add = (a: number, b: number) => a + b;\n',
      'utf8'
    )
    await runGit(tempRepoDir, ['add', '.'])
    await runGit(tempRepoDir, ['commit', '-m', 'chore: add math utils'])

    // Set up nested workspace path
    nestedWorkspaceDir = localesDir

    // 2. Setup active working tree changes with multiple specific states:
    // a) Staged modification
    await fs.writeFile(
      path.join(localesDir, 'de.json'),
      JSON.stringify({ greeting: 'Hallo Welt', cancel: 'Abbrechen' }, null, 2),
      'utf8'
    )
    await runGit(tempRepoDir, ['add', 'locales/de.json'])

    // b) Unstaged modification
    await fs.writeFile(
      path.join(localesDir, 'en.json'),
      JSON.stringify({ greeting: 'Hello World', cancel: 'Cancel', save: 'Save' }, null, 2),
      'utf8'
    )

    // c) Staged + Unstaged modification (MM / partially staged)
    await fs.writeFile(
      path.join(srcDir, 'index.ts'),
      'console.log("Staged change")\n',
      'utf8'
    )
    await runGit(tempRepoDir, ['add', 'src/index.ts'])
    await fs.writeFile(
      path.join(srcDir, 'index.ts'),
      'console.log("Staged change with unstaged tweak")\n',
      'utf8'
    )

    // d) Untracked file
    await fs.writeFile(
      path.join(localesDir, 'uk.json'),
      JSON.stringify({ greeting: 'Привіт' }, null, 2),
      'utf8'
    )

    // e) Staged addition
    await fs.writeFile(
      path.join(localesDir, 'es.json'),
      JSON.stringify({ greeting: 'Hola Amigos' }, null, 2),
      'utf8'
    )
    await runGit(tempRepoDir, ['add', 'locales/es.json'])

    // f) Staged rename
    await runGit(tempRepoDir, ['mv', 'locales/to_rename.json', 'locales/renamed_es.json'])

    // g) Staged deletion
    await runGit(tempRepoDir, ['rm', 'locales/to_delete.json'])
  })

  afterAll(async () => {
    if (tempRepoDir) {
      try {
        await fs.rm(tempRepoDir, { recursive: true, force: true })
      } catch {
        // ignore
      }
    }
    if (nonGitDir) {
      try {
        await fs.rm(nonGitDir, { recursive: true, force: true })
      } catch {
        // ignore
      }
    }
  })

  it('1. detects repository at repo root correctly', async () => {
    if (!isGitAvailable || !tempRepoDir) return
    const info = await getRepositoryInfo(tempRepoDir)
    expect(info.isGitAvailable).toBe(true)
    expect(info.isRepository).toBe(true)
    expect(info.rootPath).toBeDefined()
    expect(info.currentBranch).toBeDefined()
  })

  it('2. detects repository from a nested workspace folder', async () => {
    if (!isGitAvailable || !nestedWorkspaceDir) return
    const info = await getRepositoryInfo(nestedWorkspaceDir)
    expect(info.isGitAvailable).toBe(true)
    expect(info.isRepository).toBe(true)
    expect(info.rootPath).toBe(path.normalize(tempRepoDir!))
  })

  it('3. gracefully handles non-Git folder', async () => {
    if (!nonGitDir) return
    const info = await getRepositoryInfo(nonGitDir)
    expect(info.isGitAvailable).toBe(true)
    expect(info.isRepository).toBe(false)

    const status = await getGitStatus(nonGitDir)
    expect(status.isRepository).toBe(false)
    expect(status.files).toHaveLength(0)
  })

  it('4. distinguishes staged, unstaged, partially staged, untracked, added, deleted, renamed files', async () => {
    if (!isGitAvailable || !tempRepoDir) return
    const status = await getGitStatus(tempRepoDir)
    expect(status.isRepository).toBe(true)
    expect(status.files.length).toBeGreaterThanOrEqual(6)

    // Staged modification (de.json)
    const de = status.files.find((f) => f.filename === 'de.json')
    expect(de).toBeDefined()
    expect(de?.stagingStatus).toBe('staged')
    expect(de?.status).toBe('modified')
    expect(de?.isLocalization).toBe(true)

    // Unstaged modification (en.json)
    const en = status.files.find((f) => f.filename === 'en.json')
    expect(en).toBeDefined()
    expect(en?.stagingStatus).toBe('unstaged')
    expect(en?.status).toBe('modified')
    expect(en?.isLocalization).toBe(true)

    // Partially staged (src/index.ts)
    const index = status.files.find((f) => f.filename === 'index.ts')
    expect(index).toBeDefined()
    expect(index?.stagingStatus).toBe('partially_staged')
    expect(index?.isLocalization).toBe(false)

    // Untracked (uk.json)
    const uk = status.files.find((f) => f.filename === 'uk.json')
    expect(uk).toBeDefined()
    expect(uk?.stagingStatus).toBe('untracked')
    expect(uk?.status).toBe('untracked')
    expect(uk?.isLocalization).toBe(true)

    // Staged added (es.json)
    const es = status.files.find((f) => f.filename === 'es.json')
    expect(es).toBeDefined()
    expect(es?.stagingStatus).toBe('staged')
    expect(es?.status).toBe('added')
    expect(es?.isLocalization).toBe(true)

    // Staged renamed (renamed_es.json)
    const renamed = status.files.find((f) => f.filename === 'renamed_es.json')
    expect(renamed).toBeDefined()
    expect(renamed?.stagingStatus).toBe('staged')
    expect(renamed?.status).toBe('renamed')
    expect(renamed?.oldPath).toContain('to_rename.json')

    // Staged deleted (to_delete.json)
    const deleted = status.files.find((f) => f.filename === 'to_delete.json')
    expect(deleted).toBeDefined()
    expect(deleted?.stagingStatus).toBe('staged')
    expect(deleted?.status).toBe('deleted')
  })

  it('5. filters working files by localization', async () => {
    if (!isGitAvailable || !tempRepoDir) return
    const status = await getGitStatus(tempRepoDir)
    const locOnly = filterLocalizationFiles(status.files)

    expect(locOnly.every((f) => f.isLocalization)).toBe(true)
    expect(locOnly.some((f) => f.filename === 'index.ts')).toBe(false)
    expect(locOnly.some((f) => f.filename === 'en.json')).toBe(true)
  })

  it('6. inspects commit history and filters localization commits', async () => {
    if (!isGitAvailable || !tempRepoDir) return
    const allCommits = await getGitLog(tempRepoDir, 20)
    expect(allCommits).toHaveLength(2)

    const locCommits = filterLocalizationCommits(allCommits)
    expect(locCommits).toHaveLength(1)
    expect(locCommits[0].subject).toContain('initial commit with i18n')
    expect(locCommits[0].isLocalizationCommit).toBe(true)
    expect(locCommits[0].localizationFilesCount).toBe(2)
  })

  it('7. inspects commit details with changed files breakdown', async () => {
    if (!isGitAvailable || !tempRepoDir) return
    const allCommits = await getGitLog(tempRepoDir, 20)
    const initialCommit = allCommits.find((c) => c.subject.includes('initial commit'))
    expect(initialCommit).toBeDefined()

    const details = await getCommitDetails(tempRepoDir, initialCommit!.hash)
    expect(details.hash).toBe(initialCommit!.hash)
    expect(details.authorName).toBe('Integration Bot')
    expect(details.changedFiles.length).toBeGreaterThanOrEqual(5)

    const enChange = details.changedFiles.find((f) => f.filename === 'en.json')
    expect(enChange).toBeDefined()
    expect(enChange?.isLocalization).toBe(true)
    expect(enChange?.languageCode).toBe('en')
  })

  it('8. inspects file diff for working changes and commits', async () => {
    if (!isGitAvailable || !tempRepoDir) return
    const workingDiff = await getFileDiff(tempRepoDir, 'locales/en.json')
    expect(workingDiff.filePath).toContain('locales/en.json')
    expect(workingDiff.diff).toContain('+')
    expect(workingDiff.additions).toBeGreaterThan(0)

    const parsedLines = parseDiffContent(workingDiff.diff)
    expect(parsedLines.some((l) => l.type === 'addition')).toBe(true)
  })
})
