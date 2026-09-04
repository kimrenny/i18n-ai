import React, { useMemo } from 'react'
import { useTranslation } from '../../i18n/useTranslation'
import './FilePreview.css'

export interface FilePreviewProps {
  fileName: string
  filePath: string
  content: string | null
  isLoading?: boolean
  isBinary?: boolean
  errorMessage?: string | null
  isLocalizationCandidate?: boolean
  isCheckedForComparison?: boolean
  onToggleCheckFile?: (filePath: string) => void
  onClosePreview?: () => void
}

function getFileLanguageBadge(fileName: string): string {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.json')) return 'JSON'
  if (lower.endsWith('.ts')) return 'TypeScript'
  if (lower.endsWith('.tsx')) return 'TSX'
  if (lower.endsWith('.js')) return 'JavaScript'
  if (lower.endsWith('.jsx')) return 'JSX'
  if (lower.endsWith('.css')) return 'CSS'
  if (lower.endsWith('.md')) return 'Markdown'
  if (lower.endsWith('.html')) return 'HTML'
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'YAML'
  return 'Plain Text'
}

export const FilePreview: React.FC<FilePreviewProps> = ({
  fileName,
  filePath,
  content,
  isLoading = false,
  isBinary = false,
  errorMessage = null,
  isLocalizationCandidate = false,
  isCheckedForComparison = false,
  onToggleCheckFile,
  onClosePreview,
}) => {
  const { t } = useTranslation()

  // Format JSON content if possible for clean readability
  const formattedContent = useMemo(() => {
    if (!content) return ''
    if (fileName.toLowerCase().endsWith('.json')) {
      try {
        const parsed = JSON.parse(content)
        return JSON.stringify(parsed, null, 2)
      } catch {
        return content
      }
    }
    return content
  }, [content, fileName])

  const lines = useMemo(() => {
    if (!formattedContent) return []
    return formattedContent.split('\n')
  }, [formattedContent])

  const langBadge = getFileLanguageBadge(fileName)

  return (
    <div className="file-preview-container" data-testid="file-preview-container">
      {/* Preview Header Bar */}
      <div className="file-preview-header">
        <div className="file-preview-header-left">
          <span className="file-preview-icon">📄</span>
          <span className="file-preview-filename" data-testid="preview-filename">{fileName}</span>
          <span className="file-preview-badge lang-badge">{langBadge}</span>
          <span className="file-preview-badge readonly-badge">{t('preview.readOnlyBadge')}</span>
          {isLocalizationCandidate && (
            <span className="file-preview-badge i18n-badge">{t('preview.localizationBadge')}</span>
          )}
        </div>

        <div className="file-preview-header-right">
          {isLocalizationCandidate && onToggleCheckFile && (
            <button
              type="button"
              className={`preview-action-btn ${isCheckedForComparison ? 'is-included' : ''}`}
              onClick={() => onToggleCheckFile(filePath)}
              title={isCheckedForComparison ? t('explorer.unselectFile') : t('explorer.selectFile')}
            >
              {isCheckedForComparison ? t('preview.includedInCompare') : t('preview.includeInCompare')}
            </button>
          )}

          {onClosePreview && (
            <button
              type="button"
              className="preview-close-btn"
              onClick={onClosePreview}
              title={t('common.close')}
              aria-label={t('common.close')}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Path Breadcrumb */}
      <div className="file-preview-path-bar">
        <span className="file-preview-path-text">{filePath}</span>
        {lines.length > 0 && !isBinary && (
          <span className="file-preview-line-count">{lines.length} {t('preview.lines')}</span>
        )}
      </div>

      {/* Content Area */}
      <div className="file-preview-body">
        {isLoading ? (
          <div className="preview-status-state">
            <div className="preview-spinner" />
            <span>{t('preview.loadingFile')}</span>
          </div>
        ) : errorMessage ? (
          <div className="preview-status-state preview-error-state">
            <span className="preview-error-icon">⚠️</span>
            <span>{errorMessage}</span>
          </div>
        ) : isBinary ? (
          <div className="preview-status-state preview-binary-state" data-testid="preview-binary-state">
            <span className="preview-binary-icon">📦</span>
            <span className="preview-binary-title">{t('preview.binaryFileTitle')}</span>
            <span className="preview-binary-desc">{t('preview.binaryFileDesc')}</span>
          </div>
        ) : (
          <div className="preview-code-view" data-testid="preview-code-view">
            <table className="preview-code-table">
              <tbody>
                {lines.map((line, idx) => (
                  <tr key={idx} className="preview-code-row">
                    <td className="preview-line-number" aria-hidden="true">
                      {idx + 1}
                    </td>
                    <td className="preview-line-content">
                      <pre className="preview-pre-text">{line || ' '}</pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
