import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {
  parsePorcelainStatus,
  parseNumstatOutput,
  parseGitLogOutput,
  validateBranchName,
  parseBranchOutput,
  checkGitAvailable,
  getRepositoryInfo,
  getGitStatus,
  getGitLog,
  getCommitDetails,
  getFileDiff,
  getGitBranches,
  switchGitBranch,
  createGitBranch,
  commitGitSelected,
  sanitizeGitUrl,
  parseGitRemoteOutput,
  parseAheadBehindOutput,
  classifyGitError,
  checkUnfinishedOperation,
  getGitRemotes,
  getGitSyncStatus,
  fetchGit,
  pullGit,
  pushGit,
  runGit,
} from './gitService'

describe('gitService pure parsers', () => {
  describe('validateBranchName', () => {
    it('rejects empty input', () => {
      expect(validateBranchName('').valid).toBe(false)
      expect(validateBranchName('   ').valid).toBe(false)
    })

    it('rejects spaces', () => {
      expect(validateBranchName('my branch').valid).toBe(false)
    })

    it('rejects leading/trailing slashes and trailing dots', () => {
      expect(validateBranchName('/branch').valid).toBe(false)
      expect(validateBranchName('branch/').valid).toBe(false)
      expect(validateBranchName('branch.').valid).toBe(false)
    })

    it('rejects consecutive slashes, dots, and @{', () => {
      expect(validateBranchName('branch..name').valid).toBe(false)
      expect(validateBranchName('branch//name').valid).toBe(false)
      expect(validateBranchName('branch@{1}').valid).toBe(false)
    })

    it('rejects invalid characters (~, ^, :, ?, *, [, \\)', () => {
      expect(validateBranchName('feat~1').valid).toBe(false)
      expect(validateBranchName('feat^').valid).toBe(false)
      expect(validateBranchName('feat:main').valid).toBe(false)
      expect(validateBranchName('feat?').valid).toBe(false)
      expect(validateBranchName('feat*').valid).toBe(false)
      expect(validateBranchName('feat[1]').valid).toBe(false)
      expect(validateBranchName('feat\\test').valid).toBe(false)
    })

    it('rejects names ending with .lock', () => {
      expect(validateBranchName('main.lock').valid).toBe(false)
    })

    it('accepts valid branch names', () => {
      expect(validateBranchName('main').valid).toBe(true)
      expect(validateBranchName('feature/my-branch').valid).toBe(true)
      expect(validateBranchName('v1.0.0-rc1').valid).toBe(true)
      expect(validateBranchName('ветка-перевода').valid).toBe(true)
    })
  })

  describe('parseBranchOutput', () => {
    it('parses branch output and orders current branch first then alphabetically', () => {
      const output = [
        ' \x00feature/loc-fr\x00abc1234\x00origin/feature/loc-fr',
        '*\x00main\x00def5678\x00origin/main',
        ' \x00develop\x007890abc\x00',
        ' \x00feature/loc-de\x001234def\x00',
      ].join('\n')

      const result = parseBranchOutput(output)
      expect(result.currentBranch).toBe('main')
      expect(result.isDetachedHead).toBe(false)
      expect(result.branches).toHaveLength(4)

      // Current branch first
      expect(result.branches[0].name).toBe('main')
      expect(result.branches[0].isCurrent).toBe(true)
      expect(result.branches[0].upstream).toBe('origin/main')

      // Rest alphabetically
      expect(result.branches[1].name).toBe('develop')
      expect(result.branches[1].isCurrent).toBe(false)
      expect(result.branches[2].name).toBe('feature/loc-de')
      expect(result.branches[3].name).toBe('feature/loc-fr')
    })

    it('correctly detects detached HEAD', () => {
      const output = [
        '*\x00(HEAD detached at a1b2c3d)\x00a1b2c3d\x00',
        ' \x00main\x00def5678\x00',
        ' \x00develop\x007890abc\x00',
      ].join('\n')

      const result = parseBranchOutput(output)
      expect(result.isDetachedHead).toBe(true)
      expect(result.currentBranch).toBe('HEAD (a1b2c3d)')
      expect(result.branches).toHaveLength(2)
      expect(result.branches[0].name).toBe('develop')
      expect(result.branches[1].name).toBe('main')
    })

    it('handles single branch repository', () => {
      const output = '*\x00main\x00def5678\x00'
      const result = parseBranchOutput(output)
      expect(result.currentBranch).toBe('main')
      expect(result.isDetachedHead).toBe(false)
      expect(result.branches).toHaveLength(1)
      expect(result.branches[0].name).toBe('main')
    })
  })
  describe('parsePorcelainStatus', () => {
    it('correctly distinguishes staged, unstaged, partially staged, and untracked files', () => {
      const porcelain = [
        'M  locales/en.json',
        ' M locales/de.json',
        'MM locales/ru.json',
        'A  locales/es.json',
        '?? locales/fr.json',
        'D  locales/it.json',
        ' D locales/pt.json',
        'R  locales/old_ja.json -> locales/ja.json',
        ' M src/App.tsx',
      ].join('\n')

      const numstats = new Map<string, { additions: number; deletions: number }>([
        ['locales/en.json', { additions: 5, deletions: 2 }],
        ['locales/de.json', { additions: 1, deletions: 0 }],
        ['locales/ru.json', { additions: 3, deletions: 3 }],
        ['locales/es.json', { additions: 10, deletions: 0 }],
        ['locales/fr.json', { additions: 20, deletions: 0 }],
        ['src/App.tsx', { additions: 12, deletions: 4 }],
      ])

      const files = parsePorcelainStatus(porcelain, numstats)

      // en.json: staged modified
      const en = files.find((f) => f.path === 'locales/en.json')
      expect(en).toBeDefined()
      expect(en?.status).toBe('modified')
      expect(en?.stagingStatus).toBe('staged')
      expect(en?.hasStagedChanges).toBe(true)
      expect(en?.hasUnstagedChanges).toBe(false)
      expect(en?.additions).toBe(5)
      expect(en?.deletions).toBe(2)
      expect(en?.isLocalization).toBe(true)
      expect(en?.languageCode).toBe('en')

      // de.json: unstaged modified
      const de = files.find((f) => f.path === 'locales/de.json')
      expect(de).toBeDefined()
      expect(de?.status).toBe('modified')
      expect(de?.stagingStatus).toBe('unstaged')
      expect(de?.hasStagedChanges).toBe(false)
      expect(de?.hasUnstagedChanges).toBe(true)

      // ru.json: partially staged (MM)
      const ru = files.find((f) => f.path === 'locales/ru.json')
      expect(ru).toBeDefined()
      expect(ru?.status).toBe('modified')
      expect(ru?.stagingStatus).toBe('partially_staged')
      expect(ru?.hasStagedChanges).toBe(true)
      expect(ru?.hasUnstagedChanges).toBe(true)

      // es.json: staged added
      const es = files.find((f) => f.path === 'locales/es.json')
      expect(es).toBeDefined()
      expect(es?.status).toBe('added')
      expect(es?.stagingStatus).toBe('staged')

      // fr.json: untracked
      const fr = files.find((f) => f.path === 'locales/fr.json')
      expect(fr).toBeDefined()
      expect(fr?.status).toBe('untracked')
      expect(fr?.stagingStatus).toBe('untracked')

      // ja.json: renamed with oldPath
      const ja = files.find((f) => f.path === 'locales/ja.json')
      expect(ja).toBeDefined()
      expect(ja?.status).toBe('renamed')
      expect(ja?.stagingStatus).toBe('staged')
      expect(ja?.oldPath).toBe('locales/old_ja.json')

      // src/App.tsx: non-localization file
      const app = files.find((f) => f.path === 'src/App.tsx')
      expect(app).toBeDefined()
      expect(app?.isLocalization).toBe(false)
      expect(app?.languageCode).toBeUndefined()
    })

    it('handles quoted paths and empty output', () => {
      expect(parsePorcelainStatus('')).toEqual([])

      const quoted = 'M  "path with spaces/en-US.json"'
      const files = parsePorcelainStatus(quoted)
      expect(files).toHaveLength(1)
      expect(files[0]?.path).toBe('path with spaces/en-US.json')
      expect(files[0]?.isLocalization).toBe(true)
    })
  })

  describe('parseNumstatOutput', () => {
    it('parses additions, deletions, binary, and rename paths', () => {
      const numstatText = [
        '10\t5\tlocales/en.json',
        '-\t-\tassets/icon.png',
        '2\t1\tlocales/{old_de.json => de.json}',
      ].join('\n')

      const map = parseNumstatOutput(numstatText)
      expect(map.get('locales/en.json')).toEqual({ additions: 10, deletions: 5 })
      expect(map.get('assets/icon.png')).toEqual({ additions: 0, deletions: 0 })
      expect(map.get('locales/de.json')).toEqual({ additions: 2, deletions: 1 })
    })
  })

  describe('parseGitLogOutput', () => {
    it('parses machine-readable delimiter records and marks localization commits', () => {
      const rawLog = [
        '\x1e1234567890abcdef1234567890abcdef12345678\x1f1234567\x1fAlice Dev\x1falice@example.com\x1f1700000000\x1ffeat: update translations',
        '15\t2\tlocales/en.json',
        '4\t1\tsrc/index.ts',
        '\x1e2345678901abcdef2345678901abcdef23456789\x1f2345678\x1fBob Dev\x1fbob@example.com\x1f1699990000\x1fchore: update styles',
        '20\t5\tsrc/styles.css',
      ].join('\n')

      const commits = parseGitLogOutput(rawLog)
      expect(commits).toHaveLength(2)

      const c1 = commits[0]
      expect(c1.hash).toBe('1234567890abcdef1234567890abcdef12345678')
      expect(c1.shortHash).toBe('1234567')
      expect(c1.authorName).toBe('Alice Dev')
      expect(c1.authorEmail).toBe('alice@example.com')
      expect(c1.subject).toBe('feat: update translations')
      expect(c1.isLocalizationCommit).toBe(true)
      expect(c1.localizationFilesCount).toBe(1)
      expect(c1.totalFilesCount).toBe(2)
      expect(c1.totalAdditions).toBe(19)
      expect(c1.totalDeletions).toBe(3)

      const c2 = commits[1]
      expect(c2.isLocalizationCommit).toBe(false)
      expect(c2.localizationFilesCount).toBe(0)
      expect(c2.totalFilesCount).toBe(1)
    })
  })
})

