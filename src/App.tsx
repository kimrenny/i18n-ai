import React, { useState, useEffect, useCallback, useMemo } from 'react'
import type {
  AppSettings,
  AiTranslationSettings,
} from './types/settings'
import { DEFAULT_APP_SETTINGS } from './types/settings'
import { SettingsModal } from './components/settings/SettingsModal'
import { LocalizationDiffViewer } from './components/localization/LocalizationDiffViewer'
import { ProjectExplorer } from './components/explorer/ProjectExplorer'
import { FilePreview } from './components/preview/FilePreview'
import { TranslationCoverageDashboard } from './components/dashboard/TranslationCoverageDashboard'
import { parseLocalizationData } from './services/localizationParser'
import { compareLocalizationFiles } from './services/localizationComparator'
import { isLocalizationFile } from './services/localizationDetector'
import {
  calculateWorkspaceCoverage,
  getFirstProblemKeyForFile,
} from './services/localizationCoverage'
import { calculateWorkspaceProblems } from './services/localizationProblems'
import type { ProblemNavigationTarget } from './types/localizationCoverage'
import type { LocalizationProblem } from './types/localizationProblems'
import { ProblemsPanel } from './components/problems/ProblemsPanel'
import { QualityPanel } from './components/quality/QualityPanel'
import { PreflightValidatorPanel } from './components/preflight/PreflightValidatorPanel'
import { GitSourceControlView } from './components/git/GitSourceControlView'
import { KeyUsagePanel } from './components/keyUsage/KeyUsagePanel'
import { fetchRepositoryInfo, fetchGitStatus } from './services/git/gitService'
import { performWorkspaceKeyUsageScan } from './services/keyUsageService'
import type { GitRepositoryInfo, GitStatusSummary } from './types/git'
import type { KeyUsageScanResult } from './types/keyUsage'
import { calculateWorkspaceQuality } from './services/localizationQuality'
import { validateWorkspacePreflight } from './services/localizationValidation'
import type { LocalizationQualityIssue, WorkspaceQualitySummary } from './types/localizationQuality'
import { isFeatureEnabled } from './types/features'
import { GlobalSearch } from './components/search/GlobalSearch'
import { useResizablePanel } from './hooks/useResizablePanel'
import type {
  ParsedLocalizationFile,
  LocalizationComparisonResult,
} from './types/localization'
import type { LocalizationSearchResult } from './types/localizationSearch'
import type { DirectoryTreeResult, ProjectFileEntry } from './types/explorer'
import { I18nProvider } from './i18n/I18nContext'
import { useTranslation } from './i18n/useTranslation'
import './App.css'

interface DiscoveredFile {
  name: string
  path: string
}

interface FileParseResult {
  filename: string
  path: string
  success: boolean
  data?: ParsedLocalizationFile
  error?: string
}

interface PreviewFileInfo {
  path: string
  name: string
  isLocalizationCandidate: boolean
}

interface AppContentProps {
  settings: AppSettings
  isSettingsSaving: boolean
  settingsSaveError: string | null
  onUpdateAiSettings: (update: Partial<AiTranslationSettings>) => Promise<void>
  onUpdateTranslationSettings: (update: Partial<AppSettings>) => Promise<void>
  onUpdateFeatureSettings: (update: Partial<import('./types/features').FeatureToggleState>) => Promise<void>
}

const EMPTY_WORKSPACE_QUALITY: WorkspaceQualitySummary = {
  totalIssues: 0,
  totalErrors: 0,
  totalWarnings: 0,
  totalInfos: 0,
  errorCount: 0,
  warningCount: 0,
  infoCount: 0,
  issues: [],
  bySeverity: {
    error: [],
    warning: [],
    info: [],
  },
  byType: {
    missing_translation: [],
    empty_translation: [],
    placeholder_mismatch: [],
    tag_mismatch: [],
    same_as_reference: [],
    whitespace_mismatch: [],
    structural_conflict: [],
  },
  byFile: {},
}

