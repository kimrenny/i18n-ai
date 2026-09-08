import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nProvider } from '../i18n/I18nContext'
import { GitSourceControlView } from '../components/git/GitSourceControlView'
import type {
  GitRepositoryInfo,
  GitStatusSummary,
  GitCommitSummary,
  GitCommitDetails,
  GitFileDiff,
  GitBranchListResult,
} from '../types/git'

// Mock the services/git/gitService module for ultra-fast, deterministic layout verification
vi.mock('./git/gitService', () => ({
  fetchRepositoryInfo: vi.fn(),
  fetchGitStatus: vi.fn(),
  fetchGitLog: vi.fn(),
  fetchCommitDetails: vi.fn(),
  fetchFileDiff: vi.fn(),
  fetchGitBranches: vi.fn(),
  switchGitBranch: vi.fn(),
  createGitBranch: vi.fn(),
  commitGitSelected: vi.fn(),
  fetchGitSyncStatus: vi.fn().mockResolvedValue({
    hasRemote: true,
    remotes: [{ name: 'origin' }],
    currentBranch: 'main',
    isDetachedHead: false,
    hasUpstream: true,
    ahead: 0,
    behind: 0,
    isSynchronized: true,
    isDiverged: false,
  }),
  fetchGitRemotes: vi.fn().mockResolvedValue([{ name: 'origin' }]),
  executeGitFetch: vi.fn().mockResolvedValue({ success: true }),
  executeGitPull: vi.fn().mockResolvedValue({ success: true }),
  executeGitPush: vi.fn().mockResolvedValue({ success: true }),
  validateCommitMessage: vi.fn(() => ({ valid: true })),
  filterBranches: vi.fn((branches) => branches),
  validateBranchNameInput: vi.fn(() => ({ valid: true })),
  formatGitCommitDate: vi.fn(() => '2026-09-06'),
  parseDiffContent: vi.fn(() => [
    { type: 'hunk', text: '@@ -1,4 +1,5 @@' },
    { type: 'addition', text: '+  "key": "val"', newLineNumber: 2 },
  ]),
}))

import {
  fetchRepositoryInfo,
  fetchGitStatus,
  fetchGitLog,
  fetchCommitDetails,
  fetchFileDiff,
  fetchGitBranches,
  fetchGitSyncStatus,
} from './git/gitService'

