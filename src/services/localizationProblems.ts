import type { ParsedLocalizationFile } from '../types/localization'
import type {
  LocalizationProblem,
  LanguageProblemsGroup,
  WorkspaceProblemsSummary,
} from '../types/localizationProblems'
import {
  determineReferenceLanguage,
  getLanguageDisplayName,
} from './localizationCoverage'
import { normalizeLanguageCode } from './languageNormalizer'

/**
 * Calculates project-wide localization problems based on the canonical reference key set.
 * Uses the exact same semantics as the Translation Coverage Dashboard.
 */
export function calculateWorkspaceProblems(
  files: readonly ParsedLocalizationFile[]
): WorkspaceProblemsSummary {
  if (!files || files.length === 0) {
    return {
      totalProblems: 0,
      totalMissing: 0,
      totalEmpty: 0,
      problems: [],
      groups: [],
    }
  }

  const refFile = determineReferenceLanguage(files)
  if (!refFile) {
    return {
      totalProblems: 0,
      totalMissing: 0,
      totalEmpty: 0,
      problems: [],
      groups: [],
    }
  }

  // Canonical reference key set sorted alphabetically
  const refKeys = Object.keys(refFile.keys).sort((a, b) => a.localeCompare(b))
  const allProblems: LocalizationProblem[] = []
  const groups: LanguageProblemsGroup[] = []

  let totalMissing = 0
  let totalEmpty = 0

  for (const file of files) {
    const isReference = file.filename === refFile.filename
    const languageCode = normalizeLanguageCode(file.filename)
    const languageName = getLanguageDisplayName(languageCode)

    const fileMissingProblems: LocalizationProblem[] = []
    const fileEmptyProblems: LocalizationProblem[] = []

    if (!isReference) {
      for (const key of refKeys) {
        if (!Object.prototype.hasOwnProperty.call(file.keys, key)) {
          fileMissingProblems.push({
            id: `${file.filename}:missing:${key}`,
            type: 'missing',
            filename: file.filename,
            path: file.path,
            languageCode,
            languageName,
            key,
          })
        } else {
          const val = file.keys[key]
          if (val === '' || val === null || val === undefined) {
            fileEmptyProblems.push({
              id: `${file.filename}:empty:${key}`,
              type: 'empty',
              filename: file.filename,
              path: file.path,
              languageCode,
              languageName,
              key,
            })
          }
        }
      }
    } else {
      // Check if reference file itself contains empty keys
      for (const key of refKeys) {
        const val = refFile.keys[key]
        if (val === '' || val === null || val === undefined) {
          fileEmptyProblems.push({
            id: `${file.filename}:empty:${key}`,
            type: 'empty',
            filename: file.filename,
            path: file.path,
            languageCode,
            languageName,
            key,
          })
        }
      }
    }

    const fileProblems = [...fileMissingProblems, ...fileEmptyProblems]
    totalMissing += fileMissingProblems.length
    totalEmpty += fileEmptyProblems.length
    allProblems.push(...fileProblems)

    groups.push({
      filename: file.filename,
      path: file.path,
      languageCode,
      languageName,
      missingCount: fileMissingProblems.length,
      emptyCount: fileEmptyProblems.length,
      totalCount: fileProblems.length,
      problems: fileProblems,
    })
  }

  return {
    totalProblems: allProblems.length,
    totalMissing,
    totalEmpty,
    problems: allProblems,
    groups,
  }
}

/**
 * Pure filtering function for problems list.
 */
export function filterProblems(
  problems: readonly LocalizationProblem[],
  languageFilter: string,
  typeFilter: string
): LocalizationProblem[] {
  return problems.filter((p) => {
    const matchesLang =
      languageFilter === 'all' ||
      p.languageCode === languageFilter ||
      p.filename === languageFilter

    const matchesType = typeFilter === 'all' || p.type === typeFilter

    return matchesLang && matchesType
  })
}

/**
 * Pure helper to group filtered problems by language.
 */
export function groupProblemsByLanguage(
  problems: readonly LocalizationProblem[]
): LanguageProblemsGroup[] {
  const map = new Map<string, LanguageProblemsGroup>()

  for (const p of problems) {
    let group = map.get(p.filename)
    if (!group) {
      group = {
        filename: p.filename,
        path: p.path,
        languageCode: p.languageCode,
        languageName: p.languageName,
        missingCount: 0,
        emptyCount: 0,
        totalCount: 0,
        problems: [],
      }
      map.set(p.filename, group)
    }

    group.problems.push(p)
    group.totalCount++
    if (p.type === 'missing') {
      group.missingCount++
    } else {
      group.emptyCount++
    }
  }

  return Array.from(map.values())
}
