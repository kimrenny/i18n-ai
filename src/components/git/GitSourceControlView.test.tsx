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
} from '../../types/git'

// Mock the services/git/gitService module
vi.mock('../../services/git/gitService', () => ({
  fetchRepositoryInfo: vi.fn(),
  fetchGitStatus: vi.fn(),
  fetchGitLog: vi.fn(),
  fetchCommitDetails: vi.fn(),
  fetchFileDiff: vi.fn(),
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
} from '../../services/git/gitService'

describe('GitSourceControlView', () => {
  const mockRepoInfo: GitRepositoryInfo = {
    isGitAvailable: true,
    isRepository: true,
    rootPath: 'e:/MyProgs/i18nh-pc',
    currentBranch: 'main',
    isDetachedHead: false,
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
        additions: 3,
        deletions: 1,
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
        additions: 5,
        deletions: 2,
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
      hash: 'abcdef1234567890abcdef1234567890abcdef12',
      shortHash: 'abcdef1',
      authorName: 'Test Dev',
      authorEmail: 'dev@test.com',
      timestamp: 1700000000000,
      subject: 'feat: add german strings',
      isLocalizationCommit: true,
      localizationFilesCount: 1,
      totalFilesCount: 2,
      totalAdditions: 10,
      totalDeletions: 2,
    },
  ]

  const mockDetails: GitCommitDetails = {
    hash: 'abcdef1234567890abcdef1234567890abcdef12',
    shortHash: 'abcdef1',
    authorName: 'Test Dev',
    authorEmail: 'dev@test.com',
    timestamp: 1700000000000,
    subject: 'feat: add german strings',
    body: 'Detailed commit message',
    isLocalizationCommit: true,
    localizationFilesCount: 1,
    totalFilesCount: 2,
    totalAdditions: 10,
    totalDeletions: 2,
    changedFiles: [
      {
        path: 'locales/de.json',
        filename: 'de.json',
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
    vi.mocked(fetchGitStatus).mockResolvedValue(mockStatus)
    vi.mocked(fetchGitLog).mockResolvedValue(mockLog)
    vi.mocked(fetchCommitDetails).mockResolvedValue(mockDetails)
    vi.mocked(fetchFileDiff).mockResolvedValue(mockDiff)
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
      expect(screen.getByTestId('git-source-control-view')).toBeInTheDocument()
    })

    expect(screen.getByText('en.json')).toBeInTheDocument()
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
})