const AppContent: React.FC<AppContentProps> = ({
  settings,
  isSettingsSaving,
  settingsSaveError,
  onUpdateAiSettings,
  onUpdateTranslationSettings,
  onUpdateFeatureSettings,
}) => {
  const { t } = useTranslation()

  // Feature Flags
  const isDiffViewerEnabled = isFeatureEnabled(settings.features, 'diff_viewer')
  const isGlobalSearchEnabled = isFeatureEnabled(settings.features, 'global_search')
  const isKeyUsageEnabled = isFeatureEnabled(settings.features, 'key_usage_scanner')
  const isQualityEnabled = isFeatureEnabled(settings.features, 'quality_checks')
  const isPreflightEnabled = isFeatureEnabled(settings.features, 'preflight_validator')
  const isGitEnabled = isFeatureEnabled(settings.features, 'git_integration')
  const isAiEnabled = isFeatureEnabled(settings.features, 'ai_translation')
  const isFreeEnabled = isFeatureEnabled(settings.features, 'free_translation')

  const [selectedDirectory, setSelectedDirectory] = useState<string | null>(null)
  const [treeData, setTreeData] = useState<DirectoryTreeResult | null>(null)
  const [jsonFiles, setJsonFiles] = useState<DiscoveredFile[]>([])
  const [checkedPaths, setCheckedPaths] = useState<Set<string>>(new Set())
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null)
  const [isExplorerCollapsed, setIsExplorerCollapsed] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  // Preview State
  const [selectedPreviewFile, setSelectedPreviewFile] = useState<PreviewFileInfo | null>(null)
  const [previewContent, setPreviewContent] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewIsBinary, setPreviewIsBinary] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [isProblemsOpen, setIsProblemsOpen] = useState(false)
  const [isQualityOpen, setIsQualityOpen] = useState(false)

  // Explorer Resizing Hook (horizontal: min 180px, max 600px, default 280px, collapseThreshold 120px)
  const explorerResize = useResizablePanel({
    direction: 'horizontal',
    initialSize: 280,
    minSize: 180,
    maxSize: 600,
    collapseThreshold: 120,
    isCollapsed: isExplorerCollapsed,
    onCollapse: () => setIsExplorerCollapsed(true),
    onExpand: () => setIsExplorerCollapsed(false),
  })

  // Problems Panel Resizing Hook (vertical: min 120px, max 600px, default 220px, collapseThreshold 80px)
  const problemsResize = useResizablePanel({
    direction: 'vertical',
    initialSize: 220,
    minSize: 120,
    maxSize: 600,
    collapseThreshold: 80,
    isCollapsed: !isProblemsOpen,
    onCollapse: () => setIsProblemsOpen(false),
    onExpand: () => setIsProblemsOpen(true),
  })

  // Quality Panel Resizing Hook (vertical: min 120px, max 600px, default 220px, collapseThreshold 80px)
  const qualityResize = useResizablePanel({
    direction: 'vertical',
    initialSize: 220,
    minSize: 120,
    maxSize: 600,
    collapseThreshold: 80,
    isCollapsed: !isQualityOpen,
    onCollapse: () => setIsQualityOpen(false),
    onExpand: () => setIsQualityOpen(true),
  })

  // Pre-flight Validator Panel Resizing Hook (vertical: min 140px, max 650px, default 380px, collapseThreshold 90px)
  const [isPreflightOpen, setIsPreflightOpen] = useState(false)
  const preflightResize = useResizablePanel({
    direction: 'vertical',
    initialSize: 380,
    minSize: 140,
    maxSize: 650,
    collapseThreshold: 90,
    isCollapsed: !isPreflightOpen,
    onCollapse: () => setIsPreflightOpen(false),
    onExpand: () => setIsPreflightOpen(true),
  })

  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<
    'dashboard' | 'diff' | 'preview' | 'git' | 'keyUsage'
  >('dashboard')
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [gitRepoInfo, setGitRepoInfo] = useState<GitRepositoryInfo | null>(null)
  const [gitStatus, setGitStatus] = useState<GitStatusSummary | null>(null)
  const [keyUsageResult, setKeyUsageResult] = useState<KeyUsageScanResult | null>(null)
  const [isScanningKeyUsage, setIsScanningKeyUsage] = useState(false)
  const [selectedKeyUsagePath, setSelectedKeyUsagePath] = useState<string | null>(null)
  const [targetPreviewLine, setTargetPreviewLine] = useState<number | undefined>(undefined)
  const [selectedLanguageTarget, setSelectedLanguageTarget] = useState<{
    filename: string
    problem: ProblemNavigationTarget | null
  } | null>(null)

  // Auto-close panels / fallbacks when features are toggled off
  useEffect(() => {
    if (!isGlobalSearchEnabled && isSearchOpen) {
      setIsSearchOpen(false)
    }
  }, [isGlobalSearchEnabled, isSearchOpen])

  useEffect(() => {
    if (!isQualityEnabled && isQualityOpen) {
      setIsQualityOpen(false)
    }
  }, [isQualityEnabled, isQualityOpen])

  useEffect(() => {
    if (!isPreflightEnabled && isPreflightOpen) {
      setIsPreflightOpen(false)
    }
  }, [isPreflightEnabled, isPreflightOpen])

  useEffect(() => {
    if (!isDiffViewerEnabled && activeWorkspaceTab === 'diff') {
      setActiveWorkspaceTab('dashboard')
    }
    if (!isGitEnabled && activeWorkspaceTab === 'git') {
      setActiveWorkspaceTab(isDiffViewerEnabled ? 'diff' : 'dashboard')
    }
    if (!isKeyUsageEnabled && activeWorkspaceTab === 'keyUsage') {
      setActiveWorkspaceTab(isDiffViewerEnabled ? 'diff' : 'dashboard')
    }
  }, [isDiffViewerEnabled, isGitEnabled, isKeyUsageEnabled, activeWorkspaceTab])

  const refreshGitSummary = useCallback(async (dirPath?: string | null) => {
    if (!isGitEnabled) {
      setGitRepoInfo(null)
      setGitStatus(null)
      return
    }
    const target = dirPath !== undefined ? dirPath : selectedDirectory
    if (!target) {
      setGitRepoInfo(null)
      setGitStatus(null)
      return
    }
    try {
      const info = await fetchRepositoryInfo(target)
      setGitRepoInfo(info)
      if (info.isRepository) {
        const status = await fetchGitStatus(target)
        setGitStatus(status)
      } else {
        setGitStatus(null)
      }
    } catch {
      setGitRepoInfo(null)
      setGitStatus(null)
    }
  }, [selectedDirectory, isGitEnabled])

  // Global keyboard shortcut: Ctrl+F / Cmd+F opens/focuses Global Search (when enabled)
  useEffect(() => {
    if (!isGlobalSearchEnabled) return
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setIsSearchOpen(true)
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [isGlobalSearchEnabled])

  // Parsing & Comparison State
  const [parseResults, setParseResults] = useState<FileParseResult[] | null>(null)
  const [noSelectionWarning, setNoSelectionWarning] = useState<string | null>(null)
  const [comparisonResult, setComparisonResult] = useState<LocalizationComparisonResult | null>(null)

  const loadWorkspacePath = useCallback(async (directory: string): Promise<boolean> => {
    setErrorMessage(null)
    setParseResults(null)
    setComparisonResult(null)
    setNoSelectionWarning(null)
    setSelectedPreviewFile(null)
    setSelectedLanguageTarget(null)
    setIsProblemsOpen(false)
    setIsQualityOpen(false)
    setIsPreflightOpen(false)
    setActiveWorkspaceTab('dashboard')

    let discoveredCandidates: DiscoveredFile[] = []
    let treeSuccess = false

    // 1. Try reading full directory tree for Project Explorer
    if (window.electronAPI?.readDirectoryTree) {
      try {
        const treeRes = await window.electronAPI.readDirectoryTree(directory)
        setTreeData(treeRes)
        treeSuccess = true

        // Collect strictly localization candidate files from tree
        const candidates: DiscoveredFile[] = []
        const collectJson = (entries: ProjectFileEntry[]) => {
          for (const entry of entries) {
            const isCandidate = entry.isLocalizationCandidate !== undefined
              ? Boolean(entry.isLocalizationCandidate)
              : isLocalizationFile(entry.relativePath || entry.name)

            if (!entry.isDirectory && isCandidate) {
              candidates.push({ name: entry.name, path: entry.path })
            } else if (entry.isDirectory && entry.children) {
              collectJson(entry.children)
            }
          }
        }
        collectJson(treeRes.entries)
        discoveredCandidates = candidates
      } catch (treeErr) {
        console.warn('[App] readDirectoryTree error, falling back:', treeErr)
      }
    }

    // 2. Fallback to getJsonFiles if tree was empty or readDirectoryTree unavailable
    if (discoveredCandidates.length === 0 && window.electronAPI?.getJsonFiles) {
      try {
        const files = await window.electronAPI.getJsonFiles(directory)
        discoveredCandidates = files.filter((f) => isLocalizationFile(f.name))
      } catch {
        if (!treeSuccess) {
          setSelectedDirectory(null)
          setTreeData(null)
          setJsonFiles([])
          setCheckedPaths(new Set())
          return false
        }
      }
    }

    if (!treeSuccess && discoveredCandidates.length === 0 && !window.electronAPI?.getJsonFiles && !window.electronAPI?.readDirectoryTree) {
      setSelectedDirectory(null)
      setTreeData(null)
      setJsonFiles([])
      setCheckedPaths(new Set())
      return false
    }

    setSelectedDirectory(directory)
    setJsonFiles(discoveredCandidates)
    setCheckedPaths(new Set(discoveredCandidates.map((f) => f.path)))

    // Parse discovered localization candidates in a single pass
    if (window.electronAPI?.readJsonFile && discoveredCandidates.length > 0) {
      const results: FileParseResult[] = []
      for (const file of discoveredCandidates) {
        try {
          const rawJson = await window.electronAPI.readJsonFile(file.path)
          const parsed = parseLocalizationData(file.name, file.path, rawJson)
          results.push({
            filename: file.name,
            path: file.path,
            success: true,
            data: parsed,
          })
        } catch (err) {
          results.push({
            filename: file.name,
            path: file.path,
            success: false,
            error: err instanceof Error ? err.message : 'Invalid JSON',
          })
        }
      }
      setParseResults(results)

      const validFiles = results
        .filter(
          (r): r is FileParseResult & { data: NonNullable<FileParseResult['data']> } =>
            r.success && !!r.data
        )
        .map((r) => r.data)

      if (validFiles.length >= 2) {
        const newComparison = compareLocalizationFiles(validFiles)
        setComparisonResult(newComparison)
      } else {
        setComparisonResult(null)
      }
    }

    refreshGitSummary(directory)
    return true
  }, [refreshGitSummary])

  // Automatically restore last opened workspace on application startup
  useEffect(() => {
    async function restoreWorkspace() {
      if (window.electronAPI?.getLastWorkspace) {
        try {
          const lastPath = await window.electronAPI.getLastWorkspace()
          if (lastPath) {
            const success = await loadWorkspacePath(lastPath)
            if (!success && window.electronAPI?.clearLastWorkspace) {
              await window.electronAPI.clearLastWorkspace()
            }
          }
        } catch (err) {
          console.warn('[App] Failed to restore workspace on startup:', err)
          if (window.electronAPI?.clearLastWorkspace) {
            try {
              await window.electronAPI.clearLastWorkspace()
            } catch {
              // ignore
            }
          }
        }
      }
    }
    restoreWorkspace()
  }, [loadWorkspacePath])

  const handleSelectFolder = async () => {
    if (!window.electronAPI?.selectDirectory) {
      setErrorMessage(t('app.electronUnavailable'))
      return
    }

    try {
      const directory = await window.electronAPI.selectDirectory()
      if (directory !== null) {
        const success = await loadWorkspacePath(directory)
        if (success && window.electronAPI?.setLastWorkspace) {
          try {
            await window.electronAPI.setLastWorkspace(directory)
          } catch (err) {
            console.warn('[App] Failed to persist last workspace:', err)
          }
        }
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : t('app.electronUnavailable')
      )
    }
  }

  const handleToggleFile = useCallback((path: string) => {
    setNoSelectionWarning(null)
    setCheckedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  const handleSelectAllJson = useCallback(() => {
    setNoSelectionWarning(null)
    setCheckedPaths(new Set(jsonFiles.map((f) => f.path)))
  }, [jsonFiles])

  const handleUnselectAllJson = useCallback(() => {
    setCheckedPaths(new Set())
  }, [])

  const handleRefreshTree = useCallback(async () => {
    if (!selectedDirectory) return
    if (window.electronAPI?.readDirectoryTree) {
      try {
        const treeRes = await window.electronAPI.readDirectoryTree(selectedDirectory)
        setTreeData(treeRes)
      } catch (err) {
        console.warn('[App] Error refreshing tree:', err)
      }
    }
    if (window.electronAPI?.getJsonFiles) {
      try {
        const files = await window.electronAPI.getJsonFiles(selectedDirectory)
        setJsonFiles(files.filter((f) => isLocalizationFile(f.name)))
      } catch (err) {
        console.warn('[App] Error refreshing files:', err)
      }
    }
  }, [selectedDirectory])

  const handleSelectFile = useCallback(
    async (
      filePath: string,
      fileName?: string,
      isLocCandidate?: boolean,
      targetLine?: number
    ) => {
      const name = fileName || filePath.split(/[/|\\]/).pop() || filePath
      const isCandidate =
        isLocCandidate !== undefined
          ? Boolean(isLocCandidate)
          : isLocalizationFile(name)

      setActiveFilePath(filePath)
      setSelectedPreviewFile({
        path: filePath,
        name,
        isLocalizationCandidate: isCandidate,
      })
      setTargetPreviewLine(targetLine)
      setActiveWorkspaceTab('preview')
      setPreviewLoading(true)
      setPreviewError(null)
      setPreviewIsBinary(false)
      setPreviewContent(null)

    try {
      if (window.electronAPI?.readFileText) {
        const res = await window.electronAPI.readFileText(filePath)
        if (res.success && res.content !== undefined) {
          setPreviewContent(res.content)
        } else if (res.isBinary) {
          setPreviewIsBinary(true)
        } else {
          setPreviewError(res.error || 'Failed to read file preview')
        }
      } else if (window.electronAPI?.readJsonFile && isCandidate) {
        const content = await window.electronAPI.readJsonFile(filePath)
        setPreviewContent(JSON.stringify(content, null, 2))
      } else {
        setPreviewError('File preview is not available.')
      }
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Error reading file')
    } finally {
      setPreviewLoading(false)
    }
  }, [])

  const handleRefreshFiles = useCallback(async () => {
    if (!window.electronAPI?.readJsonFile) {
      return
    }

    const filesToParse = jsonFiles.filter((f) => checkedPaths.has(f.path))
    const results: FileParseResult[] = []

    for (const file of filesToParse) {
      try {
        const rawJson = await window.electronAPI.readJsonFile(file.path)
        const parsed = parseLocalizationData(file.name, file.path, rawJson)
        results.push({
          filename: file.name,
          path: file.path,
          success: true,
          data: parsed,
        })
      } catch (err) {
        results.push({
          filename: file.name,
          path: file.path,
          success: false,
          error: err instanceof Error ? err.message : t('app.invalidJsonBadge'),
        })
      }
    }

    setParseResults(results)

    const validFiles = results
      .filter(
        (r): r is FileParseResult & { data: NonNullable<FileParseResult['data']> } =>
          r.success && !!r.data
      )
      .map((r) => r.data)

    if (validFiles.length >= 2) {
      const newComparison = compareLocalizationFiles(validFiles)
      setComparisonResult(newComparison)
    }

    refreshGitSummary()
  }, [jsonFiles, checkedPaths, t, refreshGitSummary])

  const successfulParsedFiles = useMemo(() => {
    if (!parseResults) return []
    return parseResults
      .filter(
        (r): r is FileParseResult & { data: NonNullable<FileParseResult['data']> } =>
          r.success && !!r.data
      )
      .map((r) => r.data)
  }, [parseResults])

  const coverageSummary = useMemo(() => {
    return calculateWorkspaceCoverage(successfulParsedFiles)
  }, [successfulParsedFiles])

  const workspaceProblems = useMemo(() => {
    return calculateWorkspaceProblems(successfulParsedFiles)
  }, [successfulParsedFiles])

  const workspaceQuality = useMemo(() => {
    if (!isQualityEnabled) {
      return EMPTY_WORKSPACE_QUALITY
    }
    return calculateWorkspaceQuality(successfulParsedFiles, comparisonResult)
  }, [successfulParsedFiles, comparisonResult, isQualityEnabled])

  const workspacePreflight = useMemo(() => {
    if (!isPreflightEnabled) {
      return validateWorkspacePreflight(EMPTY_WORKSPACE_QUALITY)
    }
    return validateWorkspacePreflight(workspaceQuality)
  }, [workspaceQuality, isPreflightEnabled])

  const handleSelectDashboardLanguage = useCallback(
    (filename: string) => {
      let currentComparison = comparisonResult
      if (!currentComparison && successfulParsedFiles.length >= 2) {
        currentComparison = compareLocalizationFiles(successfulParsedFiles)
        setComparisonResult(currentComparison)
      }
      const problem = getFirstProblemKeyForFile(filename, currentComparison)
      setSelectedLanguageTarget({ filename, problem })
      if (isDiffViewerEnabled) {
        setActiveWorkspaceTab('diff')
      }
    },
    [comparisonResult, successfulParsedFiles, isDiffViewerEnabled]
  )

  const handleNavigateFromProblem = useCallback(
    (problem: LocalizationProblem) => {
      let currentComparison = comparisonResult
      if (!currentComparison && successfulParsedFiles.length >= 2) {
        currentComparison = compareLocalizationFiles(successfulParsedFiles)
        setComparisonResult(currentComparison)
      }
      setSelectedLanguageTarget({
        filename: problem.filename,
        problem: {
          key: problem.key,
          mode: problem.type,
        },
      })
      if (isDiffViewerEnabled) {
        setActiveWorkspaceTab('diff')
      }
    },
    [comparisonResult, successfulParsedFiles, isDiffViewerEnabled]
  )

  const handleNavigateFromQuality = useCallback(
    (issue: LocalizationQualityIssue) => {
      let currentComparison = comparisonResult
      if (!currentComparison && successfulParsedFiles.length >= 2) {
        currentComparison = compareLocalizationFiles(successfulParsedFiles)
        setComparisonResult(currentComparison)
      }
      setSelectedLanguageTarget({
        filename: issue.filename,
        problem: {
          key: issue.key,
          mode: issue.type === 'missing_translation' ? 'missing' : 'empty',
        },
      })
      if (isDiffViewerEnabled) {
        setActiveWorkspaceTab('diff')
      }
    },
    [comparisonResult, successfulParsedFiles, isDiffViewerEnabled]
  )

  const handleNavigateFromSearch = useCallback(
    (result: LocalizationSearchResult) => {
      let currentComparison = comparisonResult
      if (!currentComparison && successfulParsedFiles.length >= 2) {
        currentComparison = compareLocalizationFiles(successfulParsedFiles)
        setComparisonResult(currentComparison)
      }
      setSelectedLanguageTarget({
        filename: result.filename,
        problem: {
          key: result.key,
          mode: result.isEmpty ? 'empty' : 'missing',
        },
      })
      if (isDiffViewerEnabled) {
        setActiveWorkspaceTab('diff')
      }
      setIsSearchOpen(false)
    },
    [comparisonResult, successfulParsedFiles, isDiffViewerEnabled]
  )

  const handleNavigateFromGit = useCallback(
    (filename: string, fullPath: string) => {
      let currentComparison = comparisonResult
      if (!currentComparison && successfulParsedFiles.length >= 2) {
        currentComparison = compareLocalizationFiles(successfulParsedFiles)
        setComparisonResult(currentComparison)
      }
      const matchedFile = successfulParsedFiles.find(
        (f) => f.filename === filename || f.path === fullPath
      )
      if (matchedFile) {
        setSelectedLanguageTarget({
          filename: matchedFile.filename,
          problem: null,
        })
        if (isDiffViewerEnabled) {
          setActiveWorkspaceTab('diff')
        }
      } else {
        handleSelectFile(fullPath, filename, isLocalizationFile(filename))
      }
    },
    [comparisonResult, successfulParsedFiles, handleSelectFile, isDiffViewerEnabled]
  )

  const refreshKeyUsage = useCallback(
    async (dir?: string | null, files?: ParsedLocalizationFile[]) => {
      if (!isKeyUsageEnabled) {
        setKeyUsageResult(null)
        setIsScanningKeyUsage(false)
        return
      }
      const targetDir = dir !== undefined ? dir : selectedDirectory
      const targetFiles = files !== undefined ? files : successfulParsedFiles
      if (!targetDir) {
        setKeyUsageResult(null)
        return
      }
      setIsScanningKeyUsage(true)
      try {
        const result = await performWorkspaceKeyUsageScan(targetDir, targetFiles)
        setKeyUsageResult(result)
      } catch (err) {
        console.warn('[App] Failed to scan key usage:', err)
      } finally {
        setIsScanningKeyUsage(false)
      }
    },
    [selectedDirectory, successfulParsedFiles, isKeyUsageEnabled]
  )

  useEffect(() => {
    if (!isKeyUsageEnabled) {
      setKeyUsageResult(null)
      setIsScanningKeyUsage(false)
      return
    }
    if (selectedDirectory) {
      let isCancelled = false
      setIsScanningKeyUsage(true)
      performWorkspaceKeyUsageScan(selectedDirectory, successfulParsedFiles)
        .then((result) => {
          if (!isCancelled) {
            setKeyUsageResult(result)
          }
        })
        .catch((err) => {
          if (!isCancelled) {
            console.warn('[App] Failed to scan key usage:', err)
          }
        })
        .finally(() => {
          if (!isCancelled) {
            setIsScanningKeyUsage(false)
          }
        })
      return () => {
        isCancelled = true
      }
    } else {
      setKeyUsageResult(null)
    }
  }, [selectedDirectory, successfulParsedFiles, isKeyUsageEnabled])

  const handleNavigateToSource = useCallback(
    (filePath: string, line: number) => {
      const name = filePath.split(/[/|\\]/).pop() || filePath
      handleSelectFile(filePath, name, isLocalizationFile(name), line)
    },
    [handleSelectFile]
  )

  const handleNavigateToLocalizationFromKeyUsage = useCallback(
    (key: string) => {
      let currentComparison = comparisonResult
      if (!currentComparison && successfulParsedFiles.length >= 2) {
        currentComparison = compareLocalizationFiles(successfulParsedFiles)
        setComparisonResult(currentComparison)
      }
      const primaryFile = successfulParsedFiles[0]?.filename || ''
      setSelectedLanguageTarget({
        filename: primaryFile,
        problem: {
          key,
          mode: 'missing',
        },
      })
      if (isDiffViewerEnabled) {
        setActiveWorkspaceTab('diff')
      }
    },
    [comparisonResult, successfulParsedFiles, isDiffViewerEnabled]
  )

  const handleOpenKeyUsageFromInspector = useCallback(
    (key: string) => {
      if (isKeyUsageEnabled) {
        setSelectedKeyUsagePath(key)
        setActiveWorkspaceTab('keyUsage')
      }
    },
    [isKeyUsageEnabled]
  )

  const folderName = useMemo(() => {
    if (!selectedDirectory) return null
    return treeData?.rootName || selectedDirectory.split(/[/|\\]/).filter(Boolean).pop() || selectedDirectory
  }, [selectedDirectory, treeData])

  const effectiveEngine = useMemo<import('./types/settings').TranslationEngine | null>(() => {
    if (settings.engine === 'free') {
      if (isFreeEnabled) return 'free'
      if (isAiEnabled) return 'ai'
      return null
    }
    if (isAiEnabled) return 'ai'
    if (isFreeEnabled) return 'free'
    return null
  }, [settings.engine, isAiEnabled, isFreeEnabled])

  const engineLabel = useMemo(() => {
    if (effectiveEngine === 'free') {
      const provider = settings.freeTranslation?.provider || 'libretranslate'
      return t('statusbar.engineFree', { provider })
    }
    if (effectiveEngine === 'ai') {
      const provider = settings.aiTranslation?.provider || 'mock'
      return t('statusbar.engineAi', { provider })
    }
    return t('statusbar.engineDisabled', { defaultValue: 'Translation Off' })
  }, [effectiveEngine, settings, t])

  return (
    <div className="app-container">
      {/* Top IDE Header Bar */}
      <header className="ide-header-bar">
        <div className="ide-header-left">
          <div className="app-brand-group">
            <span className="app-brand-icon">🌐</span>
            <h1 className="title app-brand-title">{t('app.title')}</h1>
            <span className="badge app-brand-badge">{t('app.badge')}</span>
          </div>

          <div
            className="selected-path-container ide-path-pill"
            data-testid="selected-path-display"
          >
            {selectedDirectory ? (
              <div className="selected-path-info ide-selected-path">
                <span className="path-label">{t('app.selectedFolder')}</span>
                <span className="selected-path-text" title={selectedDirectory}>
                  {selectedDirectory}
                </span>
              </div>
            ) : (
              <span className="empty-path-text">{t('app.noFolderSelected')}</span>
            )}
          </div>
        </div>

        <div className="ide-header-right">
          {isDiffViewerEnabled && comparisonResult && selectedPreviewFile && (
            <button
              type="button"
              className={`app-btn app-btn-md ide-tab-toggle-btn ${activeWorkspaceTab === 'diff' ? 'is-active-tab' : ''}`}
              onClick={() => setActiveWorkspaceTab('diff')}
              title={t('diff.viewDiffTooltip')}
            >
              📊 {t('app.compareFiles')}
            </button>
          )}

          {selectedPreviewFile && (
            <button
              type="button"
              className={`app-btn app-btn-md ide-tab-toggle-btn ${activeWorkspaceTab === 'preview' ? 'is-active-tab' : ''}`}
              onClick={() => setActiveWorkspaceTab('preview')}
              title={selectedPreviewFile.name}
            >
              📄 {selectedPreviewFile.name}
            </button>
          )}

          {isGitEnabled && selectedDirectory && (
            <button
              type="button"
              className={`app-btn app-btn-md ide-tab-toggle-btn ide-git-btn ${activeWorkspaceTab === 'git' ? 'is-active-tab' : ''}`}
              onClick={() => setActiveWorkspaceTab('git')}
              title={t('git.viewSourceControlTooltip')}
              data-testid="ide-git-btn"
            >
              🌿 {t('git.tabTitleShort')}
              {gitStatus && gitStatus.totalChanges > 0 && (
                <span className="ide-tab-badge">{gitStatus.totalChanges}</span>
              )}
            </button>
          )}

          {isKeyUsageEnabled && selectedDirectory && (
            <button
              type="button"
              className={`app-btn app-btn-md ide-tab-toggle-btn ide-key-usage-btn ${activeWorkspaceTab === 'keyUsage' ? 'is-active-tab' : ''}`}
              onClick={() => setActiveWorkspaceTab('keyUsage')}
              title={t('keyUsage.title')}
              data-testid="ide-key-usage-btn"
            >
              🔍 {t('keyUsage.tabTitleShort')}
              {keyUsageResult &&
                (keyUsageResult.missingKeysCount > 0 ||
                  keyUsageResult.unusedKeysCount > 0) && (
                  <span className="ide-tab-badge">
                    {keyUsageResult.missingKeysCount +
                      keyUsageResult.unusedKeysCount}
                  </span>
                )}
            </button>
          )}

          {isGlobalSearchEnabled && (
            <button
              type="button"
              className="app-btn app-btn-md ide-search-btn"
              data-testid="ide-search-btn"
              onClick={() => setIsSearchOpen(true)}
              title={t('search.openSearchTooltip')}
              aria-label={t('search.title')}
            >
              🔍 {t('search.title')}
            </button>
          )}

          <button
            type="button"
            className="app-btn app-btn-md ide-folder-btn select-button"
            onClick={handleSelectFolder}
          >
            📂 {t('app.selectFolder')}
          </button>

          <button
            type="button"
            className="app-btn app-btn-md settings-open-btn"
            onClick={() => setIsSettingsOpen(true)}
            aria-label={t('app.openSettings')}
            title={t('app.openSettings')}
          >
            ⚙ {t('settings.title')}
          </button>
        </div>
      </header>

      {/* Main Two-Column Workspace */}
      <div className="ide-workspace-body">
        {/* Left Column: Project Explorer */}
        <ProjectExplorer
          rootPath={selectedDirectory}
          rootName={folderName}
          treeEntries={treeData?.entries || []}
          flatJsonFiles={jsonFiles}
          checkedPaths={checkedPaths}
          activeFilePath={activeFilePath}
          onToggleCheckFile={handleToggleFile}
          onSelectAllJson={handleSelectAllJson}
          onUnselectAllJson={handleUnselectAllJson}
          onSelectFile={handleSelectFile}
          onOpenFolder={handleSelectFolder}
          onRefreshTree={handleRefreshTree}
          isCollapsed={isExplorerCollapsed}
          onToggleCollapseSidebar={() => {
            if (isExplorerCollapsed) {
              explorerResize.resetToLastSize()
              setIsExplorerCollapsed(false)
            } else {
              setIsExplorerCollapsed(true)
            }
          }}
          width={explorerResize.size}
          isResizing={explorerResize.isResizing}
          resizeHandleProps={{
            onPointerDown: explorerResize.handlePointerDown,
            onPointerMove: explorerResize.handlePointerMove,
            onPointerUp: explorerResize.handlePointerUp,
            onKeyDown: explorerResize.handleKeyDown,
            valueNow: explorerResize.size,
            valueMin: 180,
            valueMax: 600,
          }}
        />

        {/* Right Column: Main Editor Workspace */}
        <main className="ide-main-workspace" aria-label="Main Workspace">
          <div className="ide-main-workspace-content">
            {errorMessage && (
              <div className="error-message" role="alert">
                {errorMessage}
              </div>
            )}

            {noSelectionWarning && (
              <div className="warning-message" role="status">
                {noSelectionWarning}
              </div>
            )}

            {/* If preview mode is active, render FilePreview */}
            {activeWorkspaceTab === 'preview' && selectedPreviewFile ? (
              <FilePreview
                filePath={selectedPreviewFile.path}
                fileName={selectedPreviewFile.name}
                content={previewContent}
                isLoading={previewLoading}
                isBinary={previewIsBinary}
                errorMessage={previewError}
                isLocalizationCandidate={selectedPreviewFile.isLocalizationCandidate}
                isCheckedForComparison={checkedPaths.has(selectedPreviewFile.path)}
                targetLine={targetPreviewLine}
                onToggleCheckFile={() => handleToggleFile(selectedPreviewFile.path)}
                onClosePreview={() => {
                  setSelectedPreviewFile(null)
                  setTargetPreviewLine(undefined)
                  setActiveWorkspaceTab(
                    isDiffViewerEnabled && selectedLanguageTarget && comparisonResult
                      ? 'diff'
                      : 'dashboard'
                  )
                }}
              />
            ) : isDiffViewerEnabled && activeWorkspaceTab === 'diff' && comparisonResult ? (
              /* If Diff Viewer is active, render Diff Viewer */
              <LocalizationDiffViewer
                comparisonResult={comparisonResult}
                parsedFiles={successfulParsedFiles}
                settings={settings}
                onRefreshFiles={handleRefreshFiles}
                initialActiveFilename={selectedLanguageTarget?.filename}
                initialProblem={selectedLanguageTarget?.problem}
                qualityIssues={workspaceQuality.issues}
                keyUsageResult={keyUsageResult}
                onOpenKeyUsage={handleOpenKeyUsageFromInspector}
              />
            ) : isGitEnabled && activeWorkspaceTab === 'git' && selectedDirectory ? (
              /* If Source Control tab is active, render GitSourceControlView */
              <GitSourceControlView
                workspacePath={selectedDirectory}
                onNavigateToLocalizationFile={handleNavigateFromGit}
                onRefreshWorkspace={() => {
                  handleRefreshFiles()
                  refreshGitSummary()
                }}
                preflightReport={isPreflightEnabled ? workspacePreflight : null}
                onNavigateToIssue={handleNavigateFromQuality}
              />
            ) : isKeyUsageEnabled && activeWorkspaceTab === 'keyUsage' && selectedDirectory ? (
              /* If Key Usage tab is active, render KeyUsagePanel */
              <KeyUsagePanel
                scanResult={keyUsageResult}
                isLoading={isScanningKeyUsage}
                selectedKeyPath={selectedKeyUsagePath}
                onSelectKey={(key) => setSelectedKeyUsagePath(key)}
                onNavigateToSource={handleNavigateToSource}
                onNavigateToLocalization={handleNavigateToLocalizationFromKeyUsage}
                onRefreshScan={() => refreshKeyUsage()}
              />
            ) : selectedDirectory ? (
              /* If workspace is open, render Translation Coverage Dashboard as default view */
              <TranslationCoverageDashboard
                summary={coverageSummary}
                onSelectLanguage={handleSelectDashboardLanguage}
                onOpenFolder={handleSelectFolder}
                onOpenProblems={() => {
                  problemsResize.resetToLastSize()
                  setIsProblemsOpen(true)
                }}
                totalProblems={workspaceProblems.totalProblems}
              />
            ) : (
              /* Welcome / Empty workspace screen */
              <div className="ide-welcome-dashboard">
                <div className="ide-welcome-card">
                  <div className="ide-welcome-hero-icon">🌐</div>
                  <h2 className="ide-welcome-title">{t('app.title')}</h2>
                  <p className="description ide-welcome-desc">
                    {t('app.subtitle')}
                  </p>

                  <div className="ide-welcome-actions">
                    <button
                      type="button"
                      className="app-btn app-btn-md ide-welcome-btn select-button"
                      onClick={handleSelectFolder}
                    >
                      📂 {t('explorer.openFolder')}
                    </button>
                  </div>

                  <div className="ide-welcome-tips">
                    <div className="ide-tip-item">
                      <span className="ide-tip-icon">✨</span>
                      <span>AI & Free Translation with auto-batching and rate-limit handling</span>
                    </div>
                    <div className="ide-tip-item">
                      <span className="ide-tip-icon">🔍</span>
                      <span>Instant missing & empty key comparison and navigation</span>
                    </div>
                    <div className="ide-tip-item">
                      <span className="ide-tip-icon">⚡</span>
                      <span>Physical JSON key deletion with atomic file writes and Undo/Redo</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Problems Panel */}
          {selectedDirectory && (
            <ProblemsPanel
              isOpen={isProblemsOpen}
              onClose={() => setIsProblemsOpen(false)}
              summary={workspaceProblems}
              onNavigateProblem={handleNavigateFromProblem}
              height={problemsResize.size}
              isResizing={problemsResize.isResizing}
              resizeHandleProps={{
                onPointerDown: problemsResize.handlePointerDown,
                onPointerMove: problemsResize.handlePointerMove,
                onPointerUp: problemsResize.handlePointerUp,
                onKeyDown: problemsResize.handleKeyDown,
                valueNow: problemsResize.size,
                valueMin: 120,
                valueMax: 600,
              }}
            />
          )}

          {/* Bottom Quality Panel */}
          {isQualityEnabled && selectedDirectory && (
            <QualityPanel
              isOpen={isQualityOpen}
              onClose={() => setIsQualityOpen(false)}
              summary={workspaceQuality}
              onNavigateQuality={handleNavigateFromQuality}
              height={qualityResize.size}
              isResizing={qualityResize.isResizing}
              resizeHandleProps={{
                onPointerDown: qualityResize.handlePointerDown,
                onPointerMove: qualityResize.handlePointerMove,
                onPointerUp: qualityResize.handlePointerUp,
                onKeyDown: qualityResize.handleKeyDown,
                valueNow: qualityResize.size,
                valueMin: 120,
                valueMax: 600,
              }}
            />
          )}

          {/* Bottom Pre-flight Validator Panel */}
          {isPreflightEnabled && selectedDirectory && (
            <PreflightValidatorPanel
              isOpen={isPreflightOpen}
              onClose={() => setIsPreflightOpen(false)}
              report={workspacePreflight}
              onRunValidation={() => {
                if (successfulParsedFiles.length >= 2) {
                  setComparisonResult(compareLocalizationFiles(successfulParsedFiles))
                }
              }}
              onNavigateQuality={handleNavigateFromQuality}
              height={preflightResize.size}
              isResizing={preflightResize.isResizing}
              resizeHandleProps={{
                onPointerDown: preflightResize.handlePointerDown,
                onPointerMove: preflightResize.handlePointerMove,
                onPointerUp: preflightResize.handlePointerUp,
                onKeyDown: preflightResize.handleKeyDown,
                valueNow: preflightResize.size,
                valueMin: 140,
                valueMax: 650,
              }}
            />
          )}
        </main>
      </div>

      {/* Bottom IDE Status Bar */}
      <footer className="ide-status-bar">
        <div className="statusbar-left">
          <span className="statusbar-item statusbar-folder" title={selectedDirectory || ''}>
            📁 {selectedDirectory ? folderName : t('statusbar.noFolder')}
          </span>
          {jsonFiles.length > 0 && (
            <>
              <span className="statusbar-separator">|</span>
              <span className="statusbar-item">
                {t('statusbar.localizationCandidates', { count: jsonFiles.length })}
              </span>
              <span className="statusbar-separator">|</span>
              <span className="statusbar-item">
                {t('statusbar.selectedCount', { count: checkedPaths.size })}
              </span>
              <span className="statusbar-separator">|</span>
              <button
                type="button"
                className={`statusbar-btn statusbar-problems-btn ${
                  workspaceProblems.totalProblems > 0 ? 'has-problems' : 'no-problems'
                }`}
                data-testid="statusbar-problems-btn"
                onClick={() => {
                  if (!isProblemsOpen) {
                    problemsResize.resetToLastSize()
                    setIsProblemsOpen(true)
                  } else {
                    setIsProblemsOpen(false)
                  }
                }}
                title={t('problems.ariaLabel')}
              >
                {t('problems.statusBarItem', { count: workspaceProblems.totalProblems })}
              </button>
              {isQualityEnabled && (
                <>
                  <span className="statusbar-separator">|</span>
                  <button
                    type="button"
                    className={`statusbar-btn statusbar-quality-btn ${
                      workspaceQuality.totalIssues > 0 ? 'has-problems' : 'no-problems'
                    }`}
                    data-testid="statusbar-quality-btn"
                    onClick={() => {
                      if (!isQualityOpen) {
                        qualityResize.resetToLastSize()
                        setIsQualityOpen(true)
                      } else {
                        setIsQualityOpen(false)
                      }
                    }}
                    title={t('quality.ariaLabel')}
                  >
                    {t('quality.statusBarItem', { count: workspaceQuality.totalIssues })}
                  </button>
                </>
              )}
              {isPreflightEnabled && (
                <>
                  <span className="statusbar-separator">|</span>
                  <button
                    type="button"
                    className={`statusbar-btn statusbar-preflight-btn statusbar-preflight-${workspacePreflight.status.toLowerCase()}`}
                    data-testid="statusbar-preflight-btn"
                    onClick={() => {
                      if (!isPreflightOpen) {
                        preflightResize.resetToLastSize()
                        setIsPreflightOpen(true)
                      } else {
                        setIsPreflightOpen(false)
                      }
                    }}
                    title={t('preflight.ariaLabel')}
                  >
                    {workspacePreflight.status === 'PASS'
                      ? t('preflight.statusBarPass')
                      : workspacePreflight.status === 'WARNINGS'
                      ? t('preflight.statusBarWarnings', { count: workspacePreflight.totalWarnings })
                      : t('preflight.statusBarFailed', { count: workspacePreflight.totalErrors })}
                  </button>
                </>
              )}
              {isGitEnabled && (
                <>
                  <span className="statusbar-separator">|</span>
                  <button
                    type="button"
                    className={`statusbar-btn statusbar-git-btn ${
                      !gitRepoInfo?.isRepository
                        ? 'git-status-not-repo'
                        : !gitRepoInfo.isGitAvailable
                        ? 'git-status-unavailable'
                        : gitStatus && gitStatus.totalChanges > 0
                        ? 'git-status-changes'
                        : 'git-status-clean'
                    }`}
                    data-testid="statusbar-git-btn"
                    onClick={() => {
                      setActiveWorkspaceTab('git')
                    }}
                    title={t('git.viewSourceControlTooltip')}
                  >
                    {!gitRepoInfo?.isRepository
                      ? t('git.statusBarNotRepo')
                      : !gitRepoInfo.isGitAvailable
                      ? t('git.statusBarUnavailable')
                      : gitStatus && gitStatus.totalChanges > 0
                      ? t('git.statusBarChanges', { count: gitStatus.totalChanges })
                      : t('git.statusBarClean')}
                  </button>
                </>
              )}
              {isKeyUsageEnabled && (
                <>
                  <span className="statusbar-separator">|</span>
                  <button
                    type="button"
                    className={`statusbar-btn statusbar-key-usage-btn ${
                      keyUsageResult && keyUsageResult.missingKeysCount > 0
                        ? 'has-missing'
                        : ''
                    }`}
                    data-testid="statusbar-key-usage-btn"
                    onClick={() => {
                      setActiveWorkspaceTab('keyUsage')
                    }}
                    title={t('keyUsage.title')}
                  >
                    {keyUsageResult
                      ? t('keyUsage.statusBarItem', {
                          missing: keyUsageResult.missingKeysCount,
                          unused: keyUsageResult.unusedKeysCount,
                        })
                      : t('keyUsage.statusBarPending')}
                  </button>
                </>
              )}
            </>
          )}
        </div>

        <div className="statusbar-right">
          <span className="statusbar-item statusbar-engine" title="Active Translation Engine">
            ⚡ {engineLabel}
          </span>
          <span className="statusbar-separator">|</span>
          <span className="statusbar-item" title="Application Interface Language">
            🌐 {(settings.language || 'en').toUpperCase()}
          </span>
          <span className="statusbar-separator">|</span>
          <span className="statusbar-item statusbar-encoding">
            {t('statusbar.encoding')}
          </span>
        </div>
      </footer>

      {/* Global Search Dialog */}
      {isGlobalSearchEnabled && (
        <GlobalSearch
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
          onSelectResult={handleNavigateFromSearch}
          files={successfulParsedFiles}
          isWorkspaceOpen={!!selectedDirectory}
        />
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <SettingsModal
          settings={settings}
          isSaving={isSettingsSaving}
          saveError={settingsSaveError}
          onUpdateAiSettings={onUpdateAiSettings}
          onUpdateTranslationSettings={onUpdateTranslationSettings}
          onUpdateFeatureSettings={onUpdateFeatureSettings}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
    </div>
  )
}

export const App: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS)
  const [isSettingsSaving, setIsSettingsSaving] = useState(false)
  const [settingsSaveError, setSettingsSaveError] = useState<string | null>(null)

  // Load persisted settings on application mount
  useEffect(() => {
    async function loadSettings() {
      if (window.electronAPI?.getSettings) {
        try {
          const loaded = await window.electronAPI.getSettings()
          if (loaded && typeof loaded === 'object') {
            setSettings(loaded)
          }
        } catch {
          setSettings(DEFAULT_APP_SETTINGS)
        }
      }
    }
    loadSettings()
  }, [])

  const handleUpdateAiSettings = async (update: Partial<AiTranslationSettings>) => {
    setIsSettingsSaving(true)
    setSettingsSaveError(null)

    setSettings((prev) => ({
      ...prev,
      aiTranslation: {
        ...prev.aiTranslation,
        ...update,
        providers: {
          ...prev.aiTranslation.providers,
          ...(update.providers || {}),
        },
      },
    }))

    if (!window.electronAPI?.updateAiTranslationSettings) {
      setIsSettingsSaving(false)
      return
    }

    try {
      const updated = (await window.electronAPI.updateAiTranslationSettings(update)) as AppSettings
      if (updated && typeof updated === 'object') {
        setSettings(updated)
      }
    } catch (err) {
      setSettingsSaveError(
        err instanceof Error ? err.message : 'Failed to save settings.'
      )
    } finally {
      setIsSettingsSaving(false)
    }
  }

  const handleUpdateTranslationSettings = async (update: Partial<AppSettings>) => {
    setIsSettingsSaving(true)
    setSettingsSaveError(null)

    setSettings((prev) => ({
      ...prev,
      ...update,
      aiTranslation: update.aiTranslation
        ? {
            ...prev.aiTranslation,
            ...update.aiTranslation,
            providers: {
              ...(prev.aiTranslation?.providers || {}),
              ...(update.aiTranslation.providers || {}),
            },
          }
        : prev.aiTranslation,
      freeTranslation: update.freeTranslation
        ? {
            ...(prev.freeTranslation || DEFAULT_APP_SETTINGS.freeTranslation!),
            ...update.freeTranslation,
            providers: {
              ...(prev.freeTranslation?.providers || DEFAULT_APP_SETTINGS.freeTranslation!.providers),
              ...(update.freeTranslation.providers || {}),
            },
          }
        : prev.freeTranslation,
      features: update.features
        ? {
            ...(prev.features || DEFAULT_APP_SETTINGS.features),
            ...update.features,
          }
        : (prev.features || DEFAULT_APP_SETTINGS.features),
    }))

    if (!window.electronAPI?.updateTranslationSettings) {
      setIsSettingsSaving(false)
      return
    }

    try {
      const updated = (await window.electronAPI.updateTranslationSettings(update)) as AppSettings
      if (updated && typeof updated === 'object') {
        setSettings(updated)
      }
    } catch (err) {
      setSettingsSaveError(
        err instanceof Error ? err.message : 'Failed to save translation settings.'
      )
    } finally {
      setIsSettingsSaving(false)
    }
  }

  const handleUpdateFeatureSettings = async (
    update: Partial<import('./types/features').FeatureToggleState>
  ) => {
    setIsSettingsSaving(true)
    setSettingsSaveError(null)

    setSettings((prev) => ({
      ...prev,
      features: {
        ...(prev.features || DEFAULT_APP_SETTINGS.features),
        ...update,
      },
    }))

    if (!window.electronAPI?.updateFeatureSettings) {
      setIsSettingsSaving(false)
      return
    }

    try {
      const updated = (await window.electronAPI.updateFeatureSettings(update)) as AppSettings
      if (updated && typeof updated === 'object') {
        setSettings(updated)
      }
    } catch (err) {
      setSettingsSaveError(
        err instanceof Error ? err.message : 'Failed to save feature settings.'
      )
    } finally {
      setIsSettingsSaving(false)
    }
  }

  return (
    <I18nProvider language={settings.language || 'en'}>
      <AppContent
        settings={settings}
        isSettingsSaving={isSettingsSaving}
        settingsSaveError={settingsSaveError}
        onUpdateAiSettings={handleUpdateAiSettings}
        onUpdateTranslationSettings={handleUpdateTranslationSettings}
        onUpdateFeatureSettings={handleUpdateFeatureSettings}
      />
    </I18nProvider>
  )
}

export default App
