import React from 'react'
import type { FileTreeData } from '../../types/localization'
import type { ProblemNavMode } from './MissingKeyNavigator'
import { useTranslation } from '../../i18n/useTranslation'

interface LocalizationFileTabsProps {
  files: { filename: string; path: string }[]
  activeFilename: string
  activeTreeData: FileTreeData
  onSelectFile: (filename: string) => void
  onNavigateProblem: (filename: string, mode: ProblemNavMode) => void
}

export const LocalizationFileTabs: React.FC<LocalizationFileTabsProps> = ({
  files,
  activeFilename,
  activeTreeData,
  onSelectFile,
  onNavigateProblem,
}) => {
  const { t } = useTranslation()

  return (
    <div className="file-tabs-container" aria-label={t('fileTabs.tabsAria')}>
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

      <div className="active-tab-stats" aria-label={t('fileTabs.statsAria')}>
        <span className="active-tab-filename">{activeTreeData.filename}</span>
        <span className="active-tab-badge present-badge">
          {t('fileTabs.keysCount', { count: activeTreeData.presentKeysCount })}
        </span>

        {activeTreeData.missingKeysCount > 0 ? (
          <button
            type="button"
            className="active-tab-badge missing-badge clickable-missing-badge"
            onClick={() => onNavigateProblem(activeFilename, 'missing')}
            title={t('fileTabs.missingTitle')}
            aria-label={t('fileTabs.missingAria', { count: activeTreeData.missingKeysCount })}
          >
            {t('fileTabs.missingBadge', { count: activeTreeData.missingKeysCount })}
          </button>
        ) : (
          <span className="active-tab-badge complete-badge">{t('fileTabs.zeroMissing')}</span>
        )}

        {activeTreeData.emptyKeysCount > 0 ? (
          <button
            type="button"
            className="active-tab-badge empty-tab-badge clickable-empty-badge"
            onClick={() => onNavigateProblem(activeFilename, 'empty')}
            title={t('fileTabs.emptyTitle')}
            aria-label={t('fileTabs.emptyAria', { count: activeTreeData.emptyKeysCount })}
          >
            {t('fileTabs.emptyBadge', { count: activeTreeData.emptyKeysCount })}
          </button>
        ) : (
          <span className="active-tab-badge complete-badge">{t('fileTabs.zeroEmpty')}</span>
        )}
      </div>
    </div>
  )
}
