import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import type {
  LocalizationComparisonResult,
  ParsedLocalizationFile,
  LocalizationTreeNode as TreeNodeType,
  MissingKeysAdditionPlan,
  JsonValue,
} from '../../types/localization'
import type { AppSettings } from '../../types/settings'
import { buildLocalizationTree } from '../../services/localizationTree'
import {
  getMissingKeysForFile,
  getEmptyKeysForFile,
  getParentPaths,
} from '../../services/missingKeyNavigator'
import {
  planMissingKeysAddition,
  updateSingleKeyInFile,
  deleteKeyFromFile,
  deleteSectionFromFile,
} from '../../services/localizationWriter'
import { LocalizationHistoryManager } from '../../services/localizationHistory'
import { countLeafDescendants } from '../../services/localizationTree'
import { shouldConfirmAiEdit } from '../../services/aiEditPolicy'
import {
  executeAiTranslation,
  findSourceReference,
  resolveLanguageFromFilename,
} from '../../services/aiTranslation'
import {
  createBatchTranslationPlan,
  executeBatchTranslation,
  retryFailedBatchTranslations,
  applyBatchTranslationPlan,
  type BatchTranslationPlan,
  type BatchProgress,
} from '../../services/aiBatchTranslation'
import { LocalizationSummary } from './LocalizationSummary'
import { LocalizationFileTabs } from './LocalizationFileTabs'
import { MissingKeyNavigator, type ProblemNavMode } from './MissingKeyNavigator'
import { LocalizationTree } from './LocalizationTree'
import { AddMissingKeysModal } from './AddMissingKeysModal'
import {
  AiTranslationConfirmModal,
  type AiTranslationProposal,
} from './AiTranslationConfirmModal'
import { BatchTranslationModal } from './BatchTranslationModal'
import { LocalizationContextMenu, type ContextMenuState } from './LocalizationContextMenu'
import { DeleteSectionModal } from './DeleteSectionModal'
import type { ProblemNavigationTarget } from '../../types/localizationCoverage'
import { useTranslation } from '../../i18n/useTranslation'

interface LocalizationDiffViewerProps {
  comparisonResult: LocalizationComparisonResult
  parsedFiles: ParsedLocalizationFile[]
  settings?: AppSettings
  onRefreshFiles: () => Promise<void>
  initialActiveFilename?: string
  initialProblem?: ProblemNavigationTarget | null
}

function collectFolderIds(nodes: TreeNodeType[]): string[] {
  const ids: string[] = []
  for (const node of nodes) {
    if (node.type === 'folder' || node.children.length > 0) {
      ids.push(node.id)
      ids.push(...collectFolderIds(node.children))
    }
  }
  return ids
}

