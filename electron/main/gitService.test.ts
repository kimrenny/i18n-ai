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
})

