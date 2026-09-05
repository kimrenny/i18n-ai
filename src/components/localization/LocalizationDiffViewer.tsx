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
  executeAiTranslationWithRetry,
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
import { AddTranslationKeyModal } from './AddTranslationKeyModal'
import { RenameTranslationKeyModal } from './RenameTranslationKeyModal'
import type { RenameTranslationKeyPlan } from '../../types/localizationKeyRename'
import { planAddTranslationKey } from '../../services/localizationKeyInsertion'
import type { AddKeyTargetMode } from '../../types/localizationKeyInsertion'
import type { ProblemNavigationTarget } from '../../types/localizationCoverage'
import { TranslationKeyInspector } from '../inspector/TranslationKeyInspector'
import { TranslationHistory } from '../history/TranslationHistory'
import type { TranslationHistoryItem } from '../../types/localizationHistoryView'
import {
  mapHistoryActionToViewItem,
  computeRevertFileChanges,
  computeRedoFileChanges,
} from '../../services/localizationHistoryView'
import { ResizeHandle } from '../common/ResizeHandle'
import {
  TranslationProgressToast,
  type TranslationProgressToastState,
} from '../common/TranslationProgressToast'
import { useResizablePanel } from '../../hooks/useResizablePanel'
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
  const [selectedKey, setSelectedKey] = useState<string | null>(initialProblem?.key || null)
  const [isInspectorOpen, setIsInspectorOpen] = useState(true)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [selectedHistoryItemId, setSelectedHistoryItemId] = useState<string | null>(null)
  const [isRevertingHistory, setIsRevertingHistory] = useState(false)
  const [navMode, setNavMode] = useState<ProblemNavMode>(initialProblem?.mode || 'missing')
  const [collapsedSet, setCollapsedSet] = useState<Set<string>>(new Set())
  const [additionPlan, setAdditionPlan] = useState<MissingKeysAdditionPlan | null>(null)
  const [isAddKeyOpen, setIsAddKeyOpen] = useState(false)
  const [isWriting, setIsWriting] = useState(false)
  const [writeError, setWriteError] = useState<string | null>(null)

  const inspectorResize = useResizablePanel({
    direction: 'horizontal',
    initialSize: 340,
    minSize: 240,
    maxSize: 560,
    reverseDelta: true,
    isCollapsed: !isInspectorOpen,
  })

  const historyResize = useResizablePanel({
    direction: 'horizontal',
    initialSize: 360,
    minSize: 260,
    maxSize: 600,
    reverseDelta: true,
    isCollapsed: !isHistoryOpen,
  })

  // Manual inline translation editing state (isolated by target file & key)
  const [editingTarget, setEditingTarget] = useState<{ filename: string; key: string } | null>(null)
  const editingKey = editingTarget?.filename === activeFilename ? editingTarget.key : null
  const [editValue, setEditValue] = useState<string>('')
  const [isSavingKey, setIsSavingKey] = useState(false)
  const [saveKeyError, setSaveKeyError] = useState<string | null>(null)

  // History & Context Menu state
  const historyManagerRef = useRef<LocalizationHistoryManager>(new LocalizationHistoryManager())
  const [historyVersion, setHistoryVersion] = useState(0)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [deleteSectionTarget, setDeleteSectionTarget] = useState<{
    sectionPath: string
    targetFilename: string
    targetFilePath: string
    entryCount: number
    node: TreeNodeType
  } | null>(null)
  const [isDeletingSection, setIsDeletingSection] = useState(false)
  const [renameKeyTarget, setRenameKeyTarget] = useState<string | null>(null)
  const [isWritingRename, setIsWritingRename] = useState(false)

  const historyItems = useMemo(() => {
    if (historyVersion < 0) return []
    const actions = historyManagerRef.current.getActions()
    return actions.map((a) => mapHistoryActionToViewItem(a, t))
  }, [historyVersion, t])

  // Single AI Translation state
  const [translatingKey, setTranslatingKey] = useState<string | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiSuccessMessage, setAiSuccessMessage] = useState<string | null>(null)
  const [aiProposal, setAiProposal] = useState<AiTranslationProposal | null>(null)
  const [isApplyingAi, setIsApplyingAi] = useState(false)
  const translationRequestIdRef = useRef<number>(0)
  const singleTranslationAbortRef = useRef<AbortController | null>(null)
  const [progressToastState, setProgressToastState] = useState<TranslationProgressToastState | null>(null)

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
    if (initialActiveFilename) {
      setEditingTarget(null)
      setEditValue('')
      setActiveFilename(initialActiveFilename)
    }
  }, [initialActiveFilename])

  useEffect(() => {
    if (initialProblem?.key) {
      setEditingTarget(null)
      setEditValue('')
      setSelectedKey(initialProblem.key)
      setActiveMissingKey(initialProblem.key)
      if (initialProblem.mode) {
        setNavMode(initialProblem.mode)
      }
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
    setEditingTarget(null)
    setEditValue('')
    setSaveKeyError(null)
    setAiError(null)
    setAiSuccessMessage(null)
  }, [])

  const handleNavigate = useCallback(
    (key: string, mode: ProblemNavMode = navMode) => {
      setEditingTarget(null)
      setEditValue('')
      setSaveKeyError(null)
      setSelectedKey(key)
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
      setEditingTarget(null)
      setEditValue('')
      setSaveKeyError(null)
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

  const handleNavigateFromInspector = useCallback(
    (filename: string, key: string) => {
      setEditingTarget(null)
      setEditValue('')
      setSaveKeyError(null)
      if (filename !== activeFilename) {
        setActiveFilename(filename)
      }
      setSelectedKey(key)
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
      const missingList = getMissingKeysForFile(filename, comparisonResult)
      const emptyList = getEmptyKeysForFile(filename, comparisonResult)
      if (missingList.includes(key)) {
        setNavMode('missing')
        setActiveMissingKey(key)
      } else if (emptyList.includes(key)) {
        setNavMode('empty')
        setActiveMissingKey(key)
      } else {
        setActiveMissingKey(null)
      }
    },
    [activeFilename, comparisonResult]
  )

  const handleSelectRow = useCallback(
    (fullKey: string, isMissing: boolean, isEmpty: boolean) => {
      setEditingTarget((prev) =>
        prev?.key === fullKey && prev.filename === activeFilename ? prev : null
      )
      setSaveKeyError(null)
      setSelectedKey(fullKey)
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
    [activeFilename]
  )

  const handleStartEdit = useCallback(
    (fullKey: string, currentValue: string) => {
      setEditingTarget({ filename: activeFilename, key: fullKey })
      setEditValue(currentValue)
      setSaveKeyError(null)
    },
    [activeFilename]
  )

  const handleCancelEdit = useCallback(() => {
    setEditingTarget(null)
    setEditValue('')
    setSaveKeyError(null)
  }, [])

  const handleSaveEdit = useCallback(async () => {
    if (!editingTarget || editingTarget.filename !== activeFilename || !activeFileData) return
    if (!window.electronAPI?.writeJsonFiles) {
      setSaveKeyError('Unable to write files: Electron API is unavailable.')
      return
    }

    const keyToSave = editingTarget.key
    const previousValue =
      typeof activeFileData.keys[keyToSave] === 'string'
        ? (activeFileData.keys[keyToSave] as string)
        : undefined

    setIsSavingKey(true)
    setSaveKeyError(null)

    try {
      const { updatedRaw, formattedJson } = updateSingleKeyInFile(
        activeFileData.raw,
        keyToSave,
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
        description: `Edit ${keyToSave}`,
        key: keyToSave,
        previousValue,
        newValue: editValue,
        beforeRawJson: activeFileData.raw as Record<string, JsonValue>,
        afterRawJson: updatedRaw as Record<string, JsonValue>,
      })
      setHistoryVersion((v) => v + 1)

      setEditingTarget(null)
      setEditValue('')
      await onRefreshFiles()
    } catch (err) {
      setSaveKeyError(
        err instanceof Error ? err.message : t('errors.failedToSaveKey')
      )
    } finally {
      setIsSavingKey(false)
    }
  }, [editingTarget, activeFilename, activeFileData, editValue, onRefreshFiles, t])

  const handleDeleteKey = useCallback(
    async (fullKey: string) => {
      if (!activeFileData) return
      if (!window.electronAPI?.writeJsonFiles) {
        setSaveKeyError('Unable to write files: Electron API is unavailable.')
        return
      }

      const previousValue =
        typeof activeFileData.keys[fullKey] === 'string'
          ? (activeFileData.keys[fullKey] as string)
          : ''

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
          previousValue,
          beforeRawJson: activeFileData.raw as Record<string, JsonValue>,
          afterRawJson: updatedRaw as Record<string, JsonValue>,
        })
        setHistoryVersion((v) => v + 1)
        setSelectedKey((prev) => (prev === fullKey ? null : prev))
        setActiveMissingKey((prev) => (prev === fullKey ? null : prev))
        setEditingTarget(null)
        setEditValue('')
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
        setEditingTarget(null)
        setEditValue('')
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

  const handleOpenRenameKey = useCallback((fullKey: string) => {
    setEditingTarget(null)
    setEditValue('')
    setRenameKeyTarget(fullKey)
  }, [])

  const handleConfirmRenameKey = useCallback(
    async (plan: RenameTranslationKeyPlan) => {
      if (!plan.canApply || plan.filesToModify.length === 0) return
      if (!window.electronAPI?.writeJsonFiles) {
        setSaveKeyError('Unable to write files: Electron API is unavailable.')
        return
      }

      setIsWritingRename(true)
      setSaveKeyError(null)

      try {
        const filesToWrite = plan.filesToModify.map((f) => ({
          path: f.path,
          content: f.formattedJson,
        }))

        const res = await window.electronAPI.writeJsonFiles(filesToWrite)
        if (!res || res.success === false) {
          throw new Error('Failed to write files during rename')
        }

        const activeFilePlan =
          plan.filesToModify.find((f) => f.filename === activeFilename) ||
          plan.filesToModify[0]

        historyManagerRef.current.push({
          targetFile: activeFilename,
          targetFilePath: activeFileData?.path || activeFilePlan.path,
          type: 'rename_key',
          description: `Rename ${plan.oldKey} to ${plan.newKey}`,
          key: plan.newKey,
          oldKey: plan.oldKey,
          newKey: plan.newKey,
          beforeRawJson:
            (activeFileData?.raw as Record<string, JsonValue>) ||
            activeFilePlan.beforeRawJson,
          afterRawJson: activeFilePlan.afterRawJson,
          batchChanges: plan.filesToModify.map((f) => ({
            targetFile: f.filename,
            targetFilePath: f.path,
            beforeRawJson: f.beforeRawJson,
            afterRawJson: f.afterRawJson,
          })),
        })
        setHistoryVersion((v) => v + 1)

        setRenameKeyTarget(null)
        setEditingTarget(null)
        setEditValue('')

        await onRefreshFiles()

        setSelectedKey(plan.newKey)
        if (activeMissingKey === plan.oldKey) {
          setActiveMissingKey(plan.newKey)
        }

        const parentPaths = getParentPaths(plan.newKey)
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
      } catch (err) {
        setSaveKeyError(
          err instanceof Error ? err.message : t('errors.failedToSaveKey')
        )
      } finally {
        setIsWritingRename(false)
      }
    },
    [activeFilename, activeFileData, activeMissingKey, onRefreshFiles, t]
  )

  const handleUndo = useCallback(async () => {
    if (!window.electronAPI?.writeJsonFiles) return
    const action = historyManagerRef.current.undo(activeFilename)
    if (!action) return

    setSaveKeyError(null)
    try {
      const filesToWrite = computeRevertFileChanges(action, parsedFiles)
      if (filesToWrite.length > 0) {
        const res = await window.electronAPI.writeJsonFiles(filesToWrite)
        if (!res || res.success === false) {
          throw new Error('Failed to write file')
        }
      }
      setHistoryVersion((v) => v + 1)
      setEditingTarget(null)
      setEditValue('')
      await onRefreshFiles()
    } catch (err) {
      setSaveKeyError(
        err instanceof Error ? err.message : t('errors.failedToSaveKey')
      )
    }
  }, [activeFilename, parsedFiles, onRefreshFiles, t])

  const handleRedo = useCallback(async () => {
    if (!window.electronAPI?.writeJsonFiles) return
    const action = historyManagerRef.current.redo(activeFilename)
    if (!action) return

    setSaveKeyError(null)
    try {
      const filesToWrite = computeRedoFileChanges(action, parsedFiles)
      if (filesToWrite.length > 0) {
        const res = await window.electronAPI.writeJsonFiles(filesToWrite)
        if (!res || res.success === false) {
          throw new Error('Failed to write file')
        }
      }
      setHistoryVersion((v) => v + 1)
      setEditingTarget(null)
      setEditValue('')
      await onRefreshFiles()
    } catch (err) {
      setSaveKeyError(
        err instanceof Error ? err.message : t('errors.failedToSaveKey')
      )
    }
  }, [activeFilename, parsedFiles, onRefreshFiles, t])

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

      const previousValue =
        typeof activeFileData.keys[fullKey] === 'string'
          ? (activeFileData.keys[fullKey] as string)
          : undefined

      const { updatedRaw, formattedJson } = updateSingleKeyInFile(
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

      const isFree = settings?.engine === 'free'
      historyManagerRef.current.push({
        targetFile: activeFileData.filename,
        targetFilePath: activeFileData.path,
        type: isFree ? 'free_translate' : 'ai_translate',
        description: `${isFree ? 'Free' : 'AI'} translate ${fullKey}`,
        key: fullKey,
        previousValue,
        newValue: textToApply,
        engine: settings?.engine || 'ai',
        beforeRawJson: activeFileData.raw as Record<string, JsonValue>,
        afterRawJson: updatedRaw as Record<string, JsonValue>,
      })
      setHistoryVersion((v) => v + 1)

      if (editingTarget?.key === fullKey && editingTarget.filename === activeFilename) {
        setEditingTarget(null)
        setEditValue('')
      }

      setAiSuccessMessage(t('diff.appliedKeySuccess', { key: fullKey }))
      await onRefreshFiles()
    },
    [activeFileData, editingTarget, activeFilename, settings, onRefreshFiles, t]
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

      const currentRequestId = ++translationRequestIdRef.current
      if (singleTranslationAbortRef.current) {
        singleTranslationAbortRef.current.abort()
      }
      const controller = new AbortController()
      singleTranslationAbortRef.current = controller

      const targetLanguage = resolveLanguageFromFilename(activeFilename)
      const isFreeEngine = settings?.engine === 'free'

      setTranslatingKey(fullKey)
      setProgressToastState({
        status: 'translating',
        attempt: 0,
        maxRetries: 3,
        key: fullKey,
        targetFile: activeFilename,
      })

      try {
        const requestPayload = {
          key: fullKey,
          sourceFile: ref.sourceFile,
          sourceLanguage: ref.sourceLanguage,
          targetFile: activeFilename,
          targetLanguage,
          sourceValue: ref.sourceValue,
        }

        const effectiveSettings = settings || {
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

        let response: { translatedText: string; provider: import('../../types/settings').AiProviderId; model: string; detectedLanguage?: string }
        if (isFreeEngine) {
          // Free Translation does NOT go through the 429 AI retry engine
          response = await executeAiTranslation(requestPayload, effectiveSettings)
        } else {
          // AI Translation with bounded 429 retry
          response = await executeAiTranslationWithRetry(
            requestPayload,
            effectiveSettings,
            {
              maxRetries: 3,
              signal: controller.signal,
              onProgress: (prog) => {
                if (currentRequestId !== translationRequestIdRef.current) return
                setProgressToastState({
                  status: prog.status,
                  attempt: prog.attempt,
                  maxRetries: prog.maxRetries,
                  delayRemainingMs: prog.delayRemainingMs,
                  key: fullKey,
                  targetFile: activeFilename,
                  error:
                    prog.error instanceof Error
                      ? prog.error.message
                      : typeof prog.error === 'string'
                      ? prog.error
                      : null,
                })
              },
            }
          )
        }

        if (currentRequestId !== translationRequestIdRef.current) {
          return
        }

        setProgressToastState({
          status: 'success',
          attempt: 0,
          maxRetries: 3,
          key: fullKey,
          targetFile: activeFilename,
          message: t('progress.completedKey', { key: fullKey }),
        })

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
        if (currentRequestId !== translationRequestIdRef.current) {
          return
        }
        const errorMsg =
          err instanceof Error ? err.message : t('errors.translationRequestFailed')
        setAiError(errorMsg)
        setProgressToastState({
          status: 'error',
          attempt: 3,
          maxRetries: 3,
          key: fullKey,
          targetFile: activeFilename,
          error: errorMsg,
        })
      } finally {
        if (currentRequestId === translationRequestIdRef.current) {
          setTranslatingKey(null)
          singleTranslationAbortRef.current = null
        }
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

          const isFree = settings?.engine === 'free'
          const primaryMod =
            filesToModify.find((f) => f.filename === activeFilename) ||
            filesToModify[0]
          const primaryParsed = parsedFiles.find(
            (f) => f.filename === primaryMod.filename
          )

          const batchItems = activePlan.items.map((item) => {
            const pf = parsedFiles.find((p) => p.filename === item.targetFile)
            const prevVal =
              pf && typeof pf.keys[item.key] === 'string'
                ? (pf.keys[item.key] as string)
                : undefined
            return {
              key: item.key,
              targetFile: item.targetFile,
              targetFilePath: pf?.path || item.targetFile,
              previousValue: prevVal,
              newValue: item.proposedTranslation,
            }
          })

          historyManagerRef.current.push({
            targetFile: primaryMod.filename,
            targetFilePath: primaryMod.path,
            type: isFree ? 'free_translate' : 'ai_translate',
            description: `${isFree ? 'Free' : 'AI'} batch translate (${appliedCount} keys)`,
            count: appliedCount,
            engine: settings?.engine || 'ai',
            beforeRawJson:
              (primaryParsed?.raw as Record<string, JsonValue>) || {},
            afterRawJson: JSON.parse(primaryMod.content),
            batchChanges: filesToModify.map((f) => {
              const p = parsedFiles.find((pf) => pf.filename === f.filename)
              return {
                targetFile: f.filename,
                targetFilePath: f.path,
                beforeRawJson: (p?.raw as Record<string, JsonValue>) || {},
                afterRawJson: JSON.parse(f.content),
              }
            }),
            batchItems,
          })
          setHistoryVersion((v) => v + 1)
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
    [batchPlan, parsedFiles, activeFilename, settings, onRefreshFiles, t]
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
      setProgressToastState({
        status: 'translating',
        isBatch: true,
        batchCurrent: 0,
        batchTotal: initialPlan.totalCount,
      })

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
        (progress) => {
          setBatchProgress(progress)
          if (progress.isRetrying) {
            setProgressToastState({
              status: 'retrying',
              isBatch: true,
              batchCurrent: progress.current,
              batchTotal: progress.total,
              attempt: progress.retryAttempt,
              maxRetries: progress.maxRetries || 3,
              delayRemainingMs: progress.retryDelayRemainingMs,
              key: progress.currentKey,
              targetFile: progress.targetFile,
            })
          } else {
            setProgressToastState({
              status: 'translating',
              isBatch: true,
              batchCurrent: progress.current,
              batchTotal: progress.total,
              key: progress.currentKey,
              targetFile: progress.targetFile,
            })
          }
        },
        controller.signal
      )

      setBatchPlan(executedPlan)
      setProgressToastState({
        status: 'success',
        isBatch: true,
        batchCurrent: executedPlan.totalCount,
        batchTotal: executedPlan.totalCount,
        message: t('progress.batchCompleted', { count: executedPlan.totalCount }),
      })

      const needsConfirmation = shouldConfirmAiEdit(settings)
      if (!needsConfirmation) {
        // Automatically apply without confirmation modal when requireEditConfirmation is false
        await handleConfirmApplyBatch(executedPlan)
      }
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : 'Batch translation failed.'
      setBatchError(errorMsg)
      setProgressToastState({
        status: 'error',
        isBatch: true,
        error: errorMsg,
      })
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
    t,
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

  const handleOpenAddKeyModal = useCallback(() => {
    setIsAddKeyOpen(true)
  }, [])

  const handleConfirmAddKey = useCallback(
    async (params: {
      key: string
      mode: AddKeyTargetMode
      singleTargetFile?: string
      translationsByFile: Record<string, string>
    }) => {
      if (!window.electronAPI?.writeJsonFiles) {
        throw new Error(t('errors.electronUnavailableWrite'))
      }

      const plan = planAddTranslationKey(parsedFiles, params)
      if (!plan.canApply || plan.filesToModify.length === 0) {
        if (plan.conflictMessages.length > 0) {
          throw new Error(plan.conflictMessages.join('; '))
        }
        return
      }

      const filesPayload = plan.filesToModify.map((f) => ({
        path: f.path,
        content: f.formattedJson,
      }))

      const res = await window.electronAPI.writeJsonFiles(filesPayload)
      if (!res || res.success === false) {
        throw new Error('Failed to write files')
      }

      const primaryModified =
        plan.filesToModify.find((f) => f.filename === activeFilename) ||
        plan.filesToModify[0]

      historyManagerRef.current.push({
        targetFile: primaryModified.filename,
        targetFilePath: primaryModified.path,
        type: 'add_key',
        description: `Add key ${plan.key}`,
        key: plan.key,
        newValue: primaryModified.value || '',
        count: plan.filesToModify.length,
        beforeRawJson: primaryModified.beforeRawJson,
        afterRawJson: primaryModified.afterRawJson,
        batchChanges:
          plan.filesToModify.length > 1
            ? plan.filesToModify.map((f) => ({
                targetFile: f.filename,
                targetFilePath: f.path,
                beforeRawJson: f.beforeRawJson,
                afterRawJson: f.afterRawJson,
              }))
            : undefined,
        batchItems: plan.filesToModify.map((f) => ({
          key: plan.key,
          targetFile: f.filename,
          targetFilePath: f.path,
          previousValue: undefined,
          newValue: f.value || '',
        })),
      })
      setHistoryVersion((v) => v + 1)

      // Refresh files across workspace
      await onRefreshFiles()

      // Activate target tab
      setActiveFilename(primaryModified.filename)

      // Expand parent folders for the new key
      const parentPaths = getParentPaths(plan.key)
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

      // Focus / highlight newly created key
      if (!primaryModified.value || primaryModified.value === '') {
        setNavMode('empty')
      }
      setActiveMissingKey(plan.key)
    },
    [parsedFiles, activeFilename, onRefreshFiles, t]
  )

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

      const primaryMod =
        additionPlan.filesToModify.find((f) => f.filename === activeFilename) ||
        additionPlan.filesToModify[0]
      const primaryParsed = parsedFiles.find((p) => p.filename === primaryMod.filename)

      const batchItems = additionPlan.filesToModify.flatMap((f) =>
        f.keysToAdd.map((k) => ({
          key: k.key,
          targetFile: f.filename,
          targetFilePath: f.path,
          previousValue: undefined,
          newValue: k.value,
        }))
      )

      historyManagerRef.current.push({
        targetFile: primaryMod.filename,
        targetFilePath: primaryMod.path,
        type: 'add_keys',
        description: `Add missing keys (${additionPlan.filesToModify.length} files)`,
        count: additionPlan.filesToModify.length,
        beforeRawJson: (primaryParsed?.raw as Record<string, JsonValue>) || {},
        afterRawJson: primaryMod.newRawJson as Record<string, JsonValue>,
        batchChanges: additionPlan.filesToModify.map((f) => {
          const parsed = parsedFiles.find((p) => p.filename === f.filename)
          return {
            targetFile: f.filename,
            targetFilePath: f.path,
            beforeRawJson: (parsed?.raw as Record<string, JsonValue>) || {},
            afterRawJson: f.newRawJson as Record<string, JsonValue>,
          }
        }),
        batchItems,
      })
      setHistoryVersion((v) => v + 1)

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

  const handleNavigateFromHistory = useCallback(
    (item: TranslationHistoryItem) => {
      setEditingTarget(null)
      setEditValue('')
      setSaveKeyError(null)

      if (item.targetFile && item.targetFile !== activeFilename) {
        setActiveFilename(item.targetFile)
      }

      const targetKey = item.newKey || item.key
      if (targetKey) {
        setSelectedKey(targetKey)
        setActiveMissingKey(targetKey)
        const parentPaths = getParentPaths(targetKey)
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
    },
    [activeFilename]
  )

  const handleRevertFromHistory = useCallback(
    async (item: TranslationHistoryItem) => {
      if (!window.electronAPI?.writeJsonFiles) {
        setSaveKeyError('Unable to write files: Electron API is unavailable.')
        return
      }

      setIsRevertingHistory(true)
      setSaveKeyError(null)

      try {
        const filesToWrite = computeRevertFileChanges(item.action, parsedFiles)
        if (filesToWrite.length > 0) {
          const res = await window.electronAPI.writeJsonFiles(filesToWrite)
          if (!res || res.success === false) {
            throw new Error('Failed to restore files during history revert')
          }
        }

        historyManagerRef.current.push({
          targetFile: item.targetFile,
          targetFilePath: item.targetFilePath,
          type: item.action.type,
          description: `Revert ${item.summary}`,
          key: item.action.key,
          oldKey: item.action.newKey,
          newKey: item.action.oldKey,
          previousValue: item.action.newValue,
          newValue: item.action.previousValue,
          sectionPath: item.action.sectionPath,
          count: item.action.count,
          beforeRawJson: item.action.afterRawJson,
          afterRawJson: item.action.beforeRawJson,
          batchChanges: item.action.batchChanges?.map((c) => ({
            targetFile: c.targetFile,
            targetFilePath: c.targetFilePath,
            beforeRawJson: c.afterRawJson,
            afterRawJson: c.beforeRawJson,
          })),
          batchItems: item.action.batchItems?.map((b) => ({
            key: b.key,
            targetFile: b.targetFile,
            targetFilePath: b.targetFilePath,
            previousValue: b.newValue,
            newValue: b.previousValue,
          })),
        })
        setHistoryVersion((v) => v + 1)

        setEditingTarget(null)
        setEditValue('')

        await onRefreshFiles()

        if (item.targetFile) {
          setActiveFilename(item.targetFile)
        }
        const restoredKey = item.oldKey || item.key
        if (restoredKey) {
          setSelectedKey(restoredKey)
          setActiveMissingKey(restoredKey)
          const parentPaths = getParentPaths(restoredKey)
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
      } catch (err) {
        setSaveKeyError(
          err instanceof Error ? err.message : t('errors.failedToSaveKey')
        )
      } finally {
        setIsRevertingHistory(false)
      }
    },
    [parsedFiles, onRefreshFiles, t]
  )

  const handleClearHistory = useCallback(() => {
    historyManagerRef.current.clear()
    setHistoryVersion((v) => v + 1)
    setSelectedHistoryItemId(null)
  }, [])

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
        onOpenAddKeyModal={handleOpenAddKeyModal}
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

        <div className="diff-editor-split-body">
          <div className="diff-tree-column">
            <LocalizationTree
              rootNodes={activeTreeData.rootNodes}
              collapsedSet={collapsedSet}
              activeMissingKey={activeMissingKey}
              selectedKey={selectedKey}
              isInspectorOpen={isInspectorOpen}
              isHistoryOpen={isHistoryOpen}
              onToggleInspector={() => setIsInspectorOpen((prev) => !prev)}
              onToggleHistory={() => setIsHistoryOpen((prev) => !prev)}
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

          {isInspectorOpen && (
            <>
              <ResizeHandle
                direction="horizontal"
                onPointerDown={inspectorResize.handlePointerDown}
                onPointerMove={inspectorResize.handlePointerMove}
                onPointerUp={inspectorResize.handlePointerUp}
                onKeyDown={inspectorResize.handleKeyDown}
                valueNow={inspectorResize.size}
                valueMin={240}
                valueMax={560}
                ariaLabel={t('inspector.title')}
                testId="inspector-resize-handle"
              />
              <div
                className="diff-inspector-column"
                style={{ width: `${inspectorResize.size}px` }}
              >
                <TranslationKeyInspector
                  selectedKey={selectedKey}
                  parsedFiles={parsedFiles}
                  onNavigateLanguage={handleNavigateFromInspector}
                  onClose={() => setIsInspectorOpen(false)}
                />
              </div>
            </>
          )}

          {isHistoryOpen && (
            <>
              <ResizeHandle
                direction="horizontal"
                onPointerDown={historyResize.handlePointerDown}
                onPointerMove={historyResize.handlePointerMove}
                onPointerUp={historyResize.handlePointerUp}
                onKeyDown={historyResize.handleKeyDown}
                valueNow={historyResize.size}
                valueMin={260}
                valueMax={600}
                ariaLabel={t('history.title')}
                testId="history-resize-handle"
              />
              <div
                className="diff-history-column"
                style={{ width: `${historyResize.size}px` }}
              >
                <TranslationHistory
                  items={historyItems}
                  selectedItemId={selectedHistoryItemId}
                  onSelectItem={(item) => setSelectedHistoryItemId(item?.id || null)}
                  onNavigateKey={handleNavigateFromHistory}
                  onRevertItem={handleRevertFromHistory}
                  onClearHistory={handleClearHistory}
                  onClose={() => setIsHistoryOpen(false)}
                  isReverting={isRevertingHistory}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {contextMenu && (
        <LocalizationContextMenu
          state={contextMenu}
          canUndo={historyManagerRef.current.canUndo(activeFilename)}
          canRedo={historyManagerRef.current.canRedo(activeFilename)}
          onRenameKey={handleOpenRenameKey}
          onDeleteKey={handleDeleteKey}
          onDeleteSection={handleRequestDeleteSection}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onClose={() => setContextMenu(null)}
        />
      )}

      {renameKeyTarget && (
        <RenameTranslationKeyModal
          oldKey={renameKeyTarget}
          parsedFiles={parsedFiles}
          isWriting={isWritingRename}
          onConfirm={handleConfirmRenameKey}
          onCancel={() => setRenameKeyTarget(null)}
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

      {isAddKeyOpen && (
        <AddTranslationKeyModal
          isOpen={isAddKeyOpen}
          parsedFiles={parsedFiles}
          initialActiveFilename={activeFilename}
          onClose={() => setIsAddKeyOpen(false)}
          onConfirmAddKey={handleConfirmAddKey}
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

      <TranslationProgressToast
        state={progressToastState}
        onDismiss={() => setProgressToastState(null)}
      />
    </section>
  )
}