describe('gitService real repository integration', () => {
  let tempRepoDir: string | null = null
  let isGitAvailable = false

  beforeAll(async () => {
    isGitAvailable = await checkGitAvailable()
    if (!isGitAvailable) {
      console.warn('Git is not available in test environment, skipping real git integration tests')
      return
    }

    // Create a temporary directory for the real git repo
    tempRepoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-test-repo-'))

    // 1. Initialize repository
    await runGit(tempRepoDir, ['init'])
    await runGit(tempRepoDir, ['config', 'user.name', 'Test Bot'])
    await runGit(tempRepoDir, ['config', 'user.email', 'test@example.com'])
    await runGit(tempRepoDir, ['config', 'commit.gpgSign', 'false'])

    // 2. Create localization files and 3. Create non-localization file
    const localesDir = path.join(tempRepoDir, 'locales')
    await fs.mkdir(localesDir, { recursive: true })

    await fs.writeFile(
      path.join(localesDir, 'en.json'),
      JSON.stringify({ hello: 'Hello', world: 'World' }, null, 2),
      'utf8'
    )
    await fs.writeFile(
      path.join(localesDir, 'de.json'),
      JSON.stringify({ hello: 'Hallo', world: 'Welt' }, null, 2),
      'utf8'
    )
    await fs.writeFile(
      path.join(tempRepoDir, 'README.md'),
      '# Test Project\n\nInitial readme text.\n',
      'utf8'
    )

    // 4. Make a commit (mixed localization and non-localization)
    await runGit(tempRepoDir, ['add', '.'])
    await runGit(tempRepoDir, ['commit', '-m', 'Initial commit with translations'])

    // 5. Modify localization file (unstaged)
    await fs.writeFile(
      path.join(localesDir, 'en.json'),
      JSON.stringify({ hello: 'Hello!', world: 'World!', goodbye: 'Bye' }, null, 2),
      'utf8'
    )

    // Stage a change to de.json
    await fs.writeFile(
      path.join(localesDir, 'de.json'),
      JSON.stringify({ hello: 'Hallo!', world: 'Welt!' }, null, 2),
      'utf8'
    )
    await runGit(tempRepoDir, ['add', 'locales/de.json'])

    // 6. Create an untracked localization file
    await fs.writeFile(
      path.join(localesDir, 'uk.json'),
      JSON.stringify({ hello: 'Привіт' }, null, 2),
      'utf8'
    )
  })

  afterAll(async () => {
    if (tempRepoDir) {
      try {
        await fs.rm(tempRepoDir, { recursive: true, force: true })
      } catch {
        // ignore
      }
    }
  })

  it('detects repository info correctly', async () => {
    if (!isGitAvailable || !tempRepoDir) return

    const info = await getRepositoryInfo(tempRepoDir)
    expect(info.isGitAvailable).toBe(true)
    expect(info.isRepository).toBe(true)
    expect(info.rootPath).toBeDefined()
    expect(info.currentBranch).toBeDefined()
  })

  it('inspects Git status with accurate staging states', async () => {
    if (!isGitAvailable || !tempRepoDir) return

    const status = await getGitStatus(tempRepoDir)
    expect(status.isRepository).toBe(true)
    expect(status.files.length).toBeGreaterThanOrEqual(3)

    // en.json should be unstaged
    const en = status.files.find((f) => f.filename === 'en.json')
    expect(en).toBeDefined()
    expect(en?.stagingStatus).toBe('unstaged')
    expect(en?.isLocalization).toBe(true)
    expect(en?.languageCode).toBe('en')

    // de.json should be staged
    const de = status.files.find((f) => f.filename === 'de.json')
    expect(de).toBeDefined()
    expect(de?.stagingStatus).toBe('staged')
    expect(de?.isLocalization).toBe(true)

    // uk.json should be untracked
    const uk = status.files.find((f) => f.filename === 'uk.json')
    expect(uk).toBeDefined()
    expect(uk?.stagingStatus).toBe('untracked')
    expect(uk?.isLocalization).toBe(true)
  })

  it('inspects commit history and filtering', async () => {
    if (!isGitAvailable || !tempRepoDir) return

    const log = await getGitLog(tempRepoDir)
    expect(log.length).toBeGreaterThanOrEqual(1)
    expect(log[0].subject).toBe('Initial commit with translations')
    expect(log[0].isLocalizationCommit).toBe(true)
    expect(log[0].localizationFilesCount).toBe(2)
  })

  it('inspects commit details', async () => {
    if (!isGitAvailable || !tempRepoDir) return

    const log = await getGitLog(tempRepoDir)
    const firstCommit = log[0]
    expect(firstCommit).toBeDefined()

    const details = await getCommitDetails(tempRepoDir, firstCommit.hash)
    expect(details.hash).toBe(firstCommit.hash)
    expect(details.subject).toBe(firstCommit.subject)
    expect(details.changedFiles.length).toBeGreaterThanOrEqual(3)

    const enFile = details.changedFiles.find((f) => f.filename === 'en.json')
    expect(enFile).toBeDefined()
    expect(enFile?.isLocalization).toBe(true)
  })

  it('inspects file diff for working tree changes', async () => {
    if (!isGitAvailable || !tempRepoDir) return

    const diff = await getFileDiff(tempRepoDir, 'locales/en.json')
    expect(diff.filePath).toContain('locales/en.json')
    expect(diff.diff).toContain('+')
    expect(diff.additions).toBeGreaterThan(0)
  })

  describe('Real Git Repository Branch Management', () => {
    let branchRepoDir: string | null = null

    beforeAll(async () => {
      if (!isGitAvailable) return
      branchRepoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-branch-verification-'))
      await runGit(branchRepoDir, ['init'])
      await runGit(branchRepoDir, ['config', 'user.name', 'Branch Tester'])
      await runGit(branchRepoDir, ['config', 'user.email', 'branch@test.local'])
      await runGit(branchRepoDir, ['config', 'commit.gpgSign', 'false'])

      const locales = path.join(branchRepoDir, 'locales')
      await fs.mkdir(locales, { recursive: true })
      await fs.writeFile(
        path.join(locales, 'en.json'),
        JSON.stringify({ greeting: 'Hello' }, null, 2),
        'utf8'
      )
      await runGit(branchRepoDir, ['add', '.'])
      await runGit(branchRepoDir, ['commit', '-m', 'initial commit on main'])
    })

    afterAll(async () => {
      if (branchRepoDir) {
        try {
          await fs.rm(branchRepoDir, { recursive: true, force: true })
        } catch {
          // ignore
        }
      }
    })

    it('lists initial branch correctly', async () => {
      if (!isGitAvailable || !branchRepoDir) return
      const res = await getGitBranches(branchRepoDir)
      expect(res.error).toBeUndefined()
      expect(res.isDetachedHead).toBe(false)
      expect(res.branches.length).toBeGreaterThanOrEqual(1)
      expect(res.branches[0].isCurrent).toBe(true)
      expect(res.currentBranch).toBe(res.branches[0].name)
    })

    it('creates new branch and switches to it', async () => {
      if (!isGitAvailable || !branchRepoDir) return
      const createRes = await createGitBranch(branchRepoDir, 'feature/new-locale')
      expect(createRes.success).toBe(true)
      expect(createRes.branchName).toBe('feature/new-locale')

      const listRes = await getGitBranches(branchRepoDir)
      expect(listRes.currentBranch).toBe('feature/new-locale')
      expect(listRes.branches[0].name).toBe('feature/new-locale')
      expect(listRes.branches[0].isCurrent).toBe(true)
    })

    it('creates and lists unicode branch names', async () => {
      if (!isGitAvailable || !branchRepoDir) return
      const createRes = await createGitBranch(branchRepoDir, 'ветка-локализации')
      expect(createRes.success).toBe(true)

      const listRes = await getGitBranches(branchRepoDir)
      expect(listRes.currentBranch).toBe('ветка-локализации')
      expect(listRes.branches.some((b) => b.name === 'ветка-локализации')).toBe(true)
    })

    it('switches between clean branches and verifies file content updates', async () => {
      if (!isGitAvailable || !branchRepoDir) return
      const initialBranch = (await getGitBranches(branchRepoDir)).branches.find((b) => b.name !== 'ветка-локализации')!.name

      // Add a file in current branch and commit
      const locales = path.join(branchRepoDir, 'locales')
      await fs.writeFile(
        path.join(locales, 'ru.json'),
        JSON.stringify({ greeting: 'Привет' }, null, 2),
        'utf8'
      )
      await runGit(branchRepoDir, ['add', '.'])
      await runGit(branchRepoDir, ['commit', '-m', 'add ru.json on unicode branch'])

      // Switch to initial branch
      const switchRes = await switchGitBranch(branchRepoDir, initialBranch)
      expect(switchRes.success).toBe(true)
      expect(switchRes.currentBranch).toBe(initialBranch)

      // ru.json should not exist on initialBranch
      let fileExists = true
      try {
        await fs.access(path.join(locales, 'ru.json'))
      } catch {
        fileExists = false
      }
      expect(fileExists).toBe(false)

      // Switch back to unicode branch
      const switchBackRes = await switchGitBranch(branchRepoDir, 'ветка-локализации')
      expect(switchBackRes.success).toBe(true)
      expect(switchBackRes.currentBranch).toBe('ветка-локализации')

      // ru.json should now exist
      const ruContent = await fs.readFile(path.join(locales, 'ru.json'), 'utf8')
      expect(ruContent).toContain('Привет')
    })

    it('refuses to switch and preserves local changes when uncommitted modifications conflict', async () => {
      if (!isGitAvailable || !branchRepoDir) return
      const locales = path.join(branchRepoDir, 'locales')

      // 1. In ветка-локализации, modify en.json and commit
      await fs.writeFile(
        path.join(locales, 'en.json'),
        JSON.stringify({ greeting: 'Hello Branch A Modification' }, null, 2),
        'utf8'
      )
      await runGit(branchRepoDir, ['add', 'locales/en.json'])
      await runGit(branchRepoDir, ['commit', '-m', 'update en.json on branch A'])

      // 2. Create another branch 'branch-b'
      await createGitBranch(branchRepoDir, 'branch-b')

      // In branch-b, commit a different change to en.json
      await fs.writeFile(
        path.join(locales, 'en.json'),
        JSON.stringify({ greeting: 'Hello Branch B Baseline' }, null, 2),
        'utf8'
      )
      await runGit(branchRepoDir, ['add', 'locales/en.json'])
      await runGit(branchRepoDir, ['commit', '-m', 'update en.json on branch B'])

      // Now create an uncommitted dirty local modification on branch-b
      const dirtyContent = JSON.stringify({ greeting: 'CRITICAL UNCOMMITTED WORK' }, null, 2)
      await fs.writeFile(path.join(locales, 'en.json'), dirtyContent, 'utf8')

      // 3. Attempt switching to ветка-локализации (where en.json differs)
      const switchRes = await switchGitBranch(branchRepoDir, 'ветка-локализации')

      // Git must reject checkout and application flags blockedByWorkingChanges
      expect(switchRes.success).toBe(false)
      expect(switchRes.blockedByWorkingChanges).toBe(true)

      // Current branch MUST remain branch-b
      const listRes = await getGitBranches(branchRepoDir)
      expect(listRes.currentBranch).toBe('branch-b')

      // Local dirty work MUST NOT be overwritten or lost!
      const currentContent = await fs.readFile(path.join(locales, 'en.json'), 'utf8')
      expect(currentContent).toBe(dirtyContent)

      // Revert dirty content for subsequent clean tests
      await runGit(branchRepoDir, ['checkout', '--', 'locales/en.json'])
    })

    it('handles detached HEAD state and allows switching back to named branch', async () => {
      if (!isGitAvailable || !branchRepoDir) return
      const log = await getGitLog(branchRepoDir, 2)
      const targetHash = log[1].hash

      // Detach HEAD to target commit
      await runGit(branchRepoDir, ['checkout', targetHash])

      const listRes = await getGitBranches(branchRepoDir)
      expect(listRes.isDetachedHead).toBe(true)
      expect(listRes.currentBranch).toContain('HEAD')

      // Switch back to named branch
      const switchRes = await switchGitBranch(branchRepoDir, 'branch-b')
      expect(switchRes.success).toBe(true)
      expect(switchRes.isDetachedHead).toBe(false)
      expect(switchRes.currentBranch).toBe('branch-b')
    })
  })

  describe('Real Git Repository Selective Commit Workflow', () => {
    let commitRepoDir: string | null = null

    beforeAll(async () => {
      if (!isGitAvailable) return
      commitRepoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'i18n-commit-test-'))
      await runGit(commitRepoDir, ['init'])
      await runGit(commitRepoDir, ['config', 'user.name', 'Tester'])
      await runGit(commitRepoDir, ['config', 'user.email', 'tester@example.com'])

      // Baseline commit with localization files and source files
      await fs.mkdir(path.join(commitRepoDir, 'locales'), { recursive: true })
      await fs.mkdir(path.join(commitRepoDir, 'src'), { recursive: true })

      await fs.writeFile(
        path.join(commitRepoDir, 'locales', 'en.json'),
        JSON.stringify({ hello: 'Hello', save: 'Save' }, null, 2),
        'utf8'
      )
      await fs.writeFile(
        path.join(commitRepoDir, 'locales', 'de.json'),
        JSON.stringify({ hello: 'Hallo', save: 'Speichern' }, null, 2),
        'utf8'
      )
      await fs.writeFile(
        path.join(commitRepoDir, 'src', 'index.ts'),
        'export const app = "main";\n',
        'utf8'
      )
      await fs.writeFile(
        path.join(commitRepoDir, 'extra.txt'),
        'baseline extra file\n',
        'utf8'
      )

      await runGit(commitRepoDir, ['add', '.'])
      await runGit(commitRepoDir, ['commit', '-m', 'Initial baseline commit'])
    })

    afterAll(async () => {
      if (commitRepoDir) {
        try {
          await fs.rm(commitRepoDir, { recursive: true, force: true })
        } catch {
          // ignore cleanup errors on windows locks
        }
      }
    })

    it('rejects empty commit message or empty file selection', async () => {
      if (!isGitAvailable || !commitRepoDir) return

      const emptyMsgRes = await commitGitSelected(commitRepoDir, ['locales/en.json'], '')
      expect(emptyMsgRes.success).toBe(false)
      expect(emptyMsgRes.error).toContain('Commit message cannot be empty')

      const whitespaceMsgRes = await commitGitSelected(commitRepoDir, ['locales/en.json'], '   ')
      expect(whitespaceMsgRes.success).toBe(false)

      const emptyFilesRes = await commitGitSelected(commitRepoDir, [], 'Valid message')
      expect(emptyFilesRes.success).toBe(false)
      expect(emptyFilesRes.error).toContain('No files selected')
    })

    it('Scenario 8: blocks commit when unrelated staged file exists without touching working tree', async () => {
      if (!isGitAvailable || !commitRepoDir) return

      // File A = locales/en.json
      // File B = locales/de.json
      // File C = src/index.ts
      // File D = extra.txt (pre-staged)

      // Modify all 4 files
      await fs.writeFile(
        path.join(commitRepoDir, 'locales', 'en.json'),
        JSON.stringify({ hello: 'Hello modified A', save: 'Save' }, null, 2),
        'utf8'
      )
      await fs.writeFile(
        path.join(commitRepoDir, 'locales', 'de.json'),
        JSON.stringify({ hello: 'Hallo modified B', save: 'Speichern' }, null, 2),
        'utf8'
      )
      await fs.writeFile(
        path.join(commitRepoDir, 'src', 'index.ts'),
        'export const app = "modified C";\n',
        'utf8'
      )
      await fs.writeFile(
        path.join(commitRepoDir, 'extra.txt'),
        'modified D pre-staged\n',
        'utf8'
      )

      // Pre-stage D
      await runGit(commitRepoDir, ['add', 'extra.txt'])

      // Attempt to commit only A and B
      const selected = ['locales/en.json', 'locales/de.json']
      const commitRes = await commitGitSelected(commitRepoDir, selected, 'feat: update locales')

      // Commit must be blocked
      expect(commitRes.success).toBe(false)
      expect(commitRes.blockedByUnrelatedStaged).toBe(true)
      expect(commitRes.unrelatedStagedFiles).toBeDefined()
      expect(commitRes.unrelatedStagedFiles).toContain('extra.txt')

      // Verify nothing was reset or discarded
      const statusAfter = await getGitStatus(commitRepoDir)
      expect(statusAfter.files.some((f) => f.path.includes('extra.txt') && (f.hasStagedChanges || f.stagingStatus === 'staged'))).toBe(true)
      expect(statusAfter.files.some((f) => f.path.includes('en.json'))).toBe(true)
      expect(statusAfter.files.some((f) => f.path.includes('de.json'))).toBe(true)
      expect(statusAfter.files.some((f) => f.path.includes('index.ts'))).toBe(true)

      // Contents are intact
      const enContent = await fs.readFile(path.join(commitRepoDir, 'locales', 'en.json'), 'utf8')
      expect(enContent).toContain('Hello modified A')
      const indexContent = await fs.readFile(path.join(commitRepoDir, 'src', 'index.ts'), 'utf8')
      expect(indexContent).toContain('modified C')
    })

    it('Scenario 8 continued: commits only selected files A & B, leaving C uncommitted in working tree', async () => {
      if (!isGitAvailable || !commitRepoDir) return

      // Unstage extra.txt manually to allow clean commit test
      await runGit(commitRepoDir, ['restore', '--staged', 'extra.txt'])

      // Select A and B
      const selected = ['locales/en.json', 'locales/de.json']
      const commitRes = await commitGitSelected(
        commitRepoDir,
        selected,
        'feat(i18n): update EN and DE translations\n\nDetailed multiline explanation.'
      )

      expect(commitRes.success).toBe(true)
      expect(commitRes.commitHash).toBeDefined()
      expect(commitRes.shortHash).toBeDefined()
      expect(commitRes.committedFiles).toBeDefined()
      expect(commitRes.committedFiles).toHaveLength(2)
      expect(commitRes.committedFiles?.some((p) => p.includes('en.json'))).toBe(true)
      expect(commitRes.committedFiles?.some((p) => p.includes('de.json'))).toBe(true)
      expect(commitRes.committedFiles?.some((p) => p.includes('index.ts'))).toBe(false)
      expect(commitRes.committedFiles?.some((p) => p.includes('extra.txt'))).toBe(false)

      // Inspect working tree status: C and D remain modified and uncommitted!
      const statusAfter = await getGitStatus(commitRepoDir)
      const modifiedFiles = statusAfter.files.map((f) => f.path)
      expect(modifiedFiles.some((p) => p.includes('src/index.ts') || p.includes('src\\index.ts'))).toBe(true)
      expect(modifiedFiles.some((p) => p.includes('extra.txt'))).toBe(true)
      expect(modifiedFiles.some((p) => p.includes('en.json'))).toBe(false)
      expect(modifiedFiles.some((p) => p.includes('de.json'))).toBe(false)

      // Verify commit in log and details
      const log = await getGitLog(commitRepoDir, 1)
      expect(log[0].hash).toBe(commitRes.commitHash)
      expect(log[0].subject).toBe('feat(i18n): update EN and DE translations')

      const details = await getCommitDetails(commitRepoDir, commitRes.commitHash!)
      expect(details?.body).toBe('Detailed multiline explanation.')
    })

    it('Scenario 4: handles partially staged file A, committing its complete version while keeping unselected C untouched', async () => {
      if (!isGitAvailable || !commitRepoDir) return

      // Modify A and stage first part
      await fs.writeFile(
        path.join(commitRepoDir, 'locales', 'en.json'),
        JSON.stringify({ hello: 'Hello Staged 1', save: 'Save' }, null, 2),
        'utf8'
      )
      await runGit(commitRepoDir, ['add', 'locales/en.json'])

      // Add second unstaged modification to A
      await fs.writeFile(
        path.join(commitRepoDir, 'locales', 'en.json'),
        JSON.stringify({ hello: 'Hello Complete Version', save: 'Save Updated' }, null, 2),
        'utf8'
      )

      // Modify B (completely unstaged)
      await fs.writeFile(
        path.join(commitRepoDir, 'locales', 'de.json'),
        JSON.stringify({ hello: 'Hallo Complete Version', save: 'Speichern Updated' }, null, 2),
        'utf8'
      )

      // Verify status shows A is partially staged
      const statusPre = await getGitStatus(commitRepoDir)
      const enStat = statusPre.files.find((f) => f.path.includes('en.json'))
      expect(enStat?.stagingStatus).toBe('partially_staged')

      // Commit only A and B
      const commitRes = await commitGitSelected(
        commitRepoDir,
        ['locales/en.json', 'locales/de.json'],
        'feat: commit complete version of A and B'
      )

      expect(commitRes.success).toBe(true)

      // Verify the committed content of A in HEAD is the COMPLETE version
      const headEnShow = await runGit(commitRepoDir, ['show', 'HEAD:locales/en.json'])
      expect(headEnShow.stdout).toContain('Hello Complete Version')
      expect(headEnShow.stdout).toContain('Save Updated')

      // Verify C (src/index.ts) is still untouched in working tree
      const indexContent = await fs.readFile(path.join(commitRepoDir, 'src', 'index.ts'), 'utf8')
      expect(indexContent).toContain('modified C')
    })

    it('Scenario 6: handles added, deleted, modified, and renamed files', async () => {
      if (!isGitAvailable || !commitRepoDir) return

      // 1. Added file (untracked)
      await fs.writeFile(
        path.join(commitRepoDir, 'locales', 'fr.json'),
        JSON.stringify({ hello: 'Bonjour' }, null, 2),
        'utf8'
      )

      // 2. Modified file
      await fs.writeFile(
        path.join(commitRepoDir, 'locales', 'en.json'),
        JSON.stringify({ hello: 'Hello New Epoch', save: 'Save' }, null, 2),
        'utf8'
      )

      // Commit addition and modification
      const commitAddRes = await commitGitSelected(
        commitRepoDir,
        ['locales/fr.json', 'locales/en.json'],
        'feat: add fr.json and update en.json'
      )
      expect(commitAddRes.success).toBe(true)

      // 3. Deleted file
      await fs.unlink(path.join(commitRepoDir, 'locales', 'fr.json'))

      // Commit deletion
      const commitDelRes = await commitGitSelected(
        commitRepoDir,
        ['locales/fr.json'],
        'chore: remove fr.json'
      )
      expect(commitDelRes.success).toBe(true)

      // Verify deletion committed
      const showDel = await getCommitDetails(commitRepoDir, commitDelRes.commitHash!)
      expect(showDel?.changedFiles.some((f) => f.filename === 'fr.json')).toBe(true)
    })

    it('Scenario 3: handles hook failure with hookFailed: true and leaves user state untouched', async () => {
      if (!isGitAvailable || !commitRepoDir) return

      const hooksDir = path.join(commitRepoDir, '.git', 'hooks')
      await fs.mkdir(hooksDir, { recursive: true })
      const preCommitPath = path.join(hooksDir, 'pre-commit')

      // Create a failing hook script
      const hookScript = '#!/bin/sh\necho "Pre-commit hook validation failed for testing" >&2\nexit 1\n'
      await fs.writeFile(preCommitPath, hookScript, { mode: 0o777 })

      // Modify en.json
      await fs.writeFile(
        path.join(commitRepoDir, 'locales', 'en.json'),
        JSON.stringify({ hello: 'Hello with failing hook' }, null, 2),
        'utf8'
      )

      const commitRes = await commitGitSelected(
        commitRepoDir,
        ['locales/en.json'],
        'feat: test hook failure'
      )

      // Must report failure and hookFailed = true
      expect(commitRes.success).toBe(false)
      expect(commitRes.hookFailed).toBe(true)
      expect(commitRes.error).toContain('Pre-commit hook')

      // Staged files remain staged and changes are not lost
      const statusAfter = await getGitStatus(commitRepoDir)
      expect(statusAfter.files.some((f) => f.path.includes('en.json'))).toBe(true)

      // Remove hook for cleanup and unstage en.json for clean subsequent tests
      await fs.unlink(preCommitPath)
      await runGit(commitRepoDir, ['restore', '--staged', 'locales/en.json'])
    })

    it('Scenario 5: rejects stale selection if file is no longer in working changes', async () => {
      if (!isGitAvailable || !commitRepoDir) return

      const staleRes = await commitGitSelected(
        commitRepoDir,
        ['locales/non-existent-file.json'],
        'feat: stale selection test'
      )

      expect(staleRes.success).toBe(false)
      expect(staleRes.staleSelection).toBe(true)
    })
  })

  describe('Git Remote Sync Pure Unit Tests', () => {
    describe('sanitizeGitUrl', () => {
      it('redacts password from HTTPS URLs', () => {
        expect(sanitizeGitUrl('https://user:secret123@github.com/org/repo.git')).toBe(
          'https://***@github.com/org/repo.git'
        )
      })

      it('redacts access tokens from HTTPS URLs', () => {
        expect(sanitizeGitUrl('https://ghp_abcdef1234567890@github.com/org/repo.git')).toBe(
          'https://***@github.com/org/repo.git'
        )
      })

      it('redacts password from SSH/SCP URLs with embedded password', () => {
        expect(sanitizeGitUrl('user:password123@git.example.com:group/project.git')).toBe(
          '***@git.example.com:group/project.git'
        )
      })

      it('preserves clean HTTPS and SSH key URLs', () => {
        expect(sanitizeGitUrl('https://github.com/org/repo.git')).toBe('https://github.com/org/repo.git')
        expect(sanitizeGitUrl('git@github.com:org/repo.git')).toBe('git@github.com:org/repo.git')
      })

      it('handles empty and null safely', () => {
        expect(sanitizeGitUrl('')).toBe('')
      })
    })

    describe('parseGitRemoteOutput', () => {
      it('returns empty array when output is empty', () => {
        expect(parseGitRemoteOutput('')).toEqual([])
      })

      it('parses single remote with fetch and push URLs', () => {
        const output = [
          'origin\thttps://user:pass@github.com/org/repo.git (fetch)',
          'origin\thttps://user:pass@github.com/org/repo.git (push)',
        ].join('\n')

        const remotes = parseGitRemoteOutput(output)
        expect(remotes).toHaveLength(1)
        expect(remotes[0].name).toBe('origin')
        expect(remotes[0].fetchUrl).toBe('https://***@github.com/org/repo.git')
        expect(remotes[0].pushUrl).toBe('https://***@github.com/org/repo.git')
      })

      it('parses multiple remotes and sorts origin first then alphabetically', () => {
        const output = [
          'upstream\thttps://github.com/original/repo.git (fetch)',
          'upstream\thttps://github.com/original/repo.git (push)',
          'backup\thttps://backup.example.com/repo.git (fetch)',
          'backup\thttps://backup.example.com/repo.git (push)',
          'origin\thttps://github.com/myfork/repo.git (fetch)',
          'origin\thttps://github.com/myfork/repo.git (push)',
        ].join('\n')

        const remotes = parseGitRemoteOutput(output)
        expect(remotes).toHaveLength(3)
        expect(remotes[0].name).toBe('origin')
        expect(remotes[1].name).toBe('backup')
        expect(remotes[2].name).toBe('upstream')
      })
    })

    describe('parseAheadBehindOutput', () => {
      it('parses 0/0, N/0, 0/N, and N/M correctly', () => {
        expect(parseAheadBehindOutput('0\t0')).toEqual({ ahead: 0, behind: 0 })
        expect(parseAheadBehindOutput('3\t0')).toEqual({ ahead: 3, behind: 0 })
        expect(parseAheadBehindOutput('0\t5')).toEqual({ ahead: 0, behind: 5 })
        expect(parseAheadBehindOutput('2\t4')).toEqual({ ahead: 2, behind: 4 })
        expect(parseAheadBehindOutput('  12   8  ')).toEqual({ ahead: 12, behind: 8 })
      })

      it('handles empty or malformed output gracefully', () => {
        expect(parseAheadBehindOutput('')).toEqual({ ahead: 0, behind: 0 })
        expect(parseAheadBehindOutput('invalid')).toEqual({ ahead: 0, behind: 0 })
      })
    })

    describe('classifyGitError', () => {
      it('identifies authentication errors', () => {
        expect(classifyGitError('fatal: Authentication failed for https://github.com/...')).toBe(
          'auth_failed'
        )
        expect(classifyGitError('Permission denied (publickey).')).toBe('auth_failed')
        expect(classifyGitError('fatal: could not read Username for https://...')).toBe('auth_failed')
      })

      it('identifies network errors', () => {
        expect(classifyGitError('fatal: unable to access: Could not resolve host: github.com')).toBe(
          'network_failed'
        )
        expect(classifyGitError('fatal: Failed to connect to server: Connection timed out')).toBe(
          'network_failed'
        )
      })

      it('identifies push rejected errors', () => {
        expect(
          classifyGitError(
            'To https://github.com/org/repo.git\n ! [rejected] main -> main (non-fast-forward)\nerror: failed to push some refs'
          )
        ).toBe('push_rejected')
      })

      it('identifies conflict errors', () => {
        expect(
          classifyGitError(
            'CONFLICT (content): Merge conflict in locales/en.json\nAutomatic merge failed; fix conflicts and then commit the result.'
          )
        ).toBe('conflict')
      })

      it('identifies blocked by uncommitted changes errors', () => {
        expect(
          classifyGitError(
            'error: Your local changes to the following files would be overwritten by merge:\n  locales/en.json\nPlease commit your changes or stash them before you merge.'
          )
        ).toBe('blocked_by_changes')
      })

      it('identifies unfinished operations', () => {
        expect(classifyGitError('fatal: You have not concluded your merge (MERGE_HEAD exists).')).toBe(
          'unfinished_operation'
        )
      })

      it('identifies no upstream error', () => {
        expect(
          classifyGitError(
            'fatal: The current branch main has no upstream branch.\nTo push the current branch and set the remote as upstream, use\n  git push --set-upstream origin main'
          )
        ).toBe('no_upstream')
      })
    })
  })

  describe('Real Git Repository Remote Synchronization Integration Tests', { timeout: 25000 }, () => {
    let localRepoDir: string | null = null
    let bareRemoteDir: string | null = null
    let peerRepoDir: string | null = null

    beforeAll(async () => {
      if (!isGitAvailable) return

      // 1. Create a bare remote repository (serves as the remote origin)
      bareRemoteDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-bare-remote-'))
      await runGit(bareRemoteDir, ['init', '--bare'])

      // 2. Create the primary local repository
      localRepoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-local-repo-'))
      await runGit(localRepoDir, ['init'])
      await runGit(localRepoDir, ['config', 'user.name', 'Local Tester'])
      await runGit(localRepoDir, ['config', 'user.email', 'local@test.com'])
      await runGit(localRepoDir, ['config', 'commit.gpgSign', 'false'])
      await runGit(localRepoDir, ['config', 'pull.rebase', 'false'])

      // Initial commit in local repo
      await fs.mkdir(path.join(localRepoDir, 'locales'), { recursive: true })
      await fs.writeFile(
        path.join(localRepoDir, 'locales', 'en.json'),
        JSON.stringify({ greeting: 'Hello' }, null, 2),
        'utf8'
      )
      await runGit(localRepoDir, ['add', 'locales/en.json'])
      await runGit(localRepoDir, ['commit', '-m', 'initial local commit'])
    })

    afterAll(async () => {
      if (localRepoDir) {
        try {
          await fs.rm(localRepoDir, { recursive: true, force: true })
        } catch {
          // ignore
        }
      }
      if (bareRemoteDir) {
        try {
          await fs.rm(bareRemoteDir, { recursive: true, force: true })
        } catch {
          // ignore
        }
      }
      if (peerRepoDir) {
        try {
          await fs.rm(peerRepoDir, { recursive: true, force: true })
        } catch {
          // ignore
        }
      }
    })

    it('Scenario 1: reports no remotes when repository has no remotes configured', async () => {
      if (!isGitAvailable || !localRepoDir) return

      const remotes = await getGitRemotes(localRepoDir)
      expect(remotes).toEqual([])

      const sync = await getGitSyncStatus(localRepoDir)
      expect(sync.hasRemote).toBe(false)
      expect(sync.hasUpstream).toBe(false)
      expect(sync.ahead).toBe(0)
      expect(sync.behind).toBe(0)

      // Fetch without remote fails gracefully
      const fetchRes = await fetchGit(localRepoDir)
      expect(fetchRes.success).toBe(false)
      expect(fetchRes.errorCode).toBe('no_remote')

      // Pull without remote fails gracefully
      const pullRes = await pullGit(localRepoDir)
      expect(pullRes.success).toBe(false)
      expect(pullRes.errorCode).toBe('no_remote')
    })

    it('Scenario 2: configures remote and detects branch with no upstream', async () => {
      if (!isGitAvailable || !localRepoDir || !bareRemoteDir) return

      // Add bare remote as 'origin'
      const bareUrl = bareRemoteDir.replace(/\\/g, '/')
      await runGit(localRepoDir, ['remote', 'add', 'origin', bareUrl])

      const remotes = await getGitRemotes(localRepoDir)
      expect(remotes).toHaveLength(1)
      expect(remotes[0].name).toBe('origin')

      const sync = await getGitSyncStatus(localRepoDir)
      expect(sync.hasRemote).toBe(true)
      expect(sync.hasUpstream).toBe(false)
      expect(sync.isSynchronized).toBe(false)
    })

    it('Scenario 3: sets upstream on push and verifies up-to-date tracking', async () => {
      if (!isGitAvailable || !localRepoDir) return

      const branches = await getGitBranches(localRepoDir)
      const currentBranch = branches.currentBranch || 'main'

      // Push with set-upstream
      const pushRes = await pushGit(localRepoDir, 'origin', currentBranch, true)
      expect(pushRes.success).toBe(true)
      expect(pushRes.remote).toBe('origin')

      // Now sync status should be up-to-date
      const sync = await getGitSyncStatus(localRepoDir)
      expect(sync.hasUpstream).toBe(true)
      expect(sync.upstreamRemote).toBe('origin')
      expect(sync.ahead).toBe(0)
      expect(sync.behind).toBe(0)
      expect(sync.isSynchronized).toBe(true)
      expect(sync.isDiverged).toBe(false)
    })

    it('Scenario 4: detects ahead state when new local commit is made, pushes successfully', async () => {
      if (!isGitAvailable || !localRepoDir) return

      // Create a new local commit
      await fs.writeFile(
        path.join(localRepoDir, 'locales', 'en.json'),
        JSON.stringify({ greeting: 'Hello Local Advance' }, null, 2),
        'utf8'
      )
      await runGit(localRepoDir, ['add', 'locales/en.json'])
      await runGit(localRepoDir, ['commit', '-m', 'local commit ahead'])

      // Check sync status -> should be 1 ahead, 0 behind
      const syncAhead = await getGitSyncStatus(localRepoDir)
      expect(syncAhead.ahead).toBe(1)
      expect(syncAhead.behind).toBe(0)
      expect(syncAhead.isSynchronized).toBe(false)

      // Push to origin
      const pushRes = await pushGit(localRepoDir)
      expect(pushRes.success).toBe(true)

      // Post-push sync status -> 0 ahead, 0 behind
      const syncAfter = await getGitSyncStatus(localRepoDir)
      expect(syncAfter.ahead).toBe(0)
      expect(syncAfter.behind).toBe(0)
      expect(syncAfter.isSynchronized).toBe(true)
    })

    it('Scenario 5: detects behind state after Fetch, verifies working tree is NOT modified by Fetch', async () => {
      if (!isGitAvailable || !localRepoDir || !bareRemoteDir) return

      // Clone peer repo from bare remote
      peerRepoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-peer-repo-'))
      const bareUrl = bareRemoteDir.replace(/\\/g, '/')
      await runGit(peerRepoDir, ['clone', bareUrl, '.'])
      await runGit(peerRepoDir, ['config', 'user.name', 'Peer Tester'])
      await runGit(peerRepoDir, ['config', 'user.email', 'peer@test.com'])
      await runGit(peerRepoDir, ['config', 'commit.gpgSign', 'false'])
      await runGit(peerRepoDir, ['config', 'pull.rebase', 'false'])

      // In peer repo, commit and push a new remote change
      await fs.writeFile(
        path.join(peerRepoDir, 'locales', 'de.json'),
        JSON.stringify({ greeting: 'Hallo von Peer' }, null, 2),
        'utf8'
      )
      await runGit(peerRepoDir, ['add', 'locales/de.json'])
      await runGit(peerRepoDir, ['commit', '-m', 'peer remote commit'])
      await runGit(peerRepoDir, ['push', 'origin', 'HEAD'])

      // Local repo working tree should NOT have de.json yet
      const deExistsBefore = await fs.access(path.join(localRepoDir, 'locales', 'de.json')).then(() => true).catch(() => false)
      expect(deExistsBefore).toBe(false)

      // Execute Fetch in local repo
      const fetchRes = await fetchGit(localRepoDir, 'origin')
      expect(fetchRes.success).toBe(true)

      // Working tree MUST still remain untouched after Fetch!
      const deExistsAfterFetch = await fs.access(path.join(localRepoDir, 'locales', 'de.json')).then(() => true).catch(() => false)
      expect(deExistsAfterFetch).toBe(false)

      // Sync status should now report 0 ahead, 1 behind
      const syncBehind = await getGitSyncStatus(localRepoDir)
      expect(syncBehind.ahead).toBe(0)
      expect(syncBehind.behind).toBe(1)
      expect(syncBehind.isSynchronized).toBe(false)

      // Execute Pull in local repo
      const pullRes = await pullGit(localRepoDir)
      expect(pullRes.success).toBe(true)

      // Working tree should now have de.json
      const deContent = await fs.readFile(path.join(localRepoDir, 'locales', 'de.json'), 'utf8')
      expect(deContent).toContain('Hallo von Peer')

      // Sync status is synchronized again
      const syncAfterPull = await getGitSyncStatus(localRepoDir)
      expect(syncAfterPull.ahead).toBe(0)
      expect(syncAfterPull.behind).toBe(0)
      expect(syncAfterPull.isSynchronized).toBe(true)
    })

    it('Scenario 6: detects diverged state, rejects push safely without force-pushing', async () => {
      if (!isGitAvailable || !localRepoDir || !peerRepoDir) return

      // In peer repo, commit and push change A
      await fs.writeFile(
        path.join(peerRepoDir, 'locales', 'de.json'),
        JSON.stringify({ greeting: 'Peer Divergence 1' }, null, 2),
        'utf8'
      )
      await runGit(peerRepoDir, ['add', 'locales/de.json'])
      await runGit(peerRepoDir, ['commit', '-m', 'peer divergence commit'])
      await runGit(peerRepoDir, ['push', 'origin', 'HEAD'])

      // In local repo, commit local change B (diverging history)
      await fs.writeFile(
        path.join(localRepoDir, 'locales', 'en.json'),
        JSON.stringify({ greeting: 'Local Divergence 2' }, null, 2),
        'utf8'
      )
      await runGit(localRepoDir, ['add', 'locales/en.json'])
      await runGit(localRepoDir, ['commit', '-m', 'local divergence commit'])

      // Fetch remote state
      await fetchGit(localRepoDir)

      // Sync status should be diverged: 1 ahead, 1 behind
      const syncDiverged = await getGitSyncStatus(localRepoDir)
      expect(syncDiverged.ahead).toBe(1)
      expect(syncDiverged.behind).toBe(1)
      expect(syncDiverged.isDiverged).toBe(true)

      // Attempt Push -> Git MUST reject push and return rejected flag (never force push!)
      const pushRes = await pushGit(localRepoDir)
      expect(pushRes.success).toBe(false)
      expect(pushRes.rejected).toBe(true)
    })

    it('Scenario 7: detects merge conflicts during Pull, preserves working tree without data loss', async () => {
      if (!isGitAvailable || !localRepoDir || !peerRepoDir) return

      // In peer repo, modify en.json and push
      await fs.writeFile(
        path.join(peerRepoDir, 'locales', 'en.json'),
        JSON.stringify({ greeting: 'Conflicting remote content' }, null, 2),
        'utf8'
      )
      await runGit(peerRepoDir, ['add', 'locales/en.json'])
      await runGit(peerRepoDir, ['commit', '-m', 'peer conflict commit'])
      await runGit(peerRepoDir, ['push', 'origin', 'HEAD'])

      // In local repo, en.json has conflicting content 'Local Divergence 2'
      // Execute Pull -> Git will produce a merge conflict
      const pullRes = await pullGit(localRepoDir)
      expect(pullRes.success).toBe(false)
      expect(pullRes.hasConflicts).toBe(true)

      // Verify that unfinished operation guard recognizes MERGE_HEAD
      const unfinished = await checkUnfinishedOperation(localRepoDir)
      expect(unfinished.inProgress).toBe(true)
      expect(unfinished.type).toBe('merge')

      // Subsequent pull or push must be safely blocked by unfinished operation guard
      const blockedPull = await pullGit(localRepoDir)
      expect(blockedPull.success).toBe(false)
      expect(blockedPull.errorCode).toBe('unfinished_operation')

      const blockedPush = await pushGit(localRepoDir)
      expect(blockedPush.success).toBe(false)
      expect(blockedPush.errorCode).toBe('unfinished_operation')

      // Clean up merge state for subsequent tests
      await runGit(localRepoDir, ['merge', '--abort'])
    })

    it('Scenario 8: handles detached HEAD state safely', async () => {
      if (!isGitAvailable || !localRepoDir) return

      const log = await getGitLog(localRepoDir, 2)
      const commitHash = log[1].hash

      // Checkout commit hash directly (detached HEAD)
      await runGit(localRepoDir, ['checkout', commitHash])

      const sync = await getGitSyncStatus(localRepoDir)
      expect(sync.isDetachedHead).toBe(true)
      expect(sync.hasUpstream).toBe(false)

      // Pull on detached HEAD is rejected safely
      const pullRes = await pullGit(localRepoDir)
      expect(pullRes.success).toBe(false)
      expect(pullRes.errorCode).toBe('detached_head')

      // Push on detached HEAD is rejected safely
      const pushRes = await pushGit(localRepoDir)
      expect(pushRes.success).toBe(false)
      expect(pushRes.errorCode).toBe('detached_head')

      // Switch back to named branch
      const branches = await getGitBranches(localRepoDir)
      const namedBranch = branches.branches[0]?.name || 'main'
      await switchGitBranch(localRepoDir, namedBranch)
    })
  })
})


