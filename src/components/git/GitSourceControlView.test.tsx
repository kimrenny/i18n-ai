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
})
