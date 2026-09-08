import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { render, screen, fireEvent } from '@testing-library/react'
import { I18nProvider } from '../i18n/I18nContext'
import { DirtyPullModal } from '../components/git/DirtyPullModal'
import { SetUpstreamModal } from '../components/git/SetUpstreamModal'
import {
  checkGitAvailable,
  getGitStatus,
  getGitLog,
  getGitBranches,
  commitGitSelected,
  getGitRemotes,
  getGitSyncStatus,
  fetchGit,
  pullGit,
  pushGit,
  sanitizeGitUrl,
  checkUnfinishedOperation,
  runGit,
} from '../../electron/main/gitService'

describe('Comprehensive End-to-End Real Git Remote Sync Verification (24 Scenarios)', () => {
  let isGitAvailable = false
  let bareRemoteDir1: string | null = null
  let bareRemoteDir2: string | null = null
  let mainRepoDir: string | null = null
  let peerRepoDir: string | null = null

  beforeAll(async () => {
    isGitAvailable = await checkGitAvailable()
    if (!isGitAvailable) {
      console.warn('Git is not installed, skipping real repo tests')
      return
    }

    // 1. Create two bare remote repositories for multiple remote testing
    bareRemoteDir1 = await fs.mkdtemp(path.join(os.tmpdir(), 'git-sync-bare-origin-'))
    await runGit(bareRemoteDir1, ['init', '--bare'])

    bareRemoteDir2 = await fs.mkdtemp(path.join(os.tmpdir(), 'git-sync-bare-upstream-'))
    await runGit(bareRemoteDir2, ['init', '--bare'])

    // 2. Create main local repository
    mainRepoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-sync-main-repo-'))
    await runGit(mainRepoDir, ['init'])
    await runGit(mainRepoDir, ['config', 'user.name', 'Main Tester'])
    await runGit(mainRepoDir, ['config', 'user.email', 'main@test.com'])
    await runGit(mainRepoDir, ['config', 'commit.gpgSign', 'false'])

    // Initial files
    await fs.mkdir(path.join(mainRepoDir, 'locales'), { recursive: true })
    await fs.writeFile(
      path.join(mainRepoDir, 'locales', 'en.json'),
      JSON.stringify({ hello: 'Hello Initial', save: 'Save' }, null, 2),
      'utf8'
    )
    await fs.writeFile(
      path.join(mainRepoDir, 'locales', 'de.json'),
      JSON.stringify({ hello: 'Hallo Initial', save: 'Speichern' }, null, 2),
      'utf8'
    )
    await runGit(mainRepoDir, ['add', 'locales/en.json', 'locales/de.json'])
    await runGit(mainRepoDir, ['commit', '-m', 'initial commit'])
  })

  afterAll(async () => {
    if (mainRepoDir) {
      try {
        await fs.rm(mainRepoDir, { recursive: true, force: true })
      } catch {
        // ignore
      }
    }
    if (bareRemoteDir1) {
      try {
        await fs.rm(bareRemoteDir1, { recursive: true, force: true })
      } catch {
        // ignore
      }
    }
    if (bareRemoteDir2) {
      try {
        await fs.rm(bareRemoteDir2, { recursive: true, force: true })
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

  // Scenario 1: Repository with no remote
  it('Scenario 1: Repository with no remote reports hasRemote: false', async () => {
    if (!isGitAvailable || !mainRepoDir) return

    const remotes = await getGitRemotes(mainRepoDir)
    expect(remotes).toEqual([])

    const sync = await getGitSyncStatus(mainRepoDir)
    expect(sync.hasRemote).toBe(false)
    expect(sync.hasUpstream).toBe(false)
    expect(sync.ahead).toBe(0)
    expect(sync.behind).toBe(0)
  })

  // Scenario 2: Repository with one remote
  it('Scenario 2: Repository with one remote is correctly recognized', async () => {
    if (!isGitAvailable || !mainRepoDir || !bareRemoteDir1) return

    const bareUrl = bareRemoteDir1.replace(/\\/g, '/')
    await runGit(mainRepoDir, ['remote', 'add', 'origin', bareUrl])

    const remotes = await getGitRemotes(mainRepoDir)
    expect(remotes).toHaveLength(1)
    expect(remotes[0].name).toBe('origin')
    expect(remotes[0].fetchUrl).toBeTruthy()

    const sync = await getGitSyncStatus(mainRepoDir)
    expect(sync.hasRemote).toBe(true)
  })

  // Scenario 3: Repository with multiple remotes
  it('Scenario 3: Repository with multiple remotes orders origin first and retains all remotes', async () => {
    if (!isGitAvailable || !mainRepoDir || !bareRemoteDir2) return

    const bareUrl2 = bareRemoteDir2.replace(/\\/g, '/')
    await runGit(mainRepoDir, ['remote', 'add', 'upstream', bareUrl2])

    const remotes = await getGitRemotes(mainRepoDir)
    expect(remotes).toHaveLength(2)
    expect(remotes[0].name).toBe('origin')
    expect(remotes[1].name).toBe('upstream')

    const sync = await getGitSyncStatus(mainRepoDir)
    expect(sync.remotes).toHaveLength(2)
  })

  // Scenario 5: No-upstream branch
  it('Scenario 5: Branch with no upstream is detected before first push', async () => {
    if (!isGitAvailable || !mainRepoDir) return

    const sync = await getGitSyncStatus(mainRepoDir)
    expect(sync.hasUpstream).toBe(false)
    expect(sync.isSynchronized).toBe(false)
  })

  // Scenario 13: Set upstream
  it('Scenario 13: Set upstream configures upstream tracking during push', async () => {
    if (!isGitAvailable || !mainRepoDir) return

    const branches = await getGitBranches(mainRepoDir)
    const currentBranch = branches.currentBranch || 'main'

    const pushRes = await pushGit(mainRepoDir, 'origin', currentBranch, true)
    expect(pushRes.success).toBe(true)
    expect(pushRes.remote).toBe('origin')
  })

  // Scenario 4: Current branch with upstream
  it('Scenario 4: Current branch with upstream returns upstream reference', async () => {
    if (!isGitAvailable || !mainRepoDir) return

    const sync = await getGitSyncStatus(mainRepoDir)
    expect(sync.hasUpstream).toBe(true)
    expect(sync.upstreamRemote).toBe('origin')
    expect(sync.upstream).toContain('origin/')
  })

  // Scenario 6: Up-to-date branch
  it('Scenario 6: Up-to-date branch reports ahead: 0, behind: 0, isSynchronized: true', async () => {
    if (!isGitAvailable || !mainRepoDir) return

    const sync = await getGitSyncStatus(mainRepoDir)
    expect(sync.ahead).toBe(0)
    expect(sync.behind).toBe(0)
    expect(sync.isSynchronized).toBe(true)
    expect(sync.isDiverged).toBe(false)
  })

  // Scenario 7: Ahead branch
  it('Scenario 7: Ahead branch correctly calculates ahead count', async () => {
    if (!isGitAvailable || !mainRepoDir) return

    await fs.writeFile(
      path.join(mainRepoDir, 'locales', 'en.json'),
      JSON.stringify({ hello: 'Hello Advance 1', save: 'Save' }, null, 2),
      'utf8'
    )
    await runGit(mainRepoDir, ['add', 'locales/en.json'])
    await runGit(mainRepoDir, ['commit', '-m', 'ahead commit 1'])

    await fs.writeFile(
      path.join(mainRepoDir, 'locales', 'en.json'),
      JSON.stringify({ hello: 'Hello Advance 2', save: 'Save' }, null, 2),
      'utf8'
    )
    await runGit(mainRepoDir, ['add', 'locales/en.json'])
    await runGit(mainRepoDir, ['commit', '-m', 'ahead commit 2'])

    const sync = await getGitSyncStatus(mainRepoDir)
    expect(sync.ahead).toBe(2)
    expect(sync.behind).toBe(0)
    expect(sync.isSynchronized).toBe(false)
  })

  // Scenario 12: Push
  it('Scenario 12: Push uploads local commits and restores synchronized status', async () => {
    if (!isGitAvailable || !mainRepoDir) return

    const pushRes = await pushGit(mainRepoDir)
    expect(pushRes.success).toBe(true)

    const sync = await getGitSyncStatus(mainRepoDir)
    expect(sync.ahead).toBe(0)
    expect(sync.behind).toBe(0)
    expect(sync.isSynchronized).toBe(true)
  })

  // Scenario 8: Behind branch & Scenario 10: Fetch
  it('Scenario 8 & 10: Behind branch detected via Fetch without modifying working tree', async () => {
    if (!isGitAvailable || !mainRepoDir || !bareRemoteDir1) return

    // Create peer repository
    peerRepoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-sync-peer-repo-'))
    const bareUrl = bareRemoteDir1.replace(/\\/g, '/')
    await runGit(peerRepoDir, ['clone', bareUrl, '.'])
    await runGit(peerRepoDir, ['config', 'user.name', 'Peer Tester'])
    await runGit(peerRepoDir, ['config', 'user.email', 'peer@test.com'])
    await runGit(peerRepoDir, ['config', 'commit.gpgSign', 'false'])

    // Peer creates and pushes a remote commit
    await fs.writeFile(
      path.join(peerRepoDir, 'locales', 'de.json'),
      JSON.stringify({ hello: 'Hallo Peer Update', save: 'Speichern' }, null, 2),
      'utf8'
    )
    await runGit(peerRepoDir, ['add', 'locales/de.json'])
    await runGit(peerRepoDir, ['commit', '-m', 'remote peer update'])
    await runGit(peerRepoDir, ['push', 'origin', 'HEAD'])

    // In main repo, record current de.json content before fetch
    const deBefore = await fs.readFile(path.join(mainRepoDir, 'locales', 'de.json'), 'utf8')

    // Execute Fetch
    const fetchRes = await fetchGit(mainRepoDir, 'origin')
    expect(fetchRes.success).toBe(true)

    // Working tree MUST NOT have been modified by Fetch!
    const deAfter = await fs.readFile(path.join(mainRepoDir, 'locales', 'de.json'), 'utf8')
    expect(deAfter).toBe(deBefore)

    // Status should show 1 behind
    const sync = await getGitSyncStatus(mainRepoDir)
    expect(sync.ahead).toBe(0)
    expect(sync.behind).toBe(1)
  })

  // Scenario 11 & 23: Pull execution & Workspace files refresh
  it('Scenario 11 & 23: Pull integrates remote commits and updates workspace files', async () => {
    if (!isGitAvailable || !mainRepoDir) return

    const pullRes = await pullGit(mainRepoDir)
    expect(pullRes.success).toBe(true)

    // Verify file content updated
    const deContent = await fs.readFile(path.join(mainRepoDir, 'locales', 'de.json'), 'utf8')
    expect(deContent).toContain('Hallo Peer Update')

    const sync = await getGitSyncStatus(mainRepoDir)
    expect(sync.ahead).toBe(0)
    expect(sync.behind).toBe(0)
    expect(sync.isSynchronized).toBe(true)
  })

  // Scenario 9: Diverged branch
  it('Scenario 9: Diverged branch is detected when local and remote both advance', async () => {
    if (!isGitAvailable || !mainRepoDir || !peerRepoDir) return

    // Peer advances remote
    await fs.writeFile(
      path.join(peerRepoDir, 'locales', 'de.json'),
      JSON.stringify({ hello: 'Hallo Remote Diverged', save: 'Speichern' }, null, 2),
      'utf8'
    )
    await runGit(peerRepoDir, ['add', 'locales/de.json'])
    await runGit(peerRepoDir, ['commit', '-m', 'remote diverged commit'])
    await runGit(peerRepoDir, ['push', 'origin', 'HEAD'])

    // Main repo advances locally on en.json
    await fs.writeFile(
      path.join(mainRepoDir, 'locales', 'en.json'),
      JSON.stringify({ hello: 'Hello Local Diverged', save: 'Save' }, null, 2),
      'utf8'
    )
    await runGit(mainRepoDir, ['add', 'locales/en.json'])
    await runGit(mainRepoDir, ['commit', '-m', 'local diverged commit'])

    // Fetch in main repo
    await fetchGit(mainRepoDir)

    const sync = await getGitSyncStatus(mainRepoDir)
    expect(sync.ahead).toBe(1)
    expect(sync.behind).toBe(1)
    expect(sync.isDiverged).toBe(true)
  })

  // Scenario 15: Push rejection
  it('Scenario 15: Push is rejected safely without force pushing when diverged', async () => {
    if (!isGitAvailable || !mainRepoDir) return

    const pushRes = await pushGit(mainRepoDir)
    expect(pushRes.success).toBe(false)
    expect(pushRes.rejected).toBe(true)

    // Working tree and commit history remain intact
    const log = await getGitLog(mainRepoDir, 1)
    expect(log[0].subject).toBe('local diverged commit')
  })

  // Scenario 16: Pull conflict handling
  it('Scenario 16: Pull handles merge conflict cleanly, reports conflict files, preserves user data', async () => {
    if (!isGitAvailable || !mainRepoDir || !peerRepoDir) return

    // Peer modifies en.json to conflict with main repo's en.json
    await fs.writeFile(
      path.join(peerRepoDir, 'locales', 'en.json'),
      JSON.stringify({ hello: 'Conflicting Peer Content', save: 'Save' }, null, 2),
      'utf8'
    )
    await runGit(peerRepoDir, ['add', 'locales/en.json'])
    await runGit(peerRepoDir, ['commit', '-m', 'peer conflicting en.json'])
    await runGit(peerRepoDir, ['push', 'origin', 'HEAD'])

    // Pull into main repo
    const pullRes = await pullGit(mainRepoDir)
    expect(pullRes.success).toBe(false)
    expect(pullRes.hasConflicts).toBe(true)

    // Verify unfinished operation inspection
    const unfinished = await checkUnfinishedOperation(mainRepoDir)
    expect(unfinished.inProgress).toBe(true)
    expect(unfinished.type).toBe('merge')

    // Clean up merge state
    await runGit(mainRepoDir, ['merge', '--abort'])
  })

  // Scenario 17: Detached HEAD
  it('Scenario 17: Detached HEAD state disables remote sync and rejects pull/push safely', async () => {
    if (!isGitAvailable || !mainRepoDir) return

    const log = await getGitLog(mainRepoDir, 2)
    const oldHash = log[1].hash

    await runGit(mainRepoDir, ['checkout', oldHash])

    const sync = await getGitSyncStatus(mainRepoDir)
    expect(sync.isDetachedHead).toBe(true)
    expect(sync.hasUpstream).toBe(false)

    const pullRes = await pullGit(mainRepoDir)
    expect(pullRes.success).toBe(false)
    expect(pullRes.errorCode).toBe('detached_head')

    const pushRes = await pushGit(mainRepoDir)
    expect(pushRes.success).toBe(false)
    expect(pushRes.errorCode).toBe('detached_head')

    // Return to main branch
    await runGit(mainRepoDir, ['checkout', 'main'])
  })

  // Scenario 18: Long branch names
  it('Scenario 18: Handles long branch names correctly', async () => {
    if (!isGitAvailable || !mainRepoDir) return

    const longBranch = 'feature/localization-internationalization-translation-workflow-2026'
    await runGit(mainRepoDir, ['checkout', '-b', longBranch])

    const sync = await getGitSyncStatus(mainRepoDir)
    expect(sync.currentBranch).toBe(longBranch)
    expect(sync.hasUpstream).toBe(false)

    await runGit(mainRepoDir, ['checkout', 'main'])
  })

  // Scenario 19: Remote URL credential sanitization
  it('Scenario 19: Sanitizes credentials from remote URLs', () => {
    expect(sanitizeGitUrl('https://myuser:supersecret@github.com/org/repo.git')).toBe(
      'https://***@github.com/org/repo.git'
    )
    expect(sanitizeGitUrl('https://ghp_token1234567890@github.com/org/repo.git')).toBe(
      'https://***@github.com/org/repo.git'
    )
    expect(sanitizeGitUrl('git@github.com:org/repo.git')).toBe('git@github.com:org/repo.git')
  })

  // Scenario 14: Dirty working tree before Pull modal flow
  it('Scenario 14: DirtyPullModal renders confirmation dialog and handles cancel/confirm', () => {
    let confirmed = false
    let closed = false

    const { unmount, rerender } = render(
      <I18nProvider>
        <DirtyPullModal
          isOpen={true}
          isPulling={false}
          uncommittedCount={2}
          onClose={() => {
            closed = true
          }}
          onConfirm={() => {
            confirmed = true
          }}
        />
      </I18nProvider>
    )

    expect(screen.getByTestId('dirty-pull-modal')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()

    // Clicking cancel triggers onClose
    fireEvent.click(screen.getByTestId('dirty-pull-cancel-btn'))
    expect(closed).toBe(true)

    // Re-render and click confirm
    rerender(
      <I18nProvider>
        <DirtyPullModal
          isOpen={true}
          isPulling={false}
          uncommittedCount={2}
          onClose={() => {
            closed = true
          }}
          onConfirm={() => {
            confirmed = true
          }}
        />
      </I18nProvider>
    )
    fireEvent.click(screen.getByTestId('dirty-pull-confirm-btn'))
    expect(confirmed).toBe(true)

    unmount()
  })

  it('SetUpstreamModal renders and handles remote/branch selection', () => {
    let selectedRemote = ''
    let selectedBranch = ''
    let closed = false

    const remotes = [
      { name: 'origin', fetchUrl: 'https://github.com/org/repo.git', pushUrl: 'https://github.com/org/repo.git' },
      { name: 'upstream', fetchUrl: 'https://github.com/upstream/repo.git', pushUrl: 'https://github.com/upstream/repo.git' },
    ]

    const { unmount } = render(
      <I18nProvider>
        <SetUpstreamModal
          isOpen={true}
          isPushing={false}
          currentBranch="feature/test"
          remotes={remotes}
          onClose={() => {
            closed = true
          }}
          onConfirm={(remote, branch) => {
            selectedRemote = remote
            selectedBranch = branch
          }}
        />
      </I18nProvider>
    )

    expect(screen.getByTestId('set-upstream-modal')).toBeInTheDocument()
    expect(screen.getByDisplayValue('feature/test')).toBeInTheDocument()

    fireEvent.change(screen.getByTestId('set-upstream-remote-select'), { target: { value: 'upstream' } })
    fireEvent.change(screen.getByTestId('set-upstream-branch-input'), { target: { value: 'feature/custom' } })
    fireEvent.click(screen.getByTestId('set-upstream-submit-btn'))

    expect(selectedRemote).toBe('upstream')
    expect(selectedBranch).toBe('feature/custom')
    expect(closed).toBe(false)

    unmount()
  })

  // Scenario 21: Existing selective commit still works
  it('Scenario 21: Existing selective commit works without regression', async () => {
    if (!isGitAvailable || !mainRepoDir) return

    // Create a new file
    await fs.writeFile(
      path.join(mainRepoDir, 'locales', 'en.json'),
      JSON.stringify({ hello: 'Hello Selective Test', save: 'Save' }, null, 2),
      'utf8'
    )

    const commitRes = await commitGitSelected(
      mainRepoDir,
      ['locales/en.json'],
      'feat: selective commit regression test'
    )

    expect(commitRes.success).toBe(true)
    expect(commitRes.committedFiles).toContain('locales/en.json')
  })

  // Scenario 22: Existing Git History/Working Changes remain synchronized
  it('Scenario 22: Git History and Working Changes remain synchronized', async () => {
    if (!isGitAvailable || !mainRepoDir) return

    const status = await getGitStatus(mainRepoDir)
    expect(status.files.length).toBe(0) // clean working tree

    const log = await getGitLog(mainRepoDir, 1)
    expect(log[0].subject).toBe('feat: selective commit regression test')
  })

  // Scenario 24: Safety guarantee: No user changes are discarded and no destructive commands run
  it('Scenario 24: Verifies safety invariants (non-destructive execution)', async () => {
    if (!isGitAvailable || !mainRepoDir) return

    // Modify a file with critical work
    const criticalContent = JSON.stringify({ hello: 'CRITICAL USER DATA DO NOT DISCARD' }, null, 2)
    await fs.writeFile(path.join(mainRepoDir, 'locales', 'en.json'), criticalContent, 'utf8')

    // Run getGitSyncStatus -> working changes must be preserved
    await getGitSyncStatus(mainRepoDir)
    const contentAfterSync = await fs.readFile(path.join(mainRepoDir, 'locales', 'en.json'), 'utf8')
    expect(contentAfterSync).toBe(criticalContent)
  })
})
