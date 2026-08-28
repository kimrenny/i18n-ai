import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import type {
  LocalizationComparisonResult,
  ParsedLocalizationFile,
  LocalizationTreeNode as TreeNodeType,
  MissingKeysAdditionPlan,
} from '../../types/localization'
import { buildLocalizationTree } from '../../services/localizationTree'
import { getMissingKeysForFile, getParentPaths } from '../../services/missingKeyNavigator'
import { planMissingKeysAddition } from '../../services/localizationWriter'
import { LocalizationSummary } from './LocalizationSummary'
import { LocalizationFileTabs } from './LocalizationFileTabs'
import { MissingKeyNavigator } from './MissingKeyNavigator'
import { LocalizationTree } from './LocalizationTree'
import { AddMissingKeysModal } from './AddMissingKeysModal'

interface LocalizationDiffViewerProps {
  comparisonResult: LocalizationComparisonResult
  parsedFiles: ParsedLocalizationFile[]
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
  onRefreshFiles,
}) => {
  const initialFilename = comparisonResult.comparedFiles[0]?.filename || ''
  const [activeFilename, setActiveFilename] = useState<string>(initialFilename)
  const [activeMissingKey, setActiveMissingKey] = useState<string | null>(null)
  const [collapsedSet, setCollapsedSet] = useState<Set<string>>(new Set())
  const [additionPlan, setAdditionPlan] = useState<MissingKeysAdditionPlan | null>(null)
  const [isWriting, setIsWriting] = useState(false)
  const [writeError, setWriteError] = useState<string | null>(null)
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

  // Clear stale active missing key if it no longer exists in current missing keys
  useEffect(() => {
    if (activeMissingKey !== null && !missingKeys.includes(activeMissingKey)) {
      setActiveMissingKey(null)
    }
  }, [missingKeys, activeMissingKey])

  const handleSelectFile = useCallback((filename: string) => {
    setActiveFilename(filename)
    setActiveMissingKey(null)
  }, [])

  const handleNavigate = useCallback((key: string) => {
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
  }, [])

  const handleTop = useCallback(() => {
    setActiveMissingKey(null)
    if (treeBodyRef.current) {
      treeBodyRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [])

  const handleNavigateFirstMissing = useCallback(
    (filename: string) => {
      if (filename !== activeFilename) {
        setActiveFilename(filename)
      }
      const targetMissing = getMissingKeysForFile(filename, comparisonResult)
      if (targetMissing.length > 0) {
        handleNavigate(targetMissing[0])
      }
    },
    [activeFilename, comparisonResult, handleNavigate]
  )

  const handleSelectRow = useCallback((fullKey: string, isMissing: boolean) => {
    if (isMissing) {
      setActiveMissingKey(fullKey)
    } else {
      setActiveMissingKey(null)
    }
  }, [])

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

  // Scroll active missing key into view smoothly when changed
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

      {writeError && (
        <div className="error-message" role="alert">
          {writeError}
        </div>
      )}

      <div className="diff-editor-card">
        <LocalizationFileTabs
          files={comparisonResult.comparedFiles}
          activeFilename={activeFilename}
          activeTreeData={activeTreeData}
          onSelectFile={handleSelectFile}
          onNavigateFirstMissing={handleNavigateFirstMissing}
        />

        <MissingKeyNavigator
          missingKeys={missingKeys}
          activeMissingKey={activeMissingKey}
          onNavigate={handleNavigate}
          onTop={handleTop}
        />

        <LocalizationTree
          rootNodes={activeTreeData.rootNodes}
          collapsedSet={collapsedSet}
          activeMissingKey={activeMissingKey}
          treeBodyRef={treeBodyRef}
          onToggleCollapse={handleToggleCollapse}
          onExpandAll={handleExpandAll}
          onCollapseAll={handleCollapseAll}
          onSelectRow={handleSelectRow}
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
    </section>
  )
}
