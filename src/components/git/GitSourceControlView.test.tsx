import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { GitSourceControlView } from './GitSourceControlView'
import { I18nProvider } from '../../i18n/I18nContext'
import type {
  GitRepositoryInfo,
  GitStatusSummary,
  GitCommitSummary,
  GitCommitDetails,
  GitFileDiff,
  GitBranchListResult,
} from '../../types/git'

// Mock the services/git/gitService module
vi.mock('../../services/git/gitService', () => ({
  fetchRepositoryInfo: vi.fn(),
  fetchGitStatus: vi.fn(),
  fetchGitLog: vi.fn(),
  fetchCommitDetails: vi.fn(),
  fetchFileDiff: vi.fn(),
  fetchGitBranches: vi.fn(),
  switchGitBranch: vi.fn(),
  createGitBranch: vi.fn(),
  commitGitSelected: vi.fn(),
  fetchGitSyncStatus: vi.fn(),
  fetchGitRemotes: vi.fn(),
  executeGitFetch: vi.fn(),
  executeGitPull: vi.fn(),
  executeGitPush: vi.fn(),
  validateCommitMessage: vi.fn((msg: string) => {
    if (!msg.trim()) return { valid: false, errorKey: 'git.commit.errorEmptyMessage' }
    return { valid: true }
  }),
  filterBranches: vi.fn((branches: Array<{ name: string }>, query: string) => {
    if (!query) return branches
    return branches.filter((b) => b.name.toLowerCase().includes(query.toLowerCase()))
  }),
  validateBranchNameInput: vi.fn((name: string) => {
    if (!name.trim()) return { valid: false, errorKey: 'git.errorEmpty' }
    if (name.includes(' ')) return { valid: false, errorKey: 'git.errorSpaces' }
    return { valid: true }
  }),
  formatGitCommitDate: vi.fn((ts: number) => (ts ? '2026-09-06' : '')),
  parseDiffContent: vi.fn((text: string) => {
    if (!text) return []
    return [
      { type: 'hunk', text: '@@ -1,3 +1,4 @@' },
      { type: 'addition', text: '+  "key": "val"', newLineNumber: 2 },
    ]
  }),
}))

import {
  fetchRepositoryInfo,
  fetchGitStatus,
  fetchGitLog,
  fetchCommitDetails,
  fetchFileDiff,
  fetchGitBranches,
  switchGitBranch,
  createGitBranch,
  commitGitSelected,
  fetchGitSyncStatus,
  executeGitFetch,
  executeGitPull,
  executeGitPush,
} from '../../services/git/gitService'

