import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import type {
  LocalizationComparisonResult,
  ParsedLocalizationFile,
  LocalizationTreeNode as TreeNodeType,
  MissingKeysAdditionPlan,
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
} from '../../services/localizationWriter'
import { shouldConfirmAiEdit } from '../../services/aiEditPolicy'
import {
  getAiTranslationProvider,
  findSourceReference,
} from '../../services/aiTranslation'
import { LocalizationSummary } from './LocalizationSummary'
import { LocalizationFileTabs } from './LocalizationFileTabs'
import { MissingKeyNavigator, type ProblemNavMode } from './MissingKeyNavigator'
import { LocalizationTree } from './LocalizationTree'
import { AddMissingKeysModal } from './AddMissingKeysModal'
import {
  AiTranslationConfirmModal,
  type AiTranslationProposal,
} from './AiTranslationConfirmModal'

interface LocalizationDiffViewerProps {
  comparisonResult: LocalizationComparisonResult
  parsedFiles: ParsedLocalizationFile[]
  settings?: AppSettings
  onRefreshFiles: () => Promise<void>
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
}) => {
  const initialFilename = comparisonResult.comparedFiles[0]?.filename || ''
  const [activeFilename, setActiveFilename] = useState<string>(initialFilename)
  const [activeMissingKey, setActiveMissingKey] = useState<string | null>(null)
  const [navMode, setNavMode] = useState<ProblemNavMode>('missing')
  const [collapsedSet, setCollapsedSet] = useState<Set<string>>(new Set())
  const [additionPlan, setAdditionPlan] = useState<MissingKeysAdditionPlan | null>(null)
  const [isWriting, setIsWriting] = useState(false)
  const [writeError, setWriteError] = useState<string | null>(null)

  // Manual inline translation editing state
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  const [isSavingKey, setIsSavingKey] = useState(false)
  const [saveKeyError, setSaveKeyError] = useState<string | null>(null)

  // AI Translation state
  const [translatingKey, setTranslatingKey] = useState<string | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiSuccessMessage, setAiSuccessMessage] = useState<string | null>(null)
  const [aiProposal, setAiProposal] = useState<AiTranslationProposal | null>(null)
  const [isApplyingAi, setIsApplyingAi] = useState(false)

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
      const { formattedJson } = updateSingleKeyInFile(
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

      setEditingKey(null)
      await onRefreshFiles()
    } catch (err) {
      setSaveKeyError(
        err instanceof Error ? err.message : 'Failed to save translation to disk.'
      )
    } finally {
      setIsSavingKey(false)
    }
  }, [editingKey, activeFileData, editValue, onRefreshFiles])

  // AI Translation Execution Logic
  const executeApplyAiTranslation = useCallback(
    async (fullKey: string, textToApply: string) => {
      if (!activeFileData) return
      if (!window.electronAPI?.writeJsonFiles) {
        throw new Error('Unable to write files: Electron API is unavailable.')
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

      setAiSuccessMessage(`✓ Applied AI translation for ${fullKey}`)
      await onRefreshFiles()
    },
    [activeFileData, editingKey, onRefreshFiles]
  )

  const handleAiTranslate = useCallback(
    async (fullKey: string) => {
      if (translatingKey) return // Prevent concurrent duplicate requests

      setAiError(null)
      setAiSuccessMessage(null)

      const ref = findSourceReference(fullKey, activeFilename, parsedFiles)
      if (!ref) {
        setAiError(`No source translation found for "${fullKey}" in other compared files.`)
        return
      }

      setTranslatingKey(fullKey)

      try {
        const provider = getAiTranslationProvider()
        const response = await provider.translate({
          key: fullKey,
          sourceFile: ref.sourceFile,
          targetFile: activeFilename,
          sourceValue: ref.sourceValue,
        })

        const needsConfirmation = shouldConfirmAiEdit(settings)

        if (needsConfirmation) {
          setAiProposal({
            key: fullKey,
            targetFile: activeFilename,
            sourceFile: ref.sourceFile,
            sourceValue: ref.sourceValue,
            translatedText: response.translatedText,
          })
        } else {
          // Automatic write mode when permission confirmation is disabled
          await executeApplyAiTranslation(fullKey, response.translatedText)
        }
      } catch (err) {
        setAiError(
          err instanceof Error ? err.message : 'AI translation request failed.'
        )
      } finally {
        setTranslatingKey(null)
      }
    },
    [translatingKey, activeFilename, parsedFiles, settings, executeApplyAiTranslation]
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
          err instanceof Error ? err.message : 'Failed to apply AI translation.'
        )
      } finally {
        setIsApplyingAi(false)
      }
    },
    [aiProposal, executeApplyAiTranslation]
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
      setWriteError('Unable to write files: Electron API is unavailable.')
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
        err instanceof Error ? err.message : 'Failed to write files to disk.'
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
    <section className="diff-viewer-section" aria-label="Localization Diff Viewer">
      <LocalizationSummary
        comparisonResult={comparisonResult}
        onOpenAddMissingModal={handleOpenAddMissingModal}
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

      <div className="diff-editor-card">
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
        />
      </div>

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
    </section>
  )
}
