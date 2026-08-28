import React, { useState, useMemo } from 'react'
import type {
  LocalizationComparisonResult,
  ParsedLocalizationFile,
} from '../../types/localization'
import { buildLocalizationTree } from '../../services/localizationTree'
import { LocalizationSummary } from './LocalizationSummary'
import { LocalizationFileTabs } from './LocalizationFileTabs'
import { LocalizationTree } from './LocalizationTree'

interface LocalizationDiffViewerProps {
  comparisonResult: LocalizationComparisonResult
  parsedFiles: ParsedLocalizationFile[]
}

export const LocalizationDiffViewer: React.FC<LocalizationDiffViewerProps> = ({
  comparisonResult,
  parsedFiles,
}) => {
  const initialFilename = comparisonResult.comparedFiles[0]?.filename || ''
  const [activeFilename, setActiveFilename] = useState<string>(initialFilename)

  // Find the parsed file data for the currently active tab
  const activeFileData = useMemo(() => {
    return parsedFiles.find((f) => f.filename === activeFilename)
  }, [parsedFiles, activeFilename])

  // Derive tree data for the active file from comparison result + file keys
  const activeTreeData = useMemo(() => {
    return buildLocalizationTree(activeFilename, comparisonResult, activeFileData)
  }, [activeFilename, comparisonResult, activeFileData])

  return (
    <section className="diff-viewer-section" aria-label="Localization Diff Viewer">
      <LocalizationSummary comparisonResult={comparisonResult} />

      <div className="diff-editor-card">
        <LocalizationFileTabs
          files={comparisonResult.comparedFiles}
          activeFilename={activeFilename}
          activeTreeData={activeTreeData}
          onSelectFile={setActiveFilename}
        />

        <LocalizationTree rootNodes={activeTreeData.rootNodes} />
      </div>
    </section>
  )
}