describe('GitSourceControlView', () => {
  const mockRepoInfo: GitRepositoryInfo = {
    isGitAvailable: true,
    isRepository: true,
    rootPath: 'e:/MyProgs/i18nh-pc',
    currentBranch: 'main',
    isDetachedHead: false,
  }

  const mockBranchResult: GitBranchListResult = {
    currentBranch: 'main',
    isDetachedHead: false,
    branches: [
      { name: 'main', isCurrent: true },
      { name: 'develop', isCurrent: false },
      { name: 'feature/loc-fr', isCurrent: false },
    ],
  }

  const mockStatus: GitStatusSummary = {
    isRepository: true,
    rootPath: 'e:/MyProgs/i18nh-pc',
    branch: 'main',
    isDetachedHead: false,
    files: [
      {
        path: 'locales/en.json',
        filename: 'en.json',
        status: 'modified',
        stagingStatus: 'staged',
        statusCode: 'M ',
        hasStagedChanges: true,
        hasUnstagedChanges: false,
        additions: 5,
        deletions: 2,
        isLocalization: true,
        languageCode: 'en',
      },
      {
        path: 'locales/de.json',
        filename: 'de.json',
        status: 'modified',
        stagingStatus: 'unstaged',
        statusCode: ' M',
        hasStagedChanges: false,
        hasUnstagedChanges: true,
        additions: 1,
        deletions: 0,
        isLocalization: true,
        languageCode: 'de',
      },
      {
        path: 'src/App.tsx',
        filename: 'App.tsx',
        status: 'modified',
        stagingStatus: 'unstaged',
        statusCode: ' M',
        hasStagedChanges: false,
        hasUnstagedChanges: true,
        additions: 10,
        deletions: 5,
        isLocalization: false,
      },
    ],
    totalChanges: 3,
    totalModified: 3,
    totalAdded: 0,
    totalDeleted: 0,
    totalRenamed: 0,
    totalUntracked: 0,
    totalStaged: 1,
    totalUnstaged: 2,
    totalPartiallyStaged: 0,
    localizationFilesCount: 2,
    allFilesCount: 3,
  }

  const mockLog: GitCommitSummary[] = [
    {
      hash: 'abcdef1234567890',
      shortHash: 'abcdef1',
      subject: 'feat: add german strings',
      authorName: 'Developer',
      authorEmail: 'dev@example.com',
      timestamp: 1788700000,
      isLocalizationCommit: true,
      localizationFilesCount: 1,
      totalFilesCount: 2,
      totalAdditions: 10,
      totalDeletions: 2,
    },
  ]

  const mockDetails: GitCommitDetails = {
    hash: 'abcdef1234567890',
    shortHash: 'abcdef1',
    subject: 'feat: add german strings',
    body: 'Detailed commit message',
    authorName: 'Developer',
    authorEmail: 'dev@example.com',
    timestamp: 1788700000,
    isLocalizationCommit: true,
    localizationFilesCount: 1,
    totalFilesCount: 2,
    totalAdditions: 10,
    totalDeletions: 2,
    changedFiles: [
      {
        path: 'locales/de.json',
        filename: 'de.json',
        status: 'modified',
        additions: 10,
        deletions: 2,
        isLocalization: true,
        languageCode: 'de',
      },
    ],
  }

  const mockDiff: GitFileDiff = {
    filePath: 'locales/en.json',
    diff: '@@ -1,3 +1,4 @@\n+  "key": "val"',
    isBinary: false,
    additions: 1,
    deletions: 0,
  }

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(fetchRepositoryInfo).mockResolvedValue(mockRepoInfo)
    vi.mocked(fetchGitBranches).mockResolvedValue(mockBranchResult)
    vi.mocked(fetchGitStatus).mockResolvedValue(mockStatus)
    vi.mocked(fetchGitLog).mockResolvedValue(mockLog)
    vi.mocked(fetchCommitDetails).mockResolvedValue(mockDetails)
    vi.mocked(fetchFileDiff).mockResolvedValue(mockDiff)
    vi.mocked(fetchGitSyncStatus).mockResolvedValue({
      hasRemote: true,
      remotes: [{ name: 'origin', fetchUrl: 'https://github.com/org/repo.git' }],
      currentBranch: 'main',
      isDetachedHead: false,
      hasUpstream: true,
      upstream: 'origin/main',
      upstreamRemote: 'origin',
      upstreamBranch: 'main',
      ahead: 0,
      behind: 0,
      isDiverged: false,
      isSynchronized: true,
    })
    vi.mocked(switchGitBranch).mockResolvedValue({
      success: true,
      currentBranch: 'develop',
      isDetachedHead: false,
    })
    vi.mocked(createGitBranch).mockResolvedValue({
      success: true,
      branchName: 'feature/test-branch',
    })
  })

  const renderComponent = (props = {}) => {
    return render(
      <I18nProvider language="en">
        <GitSourceControlView
          workspacePath="e:/MyProgs/i18nh-pc"
          onNavigateToLocalizationFile={vi.fn()}
          onRefreshWorkspace={vi.fn()}
          {...props}
        />
      </I18nProvider>
    )
  }

  it('renders working changes with changed files and status badges', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('en.json')).toBeInTheDocument()
    })

    expect(screen.getByText('de.json')).toBeInTheDocument()
    expect(screen.getByText('App.tsx')).toBeInTheDocument()

    // Status code badges
    expect(screen.getAllByText((content) => content.trim() === 'M').length).toBeGreaterThanOrEqual(2)
  })

  it('filters localization files when toggle is clicked', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('App.tsx')).toBeInTheDocument()
    })

    const filterCheckbox = screen.getByTestId('git-working-loc-filter')
    fireEvent.click(filterCheckbox)

    await waitFor(() => {
      expect(screen.getByText('en.json')).toBeInTheDocument()
      expect(screen.getByText('de.json')).toBeInTheDocument()
      expect(screen.queryByText('App.tsx')).not.toBeInTheDocument()
    })
  })

  it('switches to history subtab and shows commits and commit details', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByTestId('git-history-tab-btn')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('git-history-tab-btn'))

    await waitFor(() => {
      expect(screen.getByText('feat: add german strings')).toBeInTheDocument()
      expect(screen.getByText('abcdef1')).toBeInTheDocument()
    })

    expect(screen.getByText('Detailed commit message')).toBeInTheDocument()
  })

  it('displays clean state when no working changes exist', async () => {
    vi.mocked(fetchGitStatus).mockResolvedValue({
      ...mockStatus,
      files: [],
      totalChanges: 0,
      localizationFilesCount: 0,
      allFilesCount: 0,
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByTestId('git-clean-state')).toBeInTheDocument()
    })
  })

  it('displays not a repository message when folder is not a git repo', async () => {
    vi.mocked(fetchRepositoryInfo).mockResolvedValue({
      isGitAvailable: true,
      isRepository: false,
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText(/not a git repository/i)).toBeInTheDocument()
    })
  })

  it('displays git unavailable warning when git is not installed', async () => {
    vi.mocked(fetchRepositoryInfo).mockResolvedValue({
      isGitAvailable: false,
      isRepository: false,
      error: 'Git is not installed.',
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText(/Git is not installed/i)).toBeInTheDocument()
    })
  })

  /* ================= Branch Management UI Tests ================= */

  it('displays current branch in toolbar and allows opening branch selector dropdown', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByTestId('git-current-branch-display')).toHaveTextContent('main')
    })

    const branchBtn = screen.getByTestId('git-branch-selector-btn')
    fireEvent.click(branchBtn)

    await waitFor(() => {
      expect(screen.getByTestId('git-branch-dropdown')).toBeInTheDocument()
      expect(screen.getByTestId('branch-item-main')).toBeInTheDocument()
      expect(screen.getByTestId('branch-item-develop')).toBeInTheDocument()
      expect(screen.getByTestId('branch-item-feature/loc-fr')).toBeInTheDocument()
    })
  })

  it('opens dirty checkout warning modal when switching with uncommitted changes', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByTestId('git-branch-selector-btn')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('git-branch-selector-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('branch-item-develop')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('branch-item-develop'))

    // Dirty modal appears because mockStatus has totalChanges = 3
    await waitFor(() => {
      expect(screen.getByTestId('dirty-checkout-modal')).toBeInTheDocument()
    })

    const confirmBtn = screen.getByTestId('dirty-switch-confirm-btn')
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(switchGitBranch).toHaveBeenCalledWith('e:/MyProgs/i18nh-pc', 'develop')
    })
  })

  it('switches branch directly when working tree is clean', async () => {
    vi.mocked(fetchGitStatus).mockResolvedValue({
      ...mockStatus,
      files: [],
      totalChanges: 0,
      localizationFilesCount: 0,
      allFilesCount: 0,
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByTestId('git-branch-selector-btn')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('git-branch-selector-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('branch-item-develop')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('branch-item-develop'))

    await waitFor(() => {
      expect(switchGitBranch).toHaveBeenCalledWith('e:/MyProgs/i18nh-pc', 'develop')
      expect(screen.queryByTestId('dirty-checkout-modal')).not.toBeInTheDocument()
    })
  })

  it('opens create branch modal, validates input, and creates branch', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByTestId('git-branch-selector-btn')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('git-branch-selector-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('open-create-branch-modal-btn')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('open-create-branch-modal-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('create-branch-modal')).toBeInTheDocument()
    })

    const input = screen.getByTestId('create-branch-name-input')
    const submitBtn = screen.getByTestId('create-branch-submit-btn')

    // Invalid input (spaces)
    fireEvent.change(input, { target: { value: 'invalid branch' } })
    expect(screen.getByTestId('branch-input-validation-error')).toBeInTheDocument()
    expect(submitBtn).toBeDisabled()

    // Valid input
    fireEvent.change(input, { target: { value: 'feature/new-languages' } })
    expect(screen.queryByTestId('branch-input-validation-error')).not.toBeInTheDocument()
    expect(submitBtn).not.toBeDisabled()

    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(createGitBranch).toHaveBeenCalledWith('e:/MyProgs/i18nh-pc', 'feature/new-languages')
    })
  })

  it('displays detached HEAD badge when HEAD is detached', async () => {
    vi.mocked(fetchRepositoryInfo).mockResolvedValue({
      ...mockRepoInfo,
      isDetachedHead: true,
      currentBranch: 'HEAD (abcdef1)',
    })
    vi.mocked(fetchGitBranches).mockResolvedValue({
      ...mockBranchResult,
      isDetachedHead: true,
      currentBranch: 'HEAD (abcdef1)',
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByTestId('git-branch-selector-btn')).toHaveClass('is-detached')
      expect(screen.getByTestId('git-current-branch-display')).toHaveTextContent(/HEAD detached/i)
    })
  })

  describe('Selective Commit Workflow', () => {
    it('disables commit button when no files are selected, enables when files are selected', async () => {
      renderComponent()

      await waitFor(() => {
        expect(screen.getByTestId('git-commit-selected-btn')).toBeInTheDocument()
      })

      const commitBtn = screen.getByTestId('git-commit-selected-btn')
      expect(commitBtn).toBeDisabled()

      // Select en.json
      const checkboxEn = screen.getByTestId('git-file-checkbox-en.json')
      fireEvent.click(checkboxEn)

      expect(commitBtn).not.toBeDisabled()
      expect(commitBtn).toHaveTextContent('1')
    })

    it('opens commit modal, displays PASS preflight state, validates commit message, and commits', async () => {
      vi.mocked(commitGitSelected).mockResolvedValue({
        success: true,
        commitHash: '1234567890abcdef',
        shortHash: '1234567',
        committedFiles: ['locales/en.json'],
        additions: 5,
        deletions: 2,
      })

      renderComponent({
        preflightReport: {
          status: 'PASS',
          timestamp: Date.now(),
          totalIssues: 0,
          totalErrors: 0,
          totalWarnings: 0,
          totalInfo: 0,
          affectedFilesCount: 0,
          affectedLanguagesCount: 0,
          affectedKeysCount: 0,
          checks: [],
          affectedFiles: [],
          affectedLanguages: [],
          allIssues: [],
        },
      })

      await waitFor(() => {
        expect(screen.getByTestId('git-file-checkbox-en.json')).toBeInTheDocument()
      })

      // Select file and open modal
      fireEvent.click(screen.getByTestId('git-file-checkbox-en.json'))
      fireEvent.click(screen.getByTestId('git-commit-selected-btn'))

      await waitFor(() => {
        expect(screen.getByTestId('commit-selected-modal')).toBeInTheDocument()
      })

      // Check preflight badge is PASS
      expect(screen.getByTestId('commit-preflight-pass')).toBeInTheDocument()

      const msgInput = screen.getByTestId('commit-message-input')
      const submitBtn = screen.getByTestId('commit-submit-btn')

      // Empty message should keep submit disabled
      expect(submitBtn).toBeDisabled()

      // Enter valid commit message
      fireEvent.change(msgInput, { target: { value: 'feat(i18n): update english strings' } })
      expect(submitBtn).not.toBeDisabled()

      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(commitGitSelected).toHaveBeenCalledWith(
          'e:/MyProgs/i18nh-pc',
          ['locales/en.json'],
          'feat(i18n): update english strings'
        )
      })
    })

    it('handles WARNINGS preflight state and requires acknowledgment checkbox before enabling commit', async () => {
      renderComponent({
        preflightReport: {
          status: 'WARNINGS',
          timestamp: Date.now(),
          totalIssues: 2,
          totalErrors: 0,
          totalWarnings: 2,
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
              count: 2,
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
                  key: 'header.title',
                  message: 'Empty translation',
                },
              ],
            },
          ],
          affectedFiles: [],
          affectedLanguages: [],
          allIssues: [],
        },
      })

      await waitFor(() => {
        expect(screen.getByTestId('git-file-checkbox-en.json')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('git-file-checkbox-en.json'))
      fireEvent.click(screen.getByTestId('git-commit-selected-btn'))

      await waitFor(() => {
        expect(screen.getByTestId('commit-selected-modal')).toBeInTheDocument()
      })

      // Verify WARNINGS card is shown
      expect(screen.getByTestId('commit-preflight-warnings')).toBeInTheDocument()
      expect(screen.getByTestId('commit-acknowledge-warnings-checkbox')).toBeInTheDocument()

      const msgInput = screen.getByTestId('commit-message-input')
      const submitBtn = screen.getByTestId('commit-submit-btn')
      const ackCheckbox = screen.getByTestId('commit-acknowledge-warnings-checkbox')

      fireEvent.change(msgInput, { target: { value: 'feat: update with known warnings' } })

      // Submit must remain disabled until acknowledgment is checked
      expect(submitBtn).toBeDisabled()

      fireEvent.click(ackCheckbox)
      expect(submitBtn).not.toBeDisabled()
    })

    it('blocks commit when preflight status is FAILED', async () => {
      renderComponent({
        preflightReport: {
          status: 'FAILED',
          timestamp: Date.now(),
          totalIssues: 3,
          totalErrors: 3,
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
              count: 3,
              status: 'fail',
              issues: [
                {
                  id: 'e1',
                  type: 'missing_translation',
                  severity: 'error',
                  filename: 'de.json',
                  referenceFilename: 'en.json',
                  languageCode: 'de',
                  languageName: 'German',
                  key: 'btn.save',
                  message: 'Missing required translation key',
                },
              ],
            },
          ],
          affectedFiles: [],
          affectedLanguages: [],
          allIssues: [],
        },
      })

      await waitFor(() => {
        expect(screen.getByTestId('git-file-checkbox-en.json')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('git-file-checkbox-en.json'))
      fireEvent.click(screen.getByTestId('git-commit-selected-btn'))

      await waitFor(() => {
        expect(screen.getByTestId('commit-selected-modal')).toBeInTheDocument()
      })

      expect(screen.getByTestId('commit-preflight-failed')).toBeInTheDocument()

      const msgInput = screen.getByTestId('commit-message-input')
      const submitBtn = screen.getByTestId('commit-submit-btn')

      fireEvent.change(msgInput, { target: { value: 'attempt commit with failing preflight' } })

      // Submit MUST remain disabled
      expect(submitBtn).toBeDisabled()
    })
  })

  /* ================= Resizable Panel & Layout UI Tests ================= */
  describe('Resizable Panel and Toolbar Layout', () => {
    it('renders horizontal resize handle in working changes view with valid constraints', async () => {
      renderComponent()

      await waitFor(() => {
        expect(screen.getByTestId('git-files-resize-handle')).toBeInTheDocument()
      })

      const handle = screen.getByTestId('git-files-resize-handle')
      expect(handle).toHaveAttribute('role', 'separator')
      expect(handle).toHaveAttribute('aria-orientation', 'vertical')
      expect(handle).toHaveAttribute('aria-valuemin', '280')
      expect(handle).toHaveAttribute('aria-valuemax', '560')
    })

    it('renders vertical diff resize handle and horizontal commits resize handle in history view', async () => {
      renderComponent()

      await waitFor(() => {
        expect(screen.getByTestId('git-history-tab-btn')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('git-history-tab-btn'))

      await waitFor(() => {
        expect(screen.getByTestId('git-commits-resize-handle')).toBeInTheDocument()
        expect(screen.getByTestId('git-diff-resize-handle')).toBeInTheDocument()
      })

      const diffHandle = screen.getByTestId('git-diff-resize-handle')
      expect(diffHandle).toHaveAttribute('role', 'separator')
      expect(diffHandle).toHaveAttribute('aria-orientation', 'horizontal')
      expect(diffHandle).toHaveAttribute('aria-valuemin', '140')
      expect(diffHandle).toHaveAttribute('aria-valuemax', '700')

      const commitsHandle = screen.getByTestId('git-commits-resize-handle')
      expect(commitsHandle).toHaveAttribute('role', 'separator')
      expect(commitsHandle).toHaveAttribute('aria-valuemin', '280')
      expect(commitsHandle).toHaveAttribute('aria-valuemax', '560')
    })

    it('ensures all toolbar buttons, filters, and action buttons remain present and usable', async () => {
      renderComponent()

      await waitFor(() => {
        expect(screen.getByTestId('git-branch-selector-btn')).toBeInTheDocument()
        expect(screen.getByTestId('git-working-tab-btn')).toBeInTheDocument()
        expect(screen.getByTestId('git-history-tab-btn')).toBeInTheDocument()
        expect(screen.getByTestId('git-working-loc-filter')).toBeInTheDocument()
        expect(screen.getByTestId('git-refresh-btn')).toBeInTheDocument()
        expect(screen.getByTestId('git-commit-selected-btn')).toBeInTheDocument()
      })

      // Working file selected by default (en.json is localization)
      await waitFor(() => {
        expect(screen.getByTestId('git-open-editor-btn')).toBeInTheDocument()
      })

      expect(screen.getByTestId('git-open-editor-btn')).toHaveTextContent(/open in editor/i)
    })
  })

  describe('Git Remote Synchronization UI', () => {
    it('renders synchronized status badge when up to date', async () => {
      renderComponent()

      await waitFor(() => {
        expect(screen.getByTestId('git-sync-status-badge')).toBeInTheDocument()
        expect(screen.getByTestId('git-sync-status-text')).toHaveTextContent(/up to date/i)
      })
    })

    it('renders ahead and behind badges correctly', async () => {
      vi.mocked(fetchGitSyncStatus).mockResolvedValueOnce({
        hasRemote: true,
        remotes: [{ name: 'origin' }],
        currentBranch: 'main',
        isDetachedHead: false,
        hasUpstream: true,
        upstream: 'origin/main',
        upstreamRemote: 'origin',
        upstreamBranch: 'main',
        ahead: 3,
        behind: 0,
        isDiverged: false,
        isSynchronized: false,
      })

      renderComponent()

      await waitFor(() => {
        expect(screen.getByTestId('git-sync-status-text')).toHaveTextContent(/3 ahead/i)
        expect(screen.getByTestId('git-push-count-badge')).toHaveTextContent('3')
      })
    })

    it('renders behind badge and count on pull button', async () => {
      vi.mocked(fetchGitSyncStatus).mockResolvedValueOnce({
        hasRemote: true,
        remotes: [{ name: 'origin' }],
        currentBranch: 'main',
        isDetachedHead: false,
        hasUpstream: true,
        upstream: 'origin/main',
        upstreamRemote: 'origin',
        upstreamBranch: 'main',
        ahead: 0,
        behind: 2,
        isDiverged: false,
        isSynchronized: false,
      })

      renderComponent()

      await waitFor(() => {
        expect(screen.getByTestId('git-sync-status-text')).toHaveTextContent(/2 behind/i)
        expect(screen.getByTestId('git-pull-count-badge')).toHaveTextContent('2')
      })
    })

    it('renders diverged status badge', async () => {
      vi.mocked(fetchGitSyncStatus).mockResolvedValueOnce({
        hasRemote: true,
        remotes: [{ name: 'origin' }],
        currentBranch: 'main',
        isDetachedHead: false,
        hasUpstream: true,
        upstream: 'origin/main',
        upstreamRemote: 'origin',
        upstreamBranch: 'main',
        ahead: 2,
        behind: 4,
        isDiverged: true,
        isSynchronized: false,
      })

      renderComponent()

      await waitFor(() => {
        expect(screen.getByTestId('git-sync-status-text')).toHaveTextContent(/2/i)
        expect(screen.getByTestId('git-sync-status-text')).toHaveTextContent(/4/i)
      })
    })

    it('renders no upstream status and opens SetUpstreamModal on Push', async () => {
      vi.mocked(fetchGitSyncStatus).mockResolvedValueOnce({
        hasRemote: true,
        remotes: [{ name: 'origin' }],
        currentBranch: 'feature/new',
        isDetachedHead: false,
        hasUpstream: false,
        ahead: 0,
        behind: 0,
        isDiverged: false,
        isSynchronized: false,
      })

      renderComponent()

      await waitFor(() => {
        expect(screen.getByTestId('git-sync-status-text')).toHaveTextContent(/no upstream/i)
      })

      // Clicking Push should open Set Upstream modal
      fireEvent.click(screen.getByTestId('git-push-btn'))

      await waitFor(() => {
        expect(screen.getByTestId('set-upstream-modal')).toBeInTheDocument()
      })

      // Target branch input default to feature/new
      expect(screen.getByTestId('set-upstream-branch-input')).toHaveValue('main')

      // Submit set upstream
      vi.mocked(executeGitPush).mockResolvedValueOnce({
        success: true,
        remote: 'origin',
        branch: 'main',
      })

      fireEvent.click(screen.getByTestId('set-upstream-submit-btn'))

      await waitFor(() => {
        expect(executeGitPush).toHaveBeenCalledWith('e:/MyProgs/i18nh-pc', 'origin', 'main', true)
      })
    })

    it('executes Fetch on click and displays success banner', async () => {
      vi.mocked(executeGitFetch).mockResolvedValueOnce({
        success: true,
        remote: 'origin',
      })

      renderComponent()

      await waitFor(() => {
        expect(screen.getByTestId('git-fetch-btn')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('git-fetch-btn'))

      await waitFor(() => {
        expect(executeGitFetch).toHaveBeenCalledWith('e:/MyProgs/i18nh-pc', 'origin')
        expect(screen.getByTestId('sync-success-banner')).toBeInTheDocument()
      })
    })

    it('opens DirtyPullModal when Pull is clicked on dirty working tree', async () => {
      renderComponent()

      await waitFor(() => {
        expect(screen.getByTestId('git-pull-btn')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('git-pull-btn'))

      await waitFor(() => {
        expect(screen.getByTestId('dirty-pull-modal')).toBeInTheDocument()
      })

      // Confirming dirty pull executes pull
      vi.mocked(executeGitPull).mockResolvedValueOnce({
        success: true,
        remote: 'origin',
        branch: 'main',
      })

      fireEvent.click(screen.getByTestId('dirty-pull-confirm-btn'))

      await waitFor(() => {
        expect(executeGitPull).toHaveBeenCalledWith('e:/MyProgs/i18nh-pc', 'origin')
      })
    })

    it('renders multiple remotes dropdown selector when >1 remotes exist', async () => {
      vi.mocked(fetchGitSyncStatus).mockResolvedValueOnce({
        hasRemote: true,
        remotes: [
          { name: 'origin', fetchUrl: 'https://github.com/my/repo.git' },
          { name: 'upstream', fetchUrl: 'https://github.com/upstream/repo.git' },
        ],
        currentBranch: 'main',
        isDetachedHead: false,
        hasUpstream: true,
        upstream: 'origin/main',
        upstreamRemote: 'origin',
        upstreamBranch: 'main',
        ahead: 0,
        behind: 0,
        isDiverged: false,
        isSynchronized: true,
      })

      renderComponent()

      await waitFor(() => {
        expect(screen.getByTestId('git-remote-selector')).toBeInTheDocument()
      })
    })

    it('displays error banner when push is rejected', async () => {
      vi.mocked(fetchGitSyncStatus).mockResolvedValueOnce({
        hasRemote: true,
        remotes: [{ name: 'origin' }],
        currentBranch: 'main',
        isDetachedHead: false,
        hasUpstream: true,
        upstream: 'origin/main',
        upstreamRemote: 'origin',
        upstreamBranch: 'main',
        ahead: 1,
        behind: 1,
        isDiverged: true,
        isSynchronized: false,
      })
      vi.mocked(executeGitPush).mockResolvedValueOnce({
        success: false,
        rejected: true,
        error: 'rejected non-fast-forward',
      })

      renderComponent()

      await waitFor(() => {
        expect(screen.getByTestId('git-push-btn')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('git-push-btn'))

      await waitFor(() => {
        expect(screen.getByTestId('sync-error-banner')).toBeInTheDocument()
      })
    })
  })
})

