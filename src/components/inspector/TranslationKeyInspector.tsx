import React, { useMemo, useState } from 'react'
import type { ParsedLocalizationFile } from '../../types/localization'
import { inspectTranslationKey } from '../../services/localizationKeyInspector'
import { useTranslation } from '../../i18n/useTranslation'
import './TranslationKeyInspector.css'

export interface TranslationKeyInspectorProps {
  selectedKey: string | null
  parsedFiles: readonly ParsedLocalizationFile[]
  onNavigateLanguage: (filename: string, key: string) => void
  onClose: () => void
}

export const TranslationKeyInspector: React.FC<TranslationKeyInspectorProps> = ({
  selectedKey,
  parsedFiles,
  onNavigateLanguage,
  onClose,
}) => {
  const { t } = useTranslation()
  const [isCopied, setIsCopied] = useState(false)

  const inspectionResult = useMemo(() => {
    return inspectTranslationKey(selectedKey, parsedFiles)
  }, [selectedKey, parsedFiles])

  const handleCopyKey = async () => {
    if (!inspectionResult?.key) return
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inspectionResult.key)
        setIsCopied(true)
        setTimeout(() => setIsCopied(false), 2000)
      }
    } catch {
      // Ignore clipboard write failures gracefully
    }
  }

  return (
    <aside
      className="key-inspector-panel"
      aria-label={t('inspector.title')}
      data-testid="translation-key-inspector"
    >
      <header className="inspector-header">
        <div className="inspector-header-left">
          <span className="inspector-icon">🔍</span>
          <h3 className="inspector-title">{t('inspector.title')}</h3>
        </div>
        <div className="inspector-header-actions">
          <button
            type="button"
            className="inspector-action-btn"
            onClick={onClose}
            title={t('inspector.closeInspector')}
            aria-label={t('inspector.closeInspector')}
          >
            ✕
          </button>
        </div>
      </header>

      <div className="inspector-body">
        {!inspectionResult ? (
          <div className="inspector-empty-state" data-testid="inspector-empty-state">
            <span className="inspector-empty-icon">🔎</span>
            <div className="inspector-empty-title">{t('inspector.emptySelection')}</div>
            <p className="inspector-empty-desc">{t('inspector.emptySelectionHint')}</p>
          </div>
        ) : (
          <>
            {/* Selected Key Banner */}
            <div className="inspector-key-card" data-testid="inspector-key-card">
              <span className="inspector-section-label">{t('inspector.keyPath')}</span>
              <div className="inspector-key-path-row">
                <span className="inspector-key-path" title={inspectionResult.key}>
                  {inspectionResult.key}
                </span>
                <button
                  type="button"
                  className="inspector-copy-btn"
                  onClick={handleCopyKey}
                  title="Copy Key Path"
                  aria-label="Copy Key Path"
                >
                  {isCopied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </div>

            {/* Reference Language Card */}
            {inspectionResult.referenceLanguage && (
              <div className="inspector-ref-card" data-testid="inspector-reference-card">
                <div className="inspector-ref-header">
                  <span className="inspector-section-label">{t('inspector.reference')}</span>
                  <span className="inspector-ref-file">
                    {inspectionResult.referenceLanguage.languageName} · {inspectionResult.referenceLanguage.filename}
                  </span>
                </div>
                <div className="inspector-ref-val">
                  {inspectionResult.referenceLanguage.status === 'missing' ? (
                    <span className="inspector-val-missing">({t('inspector.statusMissing')})</span>
                  ) : inspectionResult.referenceLanguage.status === 'empty' ? (
                    <span className="inspector-val-empty"><code>""</code> ({t('inspector.statusEmpty')})</span>
                  ) : (
                    <span>"{inspectionResult.referenceLanguage.value}"</span>
                  )}
                </div>
              </div>
            )}

            {/* Coverage & Problems Stats */}
            <div className="inspector-stats-row">
              <div className="inspector-stat-box">
                <span className="inspector-section-label">{t('inspector.coverage')}</span>
                <div className="inspector-stat-val">
                  {inspectionResult.translatedCount} / {inspectionResult.totalLanguages}
                </div>
                <span className="inspector-stat-sub">
                  {t('inspector.coveragePercent', { percent: inspectionResult.coveragePercentage })}
                </span>
              </div>

              <div className="inspector-stat-box">
                <span className="inspector-section-label">{t('inspector.problems')}</span>
                {inspectionResult.emptyCount === 0 && inspectionResult.missingCount === 0 ? (
                  <div className="stat-clean-badge">✓ {t('inspector.noProblems')}</div>
                ) : (
                  <div className="inspector-stat-val" style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    {inspectionResult.emptyCount > 0 && (
                      <span className="stat-problem-badge empty">
                        ⚠ {t('inspector.emptyCount', { count: inspectionResult.emptyCount })}
                      </span>
                    )}
                    {inspectionResult.missingCount > 0 && (
                      <span className="stat-problem-badge missing">
                        ✕ {t('inspector.missingCount', { count: inspectionResult.missingCount })}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Translations List */}
            <div className="inspector-trans-section">
              <div className="inspector-trans-header">
                <span className="inspector-section-label">
                  {t('inspector.translations')} ({inspectionResult.languages.length})
                </span>
              </div>

              <div className="inspector-trans-list" role="list">
                {inspectionResult.languages.map((lang) => {
                  const statusClass =
                    lang.status === 'translated'
                      ? 'status-translated'
                      : lang.status === 'empty'
                        ? 'status-empty'
                        : 'status-missing'

                  const iconChar =
                    lang.status === 'translated'
                      ? '✓'
                      : lang.status === 'empty'
                        ? '⚠'
                        : '✕'

                  return (
                    <div
                      key={lang.filename}
                      className={`inspector-lang-item ${statusClass} ${lang.isReference ? 'is-reference' : ''}`}
                      data-testid={`inspector-lang-${lang.filename}`}
                      role="listitem"
                    >
                      <div className="inspector-lang-main">
                        <div className="inspector-lang-title-row">
                          <span className={`inspector-status-icon ${lang.status}`}>
                            {iconChar}
                          </span>
                          <span className="inspector-lang-name">{lang.languageName}</span>
                          <span className="inspector-file-tag">{lang.filename}</span>
                          {lang.isReference && (
                            <span className="inspector-ref-badge">{t('inspector.reference')}</span>
                          )}
                        </div>

                        <div className="inspector-lang-val">
                          {lang.status === 'missing' ? (
                            <span className="inspector-val-missing">({t('inspector.statusMissing')})</span>
                          ) : lang.status === 'empty' ? (
                            <span className="inspector-val-empty"><code>""</code></span>
                          ) : (
                            <span>{lang.value}</span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        className="inspector-open-btn"
                        onClick={() => onNavigateLanguage(lang.filename, inspectionResult.key)}
                        title={t('inspector.openInEditorAria', { key: inspectionResult.key, filename: lang.filename })}
                        aria-label={t('inspector.openInEditorAria', { key: inspectionResult.key, filename: lang.filename })}
                      >
                        {t('inspector.openInEditor')}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
  )
}