export const LocalizationDiffViewer: React.FC<LocalizationDiffViewerProps> = ({
  comparisonResult,
  parsedFiles,
  settings,
  onRefreshFiles,
  initialActiveFilename,
  initialProblem,
}) => {
  const { t } = useTranslation()
  const initialFilename = initialActiveFilename || comparisonResult.comparedFiles[0]?.filename || ''
  const [activeFilename, setActiveFilename] = useState<string>(initialFilename)
  const [activeMissingKey, setActiveMissingKey] = useState<string | null>(initialProblem?.key || null)
  const [navMode, setNavMode] = useState<ProblemNavMode>(initialProblem?.mode || 'missing')
  const [collapsedSet, setCollapsedSet] = useState<Set<string>>(new Set())
  const [additionPlan, setAdditionPlan] = useState<MissingKeysAdditionPlan | null>(null)
  const [isWriting, setIsWriting] = useState(false)
  const [writeError, setWriteError] = useState<string | null>(null)

  // Manual inline translation editing state
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  const [isSavingKey, setIsSavingKey] = useState(false)
  const [saveKeyError, setSaveKeyError] = useState<string | null>(null)

  // History & Context Menu state
  const historyManagerRef = useRef<LocalizationHistoryManager>(new LocalizationHistoryManager())
  const [, setHistoryVersion] = useState(0)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [deleteSectionTarget, setDeleteSectionTarget] = useState<{
    sectionPath: string
    targetFilename: string
    targetFilePath: string
    entryCount: number
    node: TreeNodeType
  } | null>(null)
  const [isDeletingSection, setIsDeletingSection] = useState(false)

  // Single AI Translation state
  const [translatingKey, setTranslatingKey] = useState<string | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiSuccessMessage, setAiSuccessMessage] = useState<string | null>(null)
  const [aiProposal, setAiProposal] = useState<AiTranslationProposal | null>(null)
  const [isApplyingAi, setIsApplyingAi] = useState(false)

  // Batch Translation state
  const [batchPlan, setBatchPlan] = useState<BatchTranslationPlan | null>(null)
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null)
  const [isBatchTranslating, setIsBatchTranslating] = useState(false)
  const [isWritingBatch, setIsWritingBatch] = useState(false)
  const [batchError, setBatchError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const treeBodyRef = useRef<HTMLDivElement | null>(null)

  // Find the parsed file data for the currently active tab
  const activeFileData = useMemo(() => {
    return parsedFiles.find((f) => f.filename === activeFilename)
  }, [parsedFiles, activeFilename])

  // Derive tree data for the active file from comparison result + file keys
  const activeTreeData = useMemo(() => {
    return buildLocalizationTree(activeFilename, comparisonResult, activeFileData)
  }, [activeFilename, comparisonResult, activeFileData])

  // Missing keys list for the active file in deterministic order
  const missingKeys = useMemo(() => {
    return getMissingKeysForFile(activeFilename, comparisonResult)
  }, [activeFilename, comparisonResult])

  // Empty keys list for the active file in deterministic order
  const emptyKeys = useMemo(() => {
    return getEmptyKeysForFile(activeFilename, comparisonResult)
  }, [activeFilename, comparisonResult])

  // Clear stale active key if it no longer exists in current list
  useEffect(() => {
    const currentList = navMode === 'missing' ? missingKeys : emptyKeys
    if (activeMissingKey !== null && !currentList.includes(activeMissingKey)) {
      setActiveMissingKey(null)
    }
  }, [missingKeys, emptyKeys, activeMissingKey, navMode])

  useEffect(() => {
    if (initialProblem?.key) {
      const parentPaths = getParentPaths(initialProblem.key)
      if (parentPaths.length > 0) {
        setCollapsedSet((prev) => {
          let changed = false
          const next = new Set(prev)
          for (const p of parentPaths) {
            if (next.has(p)) {
              next.delete(p)
              changed = true
            }
          }
          return changed ? next : prev
        })
      }
    }
  }, [initialProblem])

  const handleSelectFile = useCallback((filename: string) => {
    setActiveFilename(filename)
    setActiveMissingKey(null)
    setEditingKey(null)
    setSaveKeyError(null)
    setAiError(null)
    setAiSuccessMessage(null)
  }, [])

  const handleNavigate = useCallback(
    (key: string, mode: ProblemNavMode = navMode) => {
      setNavMode(mode)
      const parentPaths = getParentPaths(key)
      if (parentPaths.length > 0) {
        setCollapsedSet((prev) => {
          let changed = false
          const next = new Set(prev)
          for (const p of parentPaths) {
            if (next.has(p)) {
              next.delete(p)
              changed = true
            }
          }
          return changed ? next : prev
        })
      }
      setActiveMissingKey(key)
    },
    [navMode]
  )

  const handleTop = useCallback(() => {
    setActiveMissingKey(null)
    if (treeBodyRef.current) {
      treeBodyRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [])

  const handleNavigateProblem = useCallback(
    (filename: string, mode: ProblemNavMode) => {
      if (filename !== activeFilename) {
        setActiveFilename(filename)
      }
      setNavMode(mode)
      const list =
        mode === 'missing'
          ? getMissingKeysForFile(filename, comparisonResult)
          : getEmptyKeysForFile(filename, comparisonResult)
      if (list.length > 0) {
        handleNavigate(list[0], mode)
      }
    },
    [activeFilename, comparisonResult, handleNavigate]
  )

  // Navigate to first problem across all files from summary counters
  const handleNavigateFirstProblemAcrossAllFiles = useCallback(
    (mode: ProblemNavMode) => {
      for (const file of comparisonResult.comparedFiles) {
        const list =
          mode === 'missing'
            ? getMissingKeysForFile(file.filename, comparisonResult)
            : getEmptyKeysForFile(file.filename, comparisonResult)
        if (list.length > 0) {
          handleNavigateProblem(file.filename, mode)
          return
        }
      }
    },
    [comparisonResult, handleNavigateProblem]
  )

  const handleSelectRow = useCallback(
    (fullKey: string, isMissing: boolean, isEmpty: boolean) => {
      if (isMissing) {
        setNavMode('missing')
        setActiveMissingKey(fullKey)
      } else if (isEmpty) {
        setNavMode('empty')
        setActiveMissingKey(fullKey)
      } else {
        setActiveMissingKey(null)
      }
    },
    []
  )

  const handleStartEdit = useCallback((fullKey: string, currentValue: string) => {
    setEditingKey(fullKey)
    setEditValue(currentValue)
    setSaveKeyError(null)
  }, [])

  const handleCancelEdit = useCallback(() => {
    setEditingKey(null)
    setEditValue('')
    setSaveKeyError(null)
  }, [])

  const handleSaveEdit = useCallback(async () => {
    if (!editingKey || !activeFileData) return
    if (!window.electronAPI?.writeJsonFiles) {
      setSaveKeyError('Unable to write files: Electron API is unavailable.')
      return
    }

    setIsSavingKey(true)
    setSaveKeyError(null)

    try {
      const { updatedRaw, formattedJson } = updateSingleKeyInFile(
        activeFileData.raw,
        editingKey,
        editValue
      )

      await window.electronAPI.writeJsonFiles([
        {
          path: activeFileData.path,
          content: formattedJson,
        },
      ])

      historyManagerRef.current.push({
        targetFile: activeFileData.filename,
        targetFilePath: activeFileData.path,
        type: 'edit_key',
        description: `Edit ${editingKey}`,
        key: editingKey,
        beforeRawJson: activeFileData.raw as Record<string, JsonValue>,
        afterRawJson: updatedRaw as Record<string, JsonValue>,
      })
      setHistoryVersion((v) => v + 1)

      setEditingKey(null)
      await onRefreshFiles()
    } catch (err) {
      setSaveKeyError(
        err instanceof Error ? err.message : t('errors.failedToSaveKey')
      )
    } finally {
      setIsSavingKey(false)
    }
  }, [editingKey, activeFileData, editValue, onRefreshFiles, t])

  const handleDeleteKey = useCallback(
    async (fullKey: string) => {
      if (!activeFileData) return
      if (!window.electronAPI?.writeJsonFiles) {
        setSaveKeyError('Unable to write files: Electron API is unavailable.')
        return
      }

      setSaveKeyError(null)
      try {
        const { updatedRaw, formattedJson, deleted } = deleteKeyFromFile(
          activeFileData.raw,
          fullKey
        )
        if (!deleted) return

        const res = await window.electronAPI.writeJsonFiles([
          {
            path: activeFileData.path,
            content: formattedJson,
          },
        ])
        if (!res || res.success === false) {
          throw new Error('Failed to write file')
        }

        historyManagerRef.current.push({
          targetFile: activeFileData.filename,
          targetFilePath: activeFileData.path,
          type: 'delete_key',
          description: `Delete ${fullKey}`,
          key: fullKey,
          beforeRawJson: activeFileData.raw as Record<string, JsonValue>,
          afterRawJson: updatedRaw as Record<string, JsonValue>,
        })
        setHistoryVersion((v) => v + 1)
        setEditingKey(null)
        await onRefreshFiles()
      } catch (err) {
        setSaveKeyError(
          err instanceof Error ? err.message : t('errors.failedToSaveKey')
        )
      }
    },
    [activeFileData, onRefreshFiles, t]
  )

  const handleRequestDeleteSection = useCallback(
    (sectionPath: string, node: TreeNodeType) => {
      if (!activeFileData) return
      const entryCount = countLeafDescendants(node)
      setDeleteSectionTarget({
        sectionPath,
        targetFilename: activeFileData.filename,
        targetFilePath: activeFileData.path,
        entryCount,
        node,
      })
    },
    [activeFileData]
  )

  const handleConfirmDeleteSection = useCallback(async () => {
    if (!deleteSectionTarget || !activeFileData) return
    if (!window.electronAPI?.writeJsonFiles) {
      setSaveKeyError('Unable to write files: Electron API is unavailable.')
      return
    }

    setIsDeletingSection(true)
    setSaveKeyError(null)
    try {
      const { updatedRaw, formattedJson, deleted } = deleteSectionFromFile(
        activeFileData.raw,
        deleteSectionTarget.sectionPath
      )
      if (deleted) {
        const res = await window.electronAPI.writeJsonFiles([
          {
            path: deleteSectionTarget.targetFilePath,
            content: formattedJson,
          },
        ])
        if (!res || res.success === false) {
          throw new Error('Failed to write file')
        }

        historyManagerRef.current.push({
          targetFile: deleteSectionTarget.targetFilename,
          targetFilePath: deleteSectionTarget.targetFilePath,
          type: 'delete_section',
          description: `Delete section ${deleteSectionTarget.sectionPath}`,
          sectionPath: deleteSectionTarget.sectionPath,
          count: deleteSectionTarget.entryCount,
          beforeRawJson: activeFileData.raw as Record<string, JsonValue>,
          afterRawJson: updatedRaw as Record<string, JsonValue>,
        })
        setHistoryVersion((v) => v + 1)
        setDeleteSectionTarget(null)
        setEditingKey(null)
        await onRefreshFiles()
      }
    } catch (err) {
      setSaveKeyError(
        err instanceof Error ? err.message : t('errors.failedToSaveKey')
      )
    } finally {
      setIsDeletingSection(false)
    }
  }, [deleteSectionTarget, activeFileData, onRefreshFiles, t])

  const handleUndo = useCallback(async () => {
    if (!window.electronAPI?.writeJsonFiles) return
    const action = historyManagerRef.current.undo(activeFilename)
    if (!action) return

    setSaveKeyError(null)
    try {
      const res = await window.electronAPI.writeJsonFiles([
        {
          path: action.targetFilePath,
          content: JSON.stringify(action.beforeRawJson, null, 2) + '\n',
        },
      ])
      if (!res || res.success === false) {
        throw new Error('Failed to write file')
      }
      setHistoryVersion((v) => v + 1)
      setEditingKey(null)
      await onRefreshFiles()
    } catch (err) {
      setSaveKeyError(
        err instanceof Error ? err.message : t('errors.failedToSaveKey')
      )
    }
  }, [activeFilename, onRefreshFiles, t])

  const handleRedo = useCallback(async () => {
    if (!window.electronAPI?.writeJsonFiles) return
    const action = historyManagerRef.current.redo(activeFilename)
    if (!action) return

    setSaveKeyError(null)
    try {
      const res = await window.electronAPI.writeJsonFiles([
        {
          path: action.targetFilePath,
          content: JSON.stringify(action.afterRawJson, null, 2) + '\n',
        },
      ])
      if (!res || res.success === false) {
        throw new Error('Failed to write file')
      }
      setHistoryVersion((v) => v + 1)
      setEditingKey(null)
      await onRefreshFiles()
    } catch (err) {
      setSaveKeyError(
        err instanceof Error ? err.message : t('errors.failedToSaveKey')
      )
    }
  }, [activeFilename, onRefreshFiles, t])

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, node: TreeNodeType) => {
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        node,
        targetFilename: activeFilename,
      })
    },
    [activeFilename]
  )

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return
      }

      const isCtrlOrMeta = e.ctrlKey || e.metaKey

      if (isCtrlOrMeta && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (historyManagerRef.current.canUndo(activeFilename)) {
          handleUndo()
        }
      } else if (
        isCtrlOrMeta &&
        (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))
      ) {
        e.preventDefault()
        if (historyManagerRef.current.canRedo(activeFilename)) {
          handleRedo()
        }
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [activeFilename, handleUndo, handleRedo])

  // AI Translation Execution Logic
  const executeApplyAiTranslation = useCallback(
    async (fullKey: string, textToApply: string) => {
      if (!activeFileData) return
      if (!window.electronAPI?.writeJsonFiles) {
        throw new Error(t('errors.electronUnavailableWrite'))
      }

      const { formattedJson } = updateSingleKeyInFile(
        activeFileData.raw,
        fullKey,
        textToApply
      )

      await window.electronAPI.writeJsonFiles([
        {
          path: activeFileData.path,
          content: formattedJson,
        },
      ])

      if (editingKey === fullKey) {
        setEditingKey(null)
      }

      setAiSuccessMessage(t('diff.appliedKeySuccess', { key: fullKey }))
      await onRefreshFiles()
    },
    [activeFileData, editingKey, onRefreshFiles, t]
  )

  const handleAiTranslate = useCallback(
    async (fullKey: string) => {
      if (translatingKey) return // Prevent concurrent duplicate requests

      setAiError(null)
      setAiSuccessMessage(null)

      const ref = findSourceReference(fullKey, activeFilename, parsedFiles)
      if (!ref) {
        setAiError(t('diff.noSourceRefFound', { key: fullKey }))
        return
      }

      setTranslatingKey(fullKey)

      try {
        const targetLanguage = resolveLanguageFromFilename(activeFilename)
        const response = await executeAiTranslation(
          {
            key: fullKey,
            sourceFile: ref.sourceFile,
            sourceLanguage: ref.sourceLanguage,
            targetFile: activeFilename,
            targetLanguage,
            sourceValue: ref.sourceValue,
          },
          settings || {
            engine: 'ai',
            aiTranslation: {
              provider: 'mock',
              requireEditConfirmation: true,
              providers: {
                mock: { model: 'mock-v1' },
                openai: { model: 'gpt-4o-mini' },
                gemini: { model: 'gemini-3.6-flash' },
                anthropic: { model: 'claude-3-5-sonnet-20241022' },
                mistral: { model: 'mistral-large-latest' },
                xai: { model: 'grok-2-latest' },
                deepseek: { model: 'deepseek-chat' },
                ollama: { model: 'llama3.1' },
              },
            },
          }
        )

        const needsConfirmation = shouldConfirmAiEdit(settings)

        if (needsConfirmation) {
          setAiProposal({
            key: fullKey,
            targetFile: activeFilename,
            targetLanguage,
            sourceFile: ref.sourceFile,
            sourceLanguage: ref.sourceLanguage,
            sourceValue: ref.sourceValue,
            translatedText: response.translatedText,
            provider: response.provider,
            model: response.model,
          })
        } else {
          // Automatic write mode when permission confirmation is disabled
          await executeApplyAiTranslation(fullKey, response.translatedText)
        }
      } catch (err) {
        setAiError(
          err instanceof Error ? err.message : t('errors.translationRequestFailed')
        )
      } finally {
        setTranslatingKey(null)
      }
    },
    [translatingKey, activeFilename, parsedFiles, settings, executeApplyAiTranslation, t]
  )

  const handleConfirmAiProposal = useCallback(
    async (finalText: string) => {
      if (!aiProposal) return
      setIsApplyingAi(true)
      setAiError(null)

      try {
        await executeApplyAiTranslation(aiProposal.key, finalText)
        setAiProposal(null)
      } catch (err) {
        setAiError(
          err instanceof Error ? err.message : t('errors.failedToApplyTranslation')
        )
      } finally {
        setIsApplyingAi(false)
      }
    },
    [aiProposal, executeApplyAiTranslation, t]
  )

  // Batch Translation Actions
  const handleConfirmApplyBatch = useCallback(
    async (planToApply?: BatchTranslationPlan) => {
      const activePlan = planToApply || batchPlan
      if (!activePlan || activePlan.items.length === 0) return

      if (!window.electronAPI?.writeJsonFiles) {
        setBatchError(t('errors.electronUnavailableWrite'))
        return
      }

      setIsWritingBatch(true)
      setBatchError(null)

      try {
        const { filesToModify, appliedCount } = applyBatchTranslationPlan(
          parsedFiles,
          activePlan
        )

        if (filesToModify.length > 0) {
          await window.electronAPI.writeJsonFiles(
            filesToModify.map((f) => ({ path: f.path, content: f.content }))
          )
        }

        setBatchPlan(null)
        setBatchProgress(null)
        setAiSuccessMessage(
          t('diff.appliedBatchSuccess', { count: appliedCount, files: filesToModify.length })
        )
        await onRefreshFiles()
      } catch (err) {
        setBatchError(
          err instanceof Error ? err.message : t('errors.failedToApplyBatch')
        )
      } finally {
        setIsWritingBatch(false)
      }
    },
    [batchPlan, parsedFiles, onRefreshFiles, t]
  )

  const handleStartBatchTranslate = useCallback(async () => {
    if (isBatchTranslating) return

    setAiError(null)
    setBatchError(null)
    setAiSuccessMessage(null)

    const initialPlan = createBatchTranslationPlan(parsedFiles, comparisonResult)
    if (initialPlan.totalCount === 0) return

    const controller = new AbortController()
    abortControllerRef.current = controller

    setIsBatchTranslating(true)
    setBatchPlan(initialPlan)
    setBatchProgress({
      current: 0,
      total: initialPlan.totalCount,
      currentBatch: 0,
      totalBatches: 1,
      keysInBatch: 0,
      currentKey: '',
      targetFile: '',
      successCount: 0,
      errorCount: 0,
    })

    try {
      const executedPlan = await executeBatchTranslation(
        initialPlan,
        settings || {
          engine: 'ai',
          aiTranslation: {
            provider: 'mock',
            requireEditConfirmation: true,
            providers: {
              mock: { model: 'mock-v1' },
              openai: { model: 'gpt-4o-mini' },
              gemini: { model: 'gemini-3.6-flash' },
              anthropic: { model: 'claude-3-5-sonnet-20241022' },
              mistral: { model: 'mistral-large-latest' },
              xai: { model: 'grok-2-latest' },
              deepseek: { model: 'deepseek-chat' },
              ollama: { model: 'llama3.1' },
            },
          },
        },
        (progress) => setBatchProgress(progress),
        controller.signal
      )

      setBatchPlan(executedPlan)

      const needsConfirmation = shouldConfirmAiEdit(settings)
      if (!needsConfirmation) {
        // Automatically apply without confirmation modal when requireEditConfirmation is false
        await handleConfirmApplyBatch(executedPlan)
      }
    } catch (err) {
      setBatchError(
        err instanceof Error ? err.message : 'Batch translation failed.'
      )
    } finally {
      setIsBatchTranslating(false)
      abortControllerRef.current = null
    }
  }, [
    isBatchTranslating,
    parsedFiles,
    comparisonResult,
    settings,
    handleConfirmApplyBatch,
  ])

  const handleRetryFailedBatch = useCallback(async () => {
    if (!batchPlan || isBatchTranslating) return

    setAiError(null)
    setBatchError(null)

    const controller = new AbortController()
    abortControllerRef.current = controller

    setIsBatchTranslating(true)

    try {
      const executedPlan = await retryFailedBatchTranslations(
        batchPlan,
        settings || {
          engine: 'ai',
          aiTranslation: {
            provider: 'mock',
            requireEditConfirmation: true,
            providers: {
              mock: { model: 'mock-v1' },
              openai: { model: 'gpt-4o-mini' },
              gemini: { model: 'gemini-3.6-flash' },
              anthropic: { model: 'claude-3-5-sonnet-20241022' },
              mistral: { model: 'mistral-large-latest' },
              xai: { model: 'grok-2-latest' },
              deepseek: { model: 'deepseek-chat' },
              ollama: { model: 'llama3.1' },
            },
          },
        },
        (progress) => setBatchProgress(progress),
        controller.signal
      )

      setBatchPlan(executedPlan)
    } catch (err) {
      setBatchError(
        err instanceof Error ? err.message : 'Retry batch translation failed.'
      )
    } finally {
      setIsBatchTranslating(false)
      abortControllerRef.current = null
    }
  }, [batchPlan, isBatchTranslating, settings])

  const handleCancelBatchTranslate = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setIsBatchTranslating(false)
  }, [])

  const handleUpdateProposedBatchTranslation = useCallback(
    (id: string, newText: string) => {
      setBatchPlan((prev) => {
        if (!prev) return null
        return {
          ...prev,
          items: prev.items.map((item) =>
            item.id === id ? { ...item, proposedTranslation: newText } : item
          ),
        }
      })
    },
    []
  )

  const handleToggleCollapse = useCallback((id: string) => {
    setCollapsedSet((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const handleExpandAll = useCallback(() => {
    setCollapsedSet(new Set())
  }, [])

  const handleCollapseAll = useCallback(() => {
    const allFolderIds = collectFolderIds(activeTreeData.rootNodes)
    setCollapsedSet(new Set(allFolderIds))
  }, [activeTreeData.rootNodes])

  const handleOpenAddMissingModal = () => {
    setWriteError(null)
    const plan = planMissingKeysAddition(parsedFiles, comparisonResult)
    setAdditionPlan(plan)
  }

  const handleConfirmWrite = async () => {
    if (!additionPlan || additionPlan.filesToModify.length === 0) {
      setAdditionPlan(null)
      return
    }

    if (!window.electronAPI?.writeJsonFiles) {
      setWriteError(t('errors.electronUnavailableWrite'))
      return
    }

    setIsWriting(true)
    setWriteError(null)

    try {
      const filesPayload = additionPlan.filesToModify.map((f) => ({
        path: f.path,
        content: f.formattedJson,
      }))

      await window.electronAPI.writeJsonFiles(filesPayload)
      setAdditionPlan(null)
      await onRefreshFiles()
    } catch (err) {
      setWriteError(
        err instanceof Error ? err.message : t('errors.failedToWriteFiles')
      )
    } finally {
      setIsWriting(false)
    }
  }

  // Scroll active problem key into view smoothly when changed
  useEffect(() => {
    if (activeMissingKey && treeBodyRef.current) {
      const timer = setTimeout(() => {
        if (!treeBodyRef.current) return
        const targetElement = treeBodyRef.current.querySelector<HTMLElement>(
          `[data-key="${activeMissingKey}"]`
        )
        if (targetElement) {
          targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 30)
      return () => clearTimeout(timer)
    }
  }, [activeMissingKey, collapsedSet])

  return (
    <section
      className="diff-viewer-section"
      data-testid="diff-viewer-section"
      aria-label={t('diff.viewerAria')}
    >
      <LocalizationSummary
        comparisonResult={comparisonResult}
        onOpenAddMissingModal={handleOpenAddMissingModal}
        onNavigateMissing={() =>
          handleNavigateFirstProblemAcrossAllFiles('missing')
        }
        onNavigateEmpty={() =>
          handleNavigateFirstProblemAcrossAllFiles('empty')
        }
        onStartBatchTranslate={handleStartBatchTranslate}
        isBatchTranslating={isBatchTranslating}
      />

      {aiSuccessMessage && (
        <div className="success-banner" role="status">
          {aiSuccessMessage}
        </div>
      )}

      {writeError && (
        <div className="error-message" role="alert">
          {writeError}
        </div>
      )}

      {saveKeyError && (
        <div className="error-message" role="alert">
          {saveKeyError}
        </div>
      )}

      {aiError && (
        <div className="error-message" role="alert">
          {aiError}
        </div>
      )}

      <div className="diff-editor-card" data-testid="localization-tree-panel">
        <LocalizationFileTabs
          files={comparisonResult.comparedFiles}
          activeFilename={activeFilename}
          activeTreeData={activeTreeData}
          onSelectFile={handleSelectFile}
          onNavigateProblem={handleNavigateProblem}
        />

        <MissingKeyNavigator
          missingKeys={missingKeys}
          emptyKeys={emptyKeys}
          activeMissingKey={activeMissingKey}
          navMode={navMode}
          onSelectNavMode={setNavMode}
          onNavigate={handleNavigate}
          onTop={handleTop}
        />

        <LocalizationTree
          rootNodes={activeTreeData.rootNodes}
          collapsedSet={collapsedSet}
          activeMissingKey={activeMissingKey}
          editingKey={editingKey}
          editValue={editValue}
          isSavingKey={isSavingKey}
          translatingKey={translatingKey}
          engine={settings?.engine || 'ai'}
          canUndo={historyManagerRef.current.canUndo(activeFilename)}
          canRedo={historyManagerRef.current.canRedo(activeFilename)}
          treeBodyRef={treeBodyRef}
          onToggleCollapse={handleToggleCollapse}
          onExpandAll={handleExpandAll}
          onCollapseAll={handleCollapseAll}
          onSelectRow={handleSelectRow}
          onStartEdit={handleStartEdit}
          onEditValueChange={setEditValue}
          onSaveEdit={handleSaveEdit}
          onCancelEdit={handleCancelEdit}
          onAiTranslate={handleAiTranslate}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onContextMenu={handleContextMenu}
        />
      </div>

      {contextMenu && (
        <LocalizationContextMenu
          state={contextMenu}
          canUndo={historyManagerRef.current.canUndo(activeFilename)}
          canRedo={historyManagerRef.current.canRedo(activeFilename)}
          onDeleteKey={handleDeleteKey}
          onDeleteSection={handleRequestDeleteSection}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onClose={() => setContextMenu(null)}
        />
      )}

      {deleteSectionTarget && (
        <DeleteSectionModal
          sectionPath={deleteSectionTarget.sectionPath}
          targetFilename={deleteSectionTarget.targetFilename}
          entryCount={deleteSectionTarget.entryCount}
          isDeleting={isDeletingSection}
          onConfirm={handleConfirmDeleteSection}
          onCancel={() => setDeleteSectionTarget(null)}
        />
      )}

      {additionPlan && (
        <AddMissingKeysModal
          plan={additionPlan}
          isWriting={isWriting}
          onConfirm={handleConfirmWrite}
          onClose={() => setAdditionPlan(null)}
        />
      )}

      {aiProposal && (
        <AiTranslationConfirmModal
          proposal={aiProposal}
          isApplying={isApplyingAi}
          error={aiError}
          onConfirm={handleConfirmAiProposal}
          onCancel={() => {
            setAiProposal(null)
            setAiError(null)
          }}
        />
      )}

      {batchPlan && (
        <BatchTranslationModal
          plan={batchPlan}
          progress={batchProgress}
          isTranslating={isBatchTranslating}
          isWriting={isWritingBatch}
          error={batchError}
          onUpdateProposedTranslation={handleUpdateProposedBatchTranslation}
          onCancelTranslate={handleCancelBatchTranslate}
          onRetryFailed={handleRetryFailedBatch}
          onConfirmApplyAll={() => handleConfirmApplyBatch()}
          onClose={() => {
            setBatchPlan(null)
            setBatchProgress(null)
            setBatchError(null)
          }}
        />
      )}
    </section>
  )
}
