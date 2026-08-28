import React from 'react'
import type { FileTreeData } from '../../types/localization'

interface LocalizationFileTabsProps {
  files: { filename: string; path: string }[]
  activeFilename: string
  activeTreeData: FileTreeData
  onSelectFile: (filename: string) => void
}

export const LocalizationFileTabs: React.FC<LocalizationFileTabsProps> = ({
  files,
  activeFilename,
  activeTreeData,
  onSelectFile,
}) => {
  return (
    <div className="file-tabs-container" aria-label="Localization files tabs">
      <div className="file-tabs-scroll">
        {files.map((file) => {
          const isActive = file.filename === activeFilename
          return (
            <button
              key={file.filename}
              type="button"
              className={`file-tab ${isActive ? 'active-tab' : ''}`}
              onClick={() => onSelectFile(file.filename)}
              aria-selected={isActive}
              role="tab"
            >
              <span className="file-tab-icon">📄</span>
              <span className="file-tab-name">{file.filename}</span>
            </button>
          )
        })}
      </div>

      <div className="active-tab-stats" aria-label="Active file stats">
        <span className="active-tab-filename">{activeTreeData.filename}</span>
        <span className="active-tab-badge present-badge">
          {activeTreeData.presentKeysCount} keys
        </span>
        {activeTreeData.missingKeysCount > 0 ? (
          <span className="active-tab-badge missing-badge">
            {activeTreeData.missingKeysCount} missing
          </span>
        ) : (
          <span className="active-tab-badge complete-badge">0 missing</span>
        )}
      </div>
    </div>
  )
}
