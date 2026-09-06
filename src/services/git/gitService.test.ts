import { describe, it, expect } from 'vitest'
import {
  parseDiffContent,
  filterLocalizationFiles,
  filterLocalizationCommits,
  formatGitCommitDate,
} from './gitService'
import type { GitFileStatus, GitCommitSummary } from '../../types/git'

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
})
