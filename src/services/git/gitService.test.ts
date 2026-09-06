import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  parseDiffContent,
  filterLocalizationFiles,
  filterLocalizationCommits,
  formatGitCommitDate,
  validateBranchNameInput,
  filterBranches,
  fetchGitBranches,
  switchGitBranch,
  createGitBranch,
} from './gitService'
import type { GitFileStatus, GitCommitSummary, GitBranchInfo } from '../../types/git'

describe('renderer gitService helpers', () => {
  describe('parseDiffContent', () => {
    it('parses patch diff into hunks, additions, deletions, context and metadata', () => {
      const diffText = [
        'diff --git a/locales/en.json b/locales/en.json',
        'index 1234567..89abcdef 100644',
        '--- a/locales/en.json',
        '+++ b/locales/en.json',
        '@@ -1,4 +1,5 @@',
        ' {',
        '-  "hello": "Hello",',
        '+  "hello": "Hello World",',
        '+  "new_key": "New Value",',
        '   "bye": "Goodbye"',
        ' }',
      ].join('\n')

      const parsed = parseDiffContent(diffText)
      expect(parsed.length).toBe(11)

      expect(parsed[0].type).toBe('meta')
      expect(parsed[4].type).toBe('hunk')
      expect(parsed[5].type).toBe('context')
      expect(parsed[6].type).toBe('deletion')
      expect(parsed[6].oldLineNumber).toBe(2)
      expect(parsed[7].type).toBe('addition')
      expect(parsed[7].newLineNumber).toBe(2)
      expect(parsed[8].type).toBe('addition')
      expect(parsed[8].newLineNumber).toBe(3)
    })

    it('handles empty diff gracefully', () => {
      expect(parseDiffContent('')).toEqual([])
    })
  })

  describe('filterLocalizationFiles', () => {
    it('filters out non-localization files', () => {
      const files: GitFileStatus[] = [
        {
          path: 'locales/en.json',
          filename: 'en.json',
          status: 'modified',
          stagingStatus: 'unstaged',
          statusCode: ' M',
          hasStagedChanges: false,
          hasUnstagedChanges: true,
          additions: 1,
          deletions: 0,
          isLocalization: true,
          languageCode: 'en',
        },
        {
          path: 'src/main.tsx',
          filename: 'main.tsx',
          status: 'modified',
          stagingStatus: 'unstaged',
          statusCode: ' M',
          hasStagedChanges: false,
          hasUnstagedChanges: true,
          additions: 5,
          deletions: 1,
          isLocalization: false,
        },
      ]

      const filtered = filterLocalizationFiles(files)
      expect(filtered).toHaveLength(1)
      expect(filtered[0].filename).toBe('en.json')
    })
  })

  describe('filterLocalizationCommits', () => {
    it('filters out non-localization commits', () => {
      const commits: GitCommitSummary[] = [
        {
          hash: 'abc1',
          shortHash: 'abc',
          authorName: 'Dev',
          authorEmail: 'dev@example.com',
          timestamp: 1700000000000,
          subject: 'loc commit',
          isLocalizationCommit: true,
          localizationFilesCount: 2,
          totalFilesCount: 3,
          totalAdditions: 10,
          totalDeletions: 2,
        },
        {
          hash: 'abc2',
          shortHash: 'ab2',
          authorName: 'Dev',
          authorEmail: 'dev@example.com',
          timestamp: 1700000000000,
          subject: 'code commit',
          isLocalizationCommit: false,
          localizationFilesCount: 0,
          totalFilesCount: 1,
          totalAdditions: 20,
          totalDeletions: 5,
        },
      ]

      const filtered = filterLocalizationCommits(commits)
      expect(filtered).toHaveLength(1)
      expect(filtered[0].hash).toBe('abc1')
    })
  })

  describe('formatGitCommitDate', () => {
    it('formats timestamp safely', () => {
      const formatted = formatGitCommitDate(1700000000000, 'en-US')
      expect(formatted).toBeTruthy()
      expect(typeof formatted).toBe('string')
    })

    it('handles zero or invalid timestamps', () => {
      expect(formatGitCommitDate(0)).toBe('')
      expect(formatGitCommitDate(NaN)).toBe('')
    })
  })

  describe('validateBranchNameInput', () => {
    it('rejects empty input', () => {
      expect(validateBranchNameInput('')).toEqual({ valid: false, errorKey: 'git.errorEmpty' })
      expect(validateBranchNameInput('   ')).toEqual({ valid: false, errorKey: 'git.errorEmpty' })
    })

    it('rejects spaces', () => {
      expect(validateBranchNameInput('feature branch')).toEqual({ valid: false, errorKey: 'git.errorSpaces' })
    })

    it('rejects leading/trailing slashes and trailing dots', () => {
      expect(validateBranchNameInput('/feature')).toEqual({ valid: false, errorKey: 'git.errorBoundary' })
      expect(validateBranchNameInput('feature/')).toEqual({ valid: false, errorKey: 'git.errorBoundary' })
      expect(validateBranchNameInput('feature.')).toEqual({ valid: false, errorKey: 'git.errorBoundary' })
    })

    it('rejects consecutive slashes, dots, and @{', () => {
      expect(validateBranchNameInput('feature..branch')).toEqual({ valid: false, errorKey: 'git.errorConsecutive' })
      expect(validateBranchNameInput('feature//branch')).toEqual({ valid: false, errorKey: 'git.errorConsecutive' })
      expect(validateBranchNameInput('feature@{1}')).toEqual({ valid: false, errorKey: 'git.errorConsecutive' })
    })

    it('rejects invalid git ref characters', () => {
      expect(validateBranchNameInput('feature~1')).toEqual({ valid: false, errorKey: 'git.errorInvalidChars' })
      expect(validateBranchNameInput('feature^')).toEqual({ valid: false, errorKey: 'git.errorInvalidChars' })
      expect(validateBranchNameInput('feature:main')).toEqual({ valid: false, errorKey: 'git.errorInvalidChars' })
      expect(validateBranchNameInput('feature?')).toEqual({ valid: false, errorKey: 'git.errorInvalidChars' })
      expect(validateBranchNameInput('feature*')).toEqual({ valid: false, errorKey: 'git.errorInvalidChars' })
      expect(validateBranchNameInput('feature[1]')).toEqual({ valid: false, errorKey: 'git.errorInvalidChars' })
      expect(validateBranchNameInput('feature\\test')).toEqual({ valid: false, errorKey: 'git.errorInvalidChars' })
    })

    it('rejects names ending with .lock', () => {
      expect(validateBranchNameInput('branch.lock')).toEqual({ valid: false, errorKey: 'git.errorLock' })
    })

    it('accepts valid branch names', () => {
      expect(validateBranchNameInput('main')).toEqual({ valid: true })
      expect(validateBranchNameInput('feature/new-translations')).toEqual({ valid: true })
      expect(validateBranchNameInput('fix_v1.2.3')).toEqual({ valid: true })
      expect(validateBranchNameInput('ветка-перевода')).toEqual({ valid: true })
    })
  })

  describe('filterBranches', () => {
    const branches: GitBranchInfo[] = [
      { name: 'main', isCurrent: true },
      { name: 'develop', isCurrent: false },
      { name: 'feature/loc-fr', isCurrent: false },
      { name: 'feature/loc-de', isCurrent: false },
    ]

    it('returns all branches when query is empty', () => {
      expect(filterBranches(branches, '')).toHaveLength(4)
      expect(filterBranches(branches, '   ')).toHaveLength(4)
    })

    it('filters branches case-insensitively', () => {
      expect(filterBranches(branches, 'dev')).toHaveLength(1)
      expect(filterBranches(branches, 'DEV')[0].name).toBe('develop')
      expect(filterBranches(branches, 'feature')).toHaveLength(2)
      expect(filterBranches(branches, 'non-existent')).toHaveLength(0)
    })
  })

  describe('IPC Bridge Invocations', () => {
    beforeEach(() => {
      window.electronAPI = {
        gitGetBranches: vi.fn(),
        gitSwitchBranch: vi.fn(),
        gitCreateBranch: vi.fn(),
      } as unknown as typeof window.electronAPI
    })

    it('calls gitGetBranches bridge safely', async () => {
      vi.mocked(window.electronAPI!.gitGetBranches!).mockResolvedValue({
        currentBranch: 'main',
        isDetachedHead: false,
        branches: [{ name: 'main', isCurrent: true }],
      })

      const res = await fetchGitBranches('/repo')
      expect(res.currentBranch).toBe('main')
      expect(res.branches).toHaveLength(1)
    })

    it('calls gitSwitchBranch bridge safely', async () => {
      vi.mocked(window.electronAPI!.gitSwitchBranch!).mockResolvedValue({
        success: true,
        currentBranch: 'develop',
        isDetachedHead: false,
      })

      const res = await switchGitBranch('/repo', 'develop')
      expect(res.success).toBe(true)
      expect(res.currentBranch).toBe('develop')
    })

    it('calls gitCreateBranch bridge safely', async () => {
      vi.mocked(window.electronAPI!.gitCreateBranch!).mockResolvedValue({
        success: true,
        branchName: 'feature/new',
      })

      const res = await createGitBranch('/repo', 'feature/new')
      expect(res.success).toBe(true)
      expect(res.branchName).toBe('feature/new')
    })
  })
})