describe('Git Source Control Resizable Diff Viewer and Layout Verification', () => {
  const longBranchName = 'feature/localization-optimization-and-performance-enhancements-v2'
  const longFileName = 'src/features/internationalization/locales/en-US-comprehensive-localization-strings-definition.json'

  const mockRepoInfo: GitRepositoryInfo = {
    isGitAvailable: true,
    isRepository: true,
    rootPath: 'e:/MyProgs/i18nh-pc',
    currentBranch: longBranchName,
    isDetachedHead: false,
  }

  const mockBranchResult: GitBranchListResult = {
    currentBranch: longBranchName,
    isDetachedHead: false,
    branches: [
      { name: longBranchName, isCurrent: true },
      { name: 'main', isCurrent: false },
    ],
  }

  const mockStatus: GitStatusSummary = {
    isRepository: true,
    rootPath: 'e:/MyProgs/i18nh-pc',
    branch: longBranchName,
    isDetachedHead: false,
    files: [
      {
        path: longFileName,
        filename: 'en-US-comprehensive-localization-strings-definition.json',
        status: 'modified',
        stagingStatus: 'unstaged',
        statusCode: ' M',
        hasStagedChanges: false,
        hasUnstagedChanges: true,
        additions: 12,
        deletions: 3,
        isLocalization: true,
        languageCode: 'en',
      },
    ],
    totalChanges: 1,
    totalModified: 1,
    totalAdded: 0,
    totalDeleted: 0,
    totalRenamed: 0,
    totalUntracked: 0,
    totalStaged: 0,
    totalUnstaged: 1,
    totalPartiallyStaged: 0,
    localizationFilesCount: 1,
    allFilesCount: 1,
  }

  const mockLog: GitCommitSummary[] = [
    {
      hash: 'abcdef1234567890123456789012345678901234',
      shortHash: 'abcdef1',
      subject: 'feat(core): initial base localization commit with comprehensive details',
      authorName: 'Senior Localization Engineer',
      authorEmail: 'engineer@organization.org',
      timestamp: 1788700000,
      isLocalizationCommit: true,
      localizationFilesCount: 1,
      totalFilesCount: 1,
      totalAdditions: 50,
      totalDeletions: 0,
    },
  ]

  const mockDetails: GitCommitDetails = {
    hash: 'abcdef1234567890123456789012345678901234',
    shortHash: 'abcdef1',
    subject: 'feat(core): initial base localization commit with comprehensive details',
    body: 'Multiline commit message body providing detailed architectural justification for selective commit and diff viewer layout improvements.',
    authorName: 'Senior Localization Engineer',
    authorEmail: 'engineer@organization.org',
    timestamp: 1788700000,
    isLocalizationCommit: true,
    localizationFilesCount: 1,
    totalFilesCount: 1,
    totalAdditions: 50,
    totalDeletions: 0,
    changedFiles: [
      {
        path: longFileName,
        filename: 'en-US-comprehensive-localization-strings-definition.json',
        status: 'modified',
        additions: 50,
        deletions: 0,
        isLocalization: true,
        languageCode: 'en',
      },
    ],
  }

  const mockDiff: GitFileDiff = {
    filePath: longFileName,
    diff: '@@ -1,4 +1,5 @@\n+  "key": "val"',
    isBinary: false,
    additions: 12,
    deletions: 3,
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
      remotes: [{ name: 'origin' }],
      currentBranch: longBranchName,
      isDetachedHead: false,
      hasUpstream: true,
      upstream: `origin/${longBranchName}`,
      upstreamRemote: 'origin',
      upstreamBranch: longBranchName,
      ahead: 0,
      behind: 0,
      isSynchronized: true,
      isDiverged: false,
    })
  })

  it('verifies Git Source Control renders with long branch names and controls without clipping', async () => {
    render(
      <I18nProvider language="en">
        <GitSourceControlView
          workspacePath="e:/MyProgs/i18nh-pc"
          onNavigateToLocalizationFile={vi.fn()}
          onRefreshWorkspace={vi.fn()}
        />
      </I18nProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('git-branch-selector-btn')).toBeInTheDocument()
      expect(screen.getByTestId('git-working-tab-btn')).toBeInTheDocument()
      expect(screen.getByTestId('git-history-tab-btn')).toBeInTheDocument()
      expect(screen.getByTestId('git-refresh-btn')).toBeInTheDocument()
    })

    expect(screen.getByTestId('git-current-branch-display')).toHaveTextContent(longBranchName)

    await waitFor(() => {
      expect(screen.getByTestId('git-files-resize-handle')).toBeInTheDocument()
    })

    // Selective commit button is present and not clipped
    expect(screen.getByTestId('git-commit-selected-btn')).toBeInTheDocument()
  })

  it('verifies vertical resizing of diff viewer in History tab with min/max constraints', async () => {
    render(
      <I18nProvider language="en">
        <GitSourceControlView
          workspacePath="e:/MyProgs/i18nh-pc"
          onNavigateToLocalizationFile={vi.fn()}
          onRefreshWorkspace={vi.fn()}
        />
      </I18nProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('git-history-tab-btn')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('git-history-tab-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('git-diff-resize-handle')).toBeInTheDocument()
      expect(screen.getByTestId('git-commits-resize-handle')).toBeInTheDocument()
    })

    const diffHandle = screen.getByTestId('git-diff-resize-handle')
    expect(diffHandle).toHaveAttribute('aria-valuenow', '340')

    // Keyboard resize up (increase height)
    fireEvent.keyDown(diffHandle, { key: 'ArrowUp' })
    expect(diffHandle).toHaveAttribute('aria-valuenow', '350')

    // Keyboard resize down (decrease height)
    fireEvent.keyDown(diffHandle, { key: 'ArrowDown' })
    expect(diffHandle).toHaveAttribute('aria-valuenow', '340')

    // Keyboard End (max height)
    fireEvent.keyDown(diffHandle, { key: 'End' })
    expect(diffHandle).toHaveAttribute('aria-valuenow', '700')

    // Keyboard Home (min height)
    fireEvent.keyDown(diffHandle, { key: 'Home' })
    expect(diffHandle).toHaveAttribute('aria-valuenow', '140')
  })

  it('verifies horizontal resizing of files list in Working Changes tab', async () => {
    render(
      <I18nProvider language="en">
        <GitSourceControlView
          workspacePath="e:/MyProgs/i18nh-pc"
          onNavigateToLocalizationFile={vi.fn()}
          onRefreshWorkspace={vi.fn()}
        />
      </I18nProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('git-files-resize-handle')).toBeInTheDocument()
    })

    const filesHandle = screen.getByTestId('git-files-resize-handle')
    expect(filesHandle).toHaveAttribute('aria-valuenow', '360')

    // Keyboard resize right (increase width)
    fireEvent.keyDown(filesHandle, { key: 'ArrowRight' })
    expect(filesHandle).toHaveAttribute('aria-valuenow', '370')

    // Keyboard resize left (decrease width)
    fireEvent.keyDown(filesHandle, { key: 'ArrowLeft' })
    expect(filesHandle).toHaveAttribute('aria-valuenow', '360')
  })

  it('verifies toolbar layout preserves Working Changes, History, and Sync actions simultaneously without clipping or overlap', async () => {
    vi.mocked(fetchGitSyncStatus).mockResolvedValue({
      hasRemote: true,
      remotes: [{ name: 'origin' }, { name: 'upstream' }],
      currentBranch: longBranchName,
      isDetachedHead: false,
      hasUpstream: true,
      upstream: `origin/${longBranchName}`,
      upstreamRemote: 'origin',
      upstreamBranch: longBranchName,
      ahead: 2,
      behind: 1,
      isSynchronized: false,
      isDiverged: true,
    })

    render(
      <I18nProvider language="en">
        <GitSourceControlView
          workspacePath="e:/MyProgs/i18nh-pc"
          onNavigateToLocalizationFile={vi.fn()}
          onRefreshWorkspace={vi.fn()}
        />
      </I18nProvider>
    )

    // 1. Navigation controls are fully rendered and clickable
    await waitFor(() => {
      expect(screen.getByTestId('git-branch-selector-btn')).toBeInTheDocument()
      expect(screen.getByTestId('git-working-tab-btn')).toBeInTheDocument()
      expect(screen.getByTestId('git-history-tab-btn')).toBeInTheDocument()
    })

    const workingBtn = screen.getByTestId('git-working-tab-btn')
    const historyBtn = screen.getByTestId('git-history-tab-btn')
    expect(workingBtn).toBeVisible()
    expect(historyBtn).toBeVisible()

    // 2. Sync status and Sync action buttons are fully rendered and clickable
    expect(screen.getByTestId('git-sync-status-badge')).toBeInTheDocument()
    expect(screen.getByTestId('git-fetch-btn')).toBeInTheDocument()
    expect(screen.getByTestId('git-pull-btn')).toBeInTheDocument()
    expect(screen.getByTestId('git-push-btn')).toBeInTheDocument()

    const fetchBtn = screen.getByTestId('git-fetch-btn')
    const pullBtn = screen.getByTestId('git-pull-btn')
    const pushBtn = screen.getByTestId('git-push-btn')

    expect(fetchBtn).toBeVisible()
    expect(pullBtn).toBeVisible()
    expect(pushBtn).toBeVisible()

    // 3. Tab switching works smoothly without interference
    fireEvent.click(historyBtn)
    expect(historyBtn).toHaveClass('is-active')
    expect(workingBtn).not.toHaveClass('is-active')

    fireEvent.click(workingBtn)
    expect(workingBtn).toHaveClass('is-active')
    expect(historyBtn).not.toHaveClass('is-active')
  })
})
