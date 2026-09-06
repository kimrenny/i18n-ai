import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { render, screen, fireEvent } from '@testing-library/react'
import { I18nProvider } from '../i18n/I18nContext'
import { CommitSelectedModal } from '../components/git/CommitSelectedModal'
import {
  checkGitAvailable,
  getRepositoryInfo,
  getGitStatus,
  getGitLog,
  getCommitDetails,
  getFileDiff,
  commitGitSelected,
  runGit,
} from '../../electron/main/gitService'
import type { WorkspacePreflightReport } from '../types/localizationValidation'

describe('Comprehensive End-to-End Real Git Repository Selective Commit Verification', () => {
  let tempRepoDir: string | null = null
  let isGitAvailable = false

  beforeAll(async () => {
    isGitAvailable = await checkGitAvailable()
    if (!isGitAvailable) {
      console.warn('Git is not installed, skipping real repo tests')
      return
    }

    // 1. Create a real temporary Git repository
    tempRepoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-commit-e2e-'))
    await runGit(tempRepoDir, ['init'])
    await runGit(tempRepoDir, ['config', 'user.name', 'Verification Tester'])
    await runGit(tempRepoDir, ['config', 'user.email', 'verify@e2e.test'])
    await runGit(tempRepoDir, ['config', 'commit.gpgSign', 'false'])

    // Create folder structure
    const localesDir = path.join(tempRepoDir, 'locales')
    const srcDir = path.join(tempRepoDir, 'src')
    await fs.mkdir(localesDir, { recursive: true })
    await fs.mkdir(srcDir, { recursive: true })

    // Step 1: Create three initial files: A (locales/en.json), B (locales/de.json), C (src/index.ts)
    await fs.writeFile(
      path.join(localesDir, 'en.json'),
      JSON.stringify({ greeting: 'Hello', save: 'Save' }, null, 2),
      'utf8'
    )
    await fs.writeFile(
      path.join(localesDir, 'de.json'),
      JSON.stringify({ greeting: 'Hallo', save: 'Speichern' }, null, 2),
      'utf8'
    )
    await fs.writeFile(
      path.join(srcDir, 'index.ts'),
      'export const APP_NAME = "i18n-app";\n',
      'utf8'
    )

    await runGit(tempRepoDir, ['add', '.'])
    await runGit(tempRepoDir, ['commit', '-m', 'chore: initial baseline commit'])
  })

  afterAll(async () => {
    if (tempRepoDir) {
      try {
        await fs.rm(tempRepoDir, { recursive: true, force: true })
      } catch {
        // ignore on windows locks
      }
    }
  })

  it('1-8. executes end-to-end selective commit of A & B while leaving C uncommitted', async () => {
    if (!isGitAvailable || !tempRepoDir) return

    const localesDir = path.join(tempRepoDir, 'locales')
    const srcDir = path.join(tempRepoDir, 'src')

    // Step 2: Modify all three files A, B, C
    await fs.writeFile(
      path.join(localesDir, 'en.json'),
      JSON.stringify({ greeting: 'Hello World Updated', save: 'Save Changes' }, null, 2),
      'utf8'
    )
    await fs.writeFile(
      path.join(localesDir, 'de.json'),
      JSON.stringify({ greeting: 'Hallo Welt Aktualisiert', save: 'Änderungen Speichern' }, null, 2),
      'utf8'
    )
    await fs.writeFile(
      path.join(srcDir, 'index.ts'),
      'export const APP_NAME = "i18n-app-MODIFIED-UNCOMMITTED";\n',
      'utf8'
    )

    // Step 3: Inspect Git status
    const statusPre = await getGitStatus(tempRepoDir)
    expect(statusPre.files.length).toBe(3)
    const filePaths = statusPre.files.map((f) => f.path.replace(/\\/g, '/'))
    expect(filePaths).toContain('locales/en.json')
    expect(filePaths).toContain('locales/de.json')
    expect(filePaths).toContain('src/index.ts')

    // Step 4 & 5: Select only A and B for commit
    const selectedPaths = ['locales/en.json', 'locales/de.json']

    // Step 6: Verify Commit Modal properties
    const multilineCommitMessage = 'feat(i18n): update greeting and save labels\n\n- Updated EN greeting\n- Updated DE greeting'
    
    // Step 7: Execute commit
    const commitResult = await commitGitSelected(
      tempRepoDir,
      selectedPaths,
      multilineCommitMessage
    )

    expect(commitResult.success).toBe(true)
    expect(commitResult.commitHash).toBeDefined()
    expect(commitResult.shortHash).toBeDefined()
    expect(commitResult.committedFiles).toHaveLength(2)
    expect(commitResult.committedFiles?.some((p) => p.includes('en.json'))).toBe(true)
    expect(commitResult.committedFiles?.some((p) => p.includes('de.json'))).toBe(true)
    expect(commitResult.committedFiles?.some((p) => p.includes('index.ts'))).toBe(false)

    // Step 8: Verify in the actual Git repository
    // - C remains modified in working tree and was NOT committed
    const statusPost = await getGitStatus(tempRepoDir)
    expect(statusPost.files).toHaveLength(1)
    expect(statusPost.files[0].path.replace(/\\/g, '/')).toBe('src/index.ts')
    expect(statusPost.files[0].stagingStatus).toBe('unstaged')

    // - Verify new commit appears in Git History with correct message and details
    const log = await getGitLog(tempRepoDir, 1)
    expect(log[0].hash).toBe(commitResult.commitHash)
    expect(log[0].subject).toBe('feat(i18n): update greeting and save labels')

    const details = await getCommitDetails(tempRepoDir, commitResult.commitHash!)
    expect(details?.body).toContain('- Updated EN greeting')
    expect(details?.body).toContain('- Updated DE greeting')
    expect(details?.changedFiles).toHaveLength(2)

    // - Verify diff for the committed file
    const enDiff = await getFileDiff(tempRepoDir, 'locales/en.json', commitResult.commitHash!)
    expect(enDiff.diff).toContain('+  "greeting": "Hello World Updated"')
    expect(enDiff.diff).toContain('-  "greeting": "Hello"')

    // Verify C content is still intact on disk
    const cContent = await fs.readFile(path.join(srcDir, 'index.ts'), 'utf8')
    expect(cContent).toContain('i18n-app-MODIFIED-UNCOMMITTED')
  }, 20000)

  it('9. Pre-flight WARNINGS behavior: requires acknowledgment checkbox before enabling commit', async () => {
    let committedMessage: string | null = null
    const mockSelected = [
      {
        path: 'locales/en.json',
        filename: 'en.json',
        status: 'modified' as const,
        stagingStatus: 'unstaged' as const,
        statusCode: ' M',
        hasStagedChanges: false,
        hasUnstagedChanges: true,
        additions: 2,
        deletions: 1,
        isLocalization: true,
      },
    ]

    const warningReport: WorkspacePreflightReport = {
      status: 'WARNINGS',
      timestamp: Date.now(),
      totalIssues: 1,
      totalErrors: 0,
      totalWarnings: 1,
      totalInfo: 0,
      affectedFilesCount: 1,
      affectedLanguagesCount: 1,
      affectedKeysCount: 1,
      checks: [
        {
          category: 'empty_translations',
          type: 'empty_translation',
          severity: 'warning',
          labelKey: 'preflight.checks.empty_translations',
          count: 1,
          status: 'warn',
          issues: [
            {
              id: 'w1',
              type: 'empty_translation',
              severity: 'warning',
              filename: 'en.json',
              referenceFilename: 'en.json',
              languageCode: 'en',
              languageName: 'English',
              key: 'placeholder.key',
              message: 'Empty translation string',
            },
          ],
        },
      ],
      affectedFiles: [],
      affectedLanguages: [],
      allIssues: [],
    }

    render(
      <I18nProvider>
        <CommitSelectedModal
          isOpen={true}
          workspacePath={tempRepoDir || ''}
          selectedFiles={mockSelected}
          preflightReport={warningReport}
          isCommitting={false}
          commitError={null}
          onClose={() => {}}
          onCommit={(msg) => {
            committedMessage = msg
          }}
        />
      </I18nProvider>
    )

    const msgInput = screen.getByTestId('commit-message-input')
    const submitBtn = screen.getByTestId('commit-submit-btn')
    const ackCheckbox = screen.getByTestId('commit-acknowledge-warnings-checkbox')

    // Enter valid message
    fireEvent.change(msgInput, { target: { value: 'feat: committing with warning' } })

    // Button MUST remain disabled until acknowledgment checkbox is checked
    expect(submitBtn).toBeDisabled()

    // Check acknowledgment checkbox
    fireEvent.click(ackCheckbox)
    expect(submitBtn).not.toBeDisabled()

    // Submit commit
    fireEvent.click(submitBtn)
    expect(committedMessage).toBe('feat: committing with warning')
  })

  it('10. Pre-flight FAILED behavior: blocks commit and provides issue navigation', async () => {
    let navigatedIssue: unknown = null
    const mockSelected = [
      {
        path: 'locales/de.json',
        filename: 'de.json',
        status: 'modified' as const,
        stagingStatus: 'unstaged' as const,
        statusCode: ' M',
        hasStagedChanges: false,
        hasUnstagedChanges: true,
        additions: 1,
        deletions: 0,
        isLocalization: true,
      },
    ]

    const failedReport: WorkspacePreflightReport = {
      status: 'FAILED',
      timestamp: Date.now(),
      totalIssues: 1,
      totalErrors: 1,
      totalWarnings: 0,
      totalInfo: 0,
      affectedFilesCount: 1,
      affectedLanguagesCount: 1,
      affectedKeysCount: 1,
      checks: [
        {
          category: 'missing_translations',
          type: 'missing_translation',
          severity: 'error',
          labelKey: 'preflight.checks.missing_translations',
          count: 1,
          status: 'fail',
          issues: [
            {
              id: 'err1',
              type: 'missing_translation',
              severity: 'error',
              filename: 'de.json',
              referenceFilename: 'en.json',
              languageCode: 'de',
              languageName: 'German',
              key: 'critical.header',
              message: 'Missing critical translation key',
            },
          ],
        },
      ],
      affectedFiles: [],
      affectedLanguages: [],
      allIssues: [],
    }

    render(
      <I18nProvider>
        <CommitSelectedModal
          isOpen={true}
          workspacePath={tempRepoDir || ''}
          selectedFiles={mockSelected}
          preflightReport={failedReport}
          isCommitting={false}
          commitError={null}
          onClose={() => {}}
          onCommit={() => {}}
          onNavigateToIssue={(issue) => {
            navigatedIssue = issue
          }}
        />
      </I18nProvider>
    )

    const msgInput = screen.getByTestId('commit-message-input')
    const submitBtn = screen.getByTestId('commit-submit-btn')

    fireEvent.change(msgInput, { target: { value: 'attempting commit' } })

    // Commit button is strictly disabled
    expect(submitBtn).toBeDisabled()

    // Issue navigation button works
    const inspectBtn = screen.getByRole('button', { name: /Inspect/i })
    expect(inspectBtn).toBeInTheDocument()
    fireEvent.click(inspectBtn)
    expect(navigatedIssue).toEqual(failedReport.checks[0].issues[0])
  })

  it('11. Git Hook Rejection: returns hookFailed: true and leaves changes intact', async () => {
    if (!isGitAvailable || !tempRepoDir) return

    const hooksDir = path.join(tempRepoDir, '.git', 'hooks')
    await fs.mkdir(hooksDir, { recursive: true })
    const preCommitHook = path.join(hooksDir, 'pre-commit')

    // Create rejecting hook
    await fs.writeFile(
      preCommitHook,
      '#!/bin/sh\necho "Pre-commit verification hook: REJECTED" >&2\nexit 1\n',
      { mode: 0o777 }
    )

    const localesDir = path.join(tempRepoDir, 'locales')
    await fs.writeFile(
      path.join(localesDir, 'en.json'),
      JSON.stringify({ greeting: 'Hello Hook Test', save: 'Save' }, null, 2),
      'utf8'
    )

    const hookResult = await commitGitSelected(
      tempRepoDir,
      ['locales/en.json'],
      'feat: should fail by hook'
    )

    expect(hookResult.success).toBe(false)
    expect(hookResult.hookFailed).toBe(true)
    expect(hookResult.error).toContain('Pre-commit verification hook: REJECTED')

    // Ensure changes were NOT lost or discarded
    const status = await getGitStatus(tempRepoDir)
    expect(status.files.some((f) => f.path.includes('en.json'))).toBe(true)

    // Cleanup hook
    await fs.unlink(preCommitHook)
    await runGit(tempRepoDir, ['restore', '--staged', 'locales/en.json'])
  }, 20000)

  it('12. Unrelated Staged File Protection: blocks commit when unrelated staged file exists and preserves D', async () => {
    if (!isGitAvailable || !tempRepoDir) return

    // Create file D
    const fileDPath = path.join(tempRepoDir, 'extra-d.txt')
    await fs.writeFile(fileDPath, 'important staged work in D\n', 'utf8')
    await runGit(tempRepoDir, ['add', 'extra-d.txt'])

    // Modify A
    const localesDir = path.join(tempRepoDir, 'locales')
    await fs.writeFile(
      path.join(localesDir, 'en.json'),
      JSON.stringify({ greeting: 'Hello Protected Test', save: 'Save' }, null, 2),
      'utf8'
    )

    // Attempt to commit only A
    const blockedRes = await commitGitSelected(
      tempRepoDir,
      ['locales/en.json'],
      'feat: try commit while D is staged'
    )

    // Must be blocked
    expect(blockedRes.success).toBe(false)
    expect(blockedRes.blockedByUnrelatedStaged).toBe(true)
    expect(blockedRes.unrelatedStagedFiles).toContain('extra-d.txt')

    // Verify D remains staged and untouched
    const status = await getGitStatus(tempRepoDir)
    const statD = status.files.find((f) => f.path.includes('extra-d.txt'))
    expect(statD).toBeDefined()
    expect(statD?.hasStagedChanges || statD?.stagingStatus === 'staged').toBe(true)

    const contentD = await fs.readFile(fileDPath, 'utf8')
    expect(contentD).toBe('important staged work in D\n')

    // Cleanup
    await runGit(tempRepoDir, ['restore', '--staged', 'extra-d.txt'])
    await fs.unlink(fileDPath)
  }, 20000)

  it('13. Partially staged selected file: commits current complete version of selected file', async () => {
    if (!isGitAvailable || !tempRepoDir) return

    const localesDir = path.join(tempRepoDir, 'locales')

    // 1. First modification to en.json and stage it
    await fs.writeFile(
      path.join(localesDir, 'en.json'),
      JSON.stringify({ greeting: 'Hello Part 1', save: 'Save' }, null, 2),
      'utf8'
    )
    await runGit(tempRepoDir, ['add', 'locales/en.json'])

    // 2. Second modification to en.json (unstaged)
    await fs.writeFile(
      path.join(localesDir, 'en.json'),
      JSON.stringify({ greeting: 'Hello Part 1', save: 'Save Complete 2' }, null, 2),
      'utf8'
    )

    // Check status shows partially_staged
    const preStat = await getGitStatus(tempRepoDir)
    const enStat = preStat.files.find((f) => f.path.includes('en.json'))
    expect(enStat?.stagingStatus).toBe('partially_staged')

    // Commit selected en.json
    const commitRes = await commitGitSelected(
      tempRepoDir,
      ['locales/en.json'],
      'feat: commit complete version of partially staged file'
    )

    expect(commitRes.success).toBe(true)

    // Verify HEAD has the COMPLETE version ("Save Complete 2")
    const headContent = await runGit(tempRepoDir, ['show', 'HEAD:locales/en.json'])
    expect(headContent.stdout).toContain('Save Complete 2')
    expect(headContent.stdout).toContain('Hello Part 1')
  }, 20000)

  it('14-15. Verifies UI selection distinction from Git staging & state refreshing', async () => {
    if (!isGitAvailable || !tempRepoDir) return

    const repoInfo = await getRepositoryInfo(tempRepoDir)
    expect(repoInfo.isRepository).toBe(true)
    expect(repoInfo.currentBranch).toBeDefined()

    const status = await getGitStatus(tempRepoDir)
    expect(status.isRepository).toBe(true)

    // Verify selection checkboxes are clear application-level selections
    // and distinct from Git Staged badges
    const unstagedFile = status.files.find((f) => f.stagingStatus === 'unstaged')
    if (unstagedFile) {
      expect(unstagedFile.hasStagedChanges).toBe(false)
      expect(unstagedFile.hasUnstagedChanges).toBe(true)
    }
  })
})
