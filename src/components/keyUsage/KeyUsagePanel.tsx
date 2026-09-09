import React, { useState, useMemo } from 'react'
import type {
  KeyUsageScanResult,
  KeyUsageFilter,
} from '../../types/keyUsage'
import { useTranslation } from '../../i18n/useTranslation'
import './KeyUsagePanel.css'

export interface KeyUsagePanelProps {
  scanResult: KeyUsageScanResult | null
  isLoading?: boolean
  selectedKeyPath?: string | null
  onSelectKey?: (key: string) => void
  onNavigateToSource?: (filePath: string, line: number) => void
  onNavigateToLocalization?: (key: string) => void
  onRefreshScan?: () => void
}

export const KeyUsagePanel: React.FC<KeyUsagePanelProps> = ({
  scanResult,
  isLoading = false,
  selectedKeyPath = null,
  onSelectKey,
  onNavigateToSource,
  onNavigateToLocalization,
  onRefreshScan,
}) => {
  const { t } = useTranslation()
  const [filter, setFilter] = useState<KeyUsageFilter>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  // Internal selection fallback if not controlled from parent
  const [internalSelectedKey, setInternalSelectedKey] = useState<string | null>(null)
  const activeSelectedKey = selectedKeyPath !== undefined && selectedKeyPath !== null
    ? selectedKeyPath
    : internalSelectedKey

  const handleSelectKey = (key: string) => {
    setInternalSelectedKey(key)
    onSelectKey?.(key)
  }

  const handleCopy = async (key: string) => {
    if (!key) return
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(key)
        setCopiedKey(key)
        setTimeout(() => setCopiedKey(null), 2000)
      }
    } catch {
      // ignore
    }
  }

  // Filtered Key Items
  const filteredItems = useMemo(() => {
    if (!scanResult) return []
    const query = searchQuery.trim().toLowerCase()

    return scanResult.items.filter((item) => {
      // 1. Status Filter
      if (filter === 'used' && item.status !== 'used') return false
      if (filter === 'unused' && item.status !== 'unused') return false
      if (filter === 'missing' && item.status !== 'missing') return false
      if (filter === 'dynamic') return false // Handled in dynamic list

      // 2. Search Query
      if (query) {
        const matchesKey = item.key.toLowerCase().includes(query)
        const matchesFile = item.usages.some(
          (u) =>
            (u.relativePath || u.filePath).toLowerCase().includes(query) ||
            (u.matchedExpression && u.matchedExpression.toLowerCase().includes(query)) ||
            (u.lineText && u.lineText.toLowerCase().includes(query))
        )
        if (!matchesKey && !matchesFile) return false
      }

      return true
    })
  }, [scanResult, filter, searchQuery])

  // Filtered Dynamic Usages
  const filteredDynamicUsages = useMemo(() => {
    if (!scanResult || filter !== 'dynamic') return []
    const query = searchQuery.trim().toLowerCase()

    if (!query) return scanResult.dynamicUsages

    return scanResult.dynamicUsages.filter(
      (d) =>
        d.expression.toLowerCase().includes(query) ||
        (d.relativePath || d.filePath).toLowerCase().includes(query) ||
        (d.lineText && d.lineText.toLowerCase().includes(query))
    )
  }, [scanResult, filter, searchQuery])

  // Active Selected Item
  const selectedItem = useMemo(() => {
    if (!scanResult || !activeSelectedKey) return null
    return scanResult.items.find((i) => i.key === activeSelectedKey) || null
  }, [scanResult, activeSelectedKey])

  return (
    <div className="key-usage-container" data-testid="key-usage-panel">
      {/* Top Header Bar */}
      <header className="key-usage-header">
        <div className="key-usage-header-left">
          <span className="key-usage-icon">🔍</span>
          <div className="key-usage-title-group">
            <h2 className="key-usage-title">{t('keyUsage.title')}</h2>
            <span className="key-usage-subtitle">{t('keyUsage.subtitle')}</span>
          </div>
        </div>

        <div className="key-usage-header-right">
          {onRefreshScan && (
            <button
              type="button"
              className="app-btn app-btn-sm key-usage-refresh-btn"
              onClick={onRefreshScan}
              disabled={isLoading}
              title={t('keyUsage.refreshTooltip')}
              data-testid="key-usage-refresh-btn"
            >
              {isLoading ? (
                <>
                  <span className="key-usage-spinner" />
                  <span>{t('keyUsage.scanning')}</span>
                </>
              ) : (
                <>
                  <span>↻</span>
                  <span>{t('keyUsage.refreshScan')}</span>
                </>
              )}
            </button>
          )}
        </div>
      </header>

      {/* Stats Summary Bar */}
      {scanResult && (
        <div className="key-usage-stats-bar" data-testid="key-usage-stats-bar">
          <div className="key-usage-stat-chip">
            <span className="stat-label">{t('keyUsage.scannedFiles')}:</span>
            <span className="stat-value">{scanResult.scannedFilesCount}</span>
          </div>
          <span className="stat-separator">·</span>
          <div className="key-usage-stat-chip">
            <span className="stat-label">{t('keyUsage.totalKeys')}:</span>
            <span className="stat-value">{scanResult.totalUniqueKeys}</span>
          </div>
          <span className="stat-separator">·</span>
          <div className="key-usage-stat-chip stat-chip-used">
            <span className="stat-dot dot-used" />
            <span className="stat-label">{t('keyUsage.used')}:</span>
            <span className="stat-value">{scanResult.usedKeysCount}</span>
          </div>
          <span className="stat-separator">·</span>
          <div className="key-usage-stat-chip stat-chip-unused">
            <span className="stat-dot dot-unused" />
            <span className="stat-label">{t('keyUsage.unused')}:</span>
            <span className="stat-value">{scanResult.unusedKeysCount}</span>
          </div>
          <span className="stat-separator">·</span>
          <div className="key-usage-stat-chip stat-chip-missing">
            <span className="stat-dot dot-missing" />
            <span className="stat-label">{t('keyUsage.missing')}:</span>
            <span className="stat-value">{scanResult.missingKeysCount}</span>
          </div>
          <span className="stat-separator">·</span>
          <div className="key-usage-stat-chip stat-chip-dynamic">
            <span className="stat-dot dot-dynamic" />
            <span className="stat-label">{t('keyUsage.dynamic')}:</span>
            <span className="stat-value">{scanResult.dynamicUsagesCount}</span>
          </div>
        </div>
      )}

      {/* Main Workspace Body: Toolbar + Master-Detail Split */}
      <div className="key-usage-body">
        {/* Controls Toolbar: Search & Filter Tabs */}
        <div className="key-usage-toolbar">
          <div className="key-usage-search-box">
            <span className="key-usage-search-icon">🔍</span>
            <input
              type="text"
              className="key-usage-search-input"
              placeholder={t('keyUsage.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label={t('keyUsage.searchPlaceholder')}
              data-testid="key-usage-search-input"
            />
            {searchQuery && (
              <button
                type="button"
                className="key-usage-clear-btn"
                onClick={() => setSearchQuery('')}
                title={t('search.clearTooltip')}
                aria-label={t('search.clearTooltip')}
              >
                ✕
              </button>
            )}
          </div>

          <div className="key-usage-filter-group" role="tablist" aria-label="Key Usage Filters">
            <button
              type="button"
              className={`filter-chip ${filter === 'all' ? 'is-active' : ''}`}
              onClick={() => setFilter('all')}
              role="tab"
              aria-selected={filter === 'all'}
              data-testid="filter-all"
            >
              <span>{t('keyUsage.filterAll')}</span>
              {scanResult && <span className="filter-count">{scanResult.totalUniqueKeys}</span>}
            </button>

            <button
              type="button"
              className={`filter-chip ${filter === 'used' ? 'is-active' : ''}`}
              onClick={() => setFilter('used')}
              role="tab"
              aria-selected={filter === 'used'}
              data-testid="filter-used"
            >
              <span>{t('keyUsage.filterUsed')}</span>
              {scanResult && <span className="filter-count count-used">{scanResult.usedKeysCount}</span>}
            </button>

            <button
              type="button"
              className={`filter-chip ${filter === 'unused' ? 'is-active' : ''}`}
              onClick={() => setFilter('unused')}
              role="tab"
              aria-selected={filter === 'unused'}
              data-testid="filter-unused"
            >
              <span>{t('keyUsage.filterUnused')}</span>
              {scanResult && <span className="filter-count count-unused">{scanResult.unusedKeysCount}</span>}
            </button>

            <button
              type="button"
              className={`filter-chip ${filter === 'missing' ? 'is-active' : ''}`}
              onClick={() => setFilter('missing')}
              role="tab"
              aria-selected={filter === 'missing'}
              data-testid="filter-missing"
            >
              <span>{t('keyUsage.filterMissing')}</span>
              {scanResult && <span className="filter-count count-missing">{scanResult.missingKeysCount}</span>}
            </button>

            <button
              type="button"
              className={`filter-chip ${filter === 'dynamic' ? 'is-active' : ''}`}
              onClick={() => setFilter('dynamic')}
              role="tab"
              aria-selected={filter === 'dynamic'}
              data-testid="filter-dynamic"
            >
              <span>{t('keyUsage.filterDynamic')}</span>
              {scanResult && <span className="filter-count count-dynamic">{scanResult.dynamicUsagesCount}</span>}
            </button>
          </div>
        </div>

        {/* Master-Detail Split View */}
        <div className="key-usage-split-view">
          {/* Left Column: Key List */}
          <div className="key-usage-list-pane" data-testid="key-usage-list">
            {isLoading && !scanResult ? (
              <div className="key-usage-empty-state">
                <div className="key-usage-spinner" />
                <p>{t('keyUsage.scanningMessage')}</p>
              </div>
            ) : filter === 'dynamic' ? (
              /* Dynamic Usages List */
              filteredDynamicUsages.length === 0 ? (
                <div className="key-usage-empty-state">
                  <span className="empty-icon">✓</span>
                  <p>{t('keyUsage.noDynamicFound')}</p>
                </div>
              ) : (
                <div className="dynamic-usages-list" role="list">
                  {filteredDynamicUsages.map((dyn, idx) => (
                    <div
                      key={`${dyn.filePath}-${dyn.line}-${dyn.column}-${idx}`}
                      className="dynamic-usage-item"
                      role="button"
                      tabIndex={0}
                      onClick={() => onNavigateToSource?.(dyn.filePath, dyn.line)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onNavigateToSource?.(dyn.filePath, dyn.line)
                        }
                      }}
                      title={t('keyUsage.openSourceTooltip')}
                      data-testid={`dynamic-usage-item-${idx}`}
                    >
                      <div className="dynamic-usage-header">
                        <span className="file-badge">📄 {dyn.relativePath || dyn.filePath.split(/[/|\\]/).pop()}</span>
                        <span className="line-badge">
                          {t('keyUsage.line')} {dyn.line}:{dyn.column}
                        </span>
                      </div>
                      <div className="dynamic-expr-box">
                        <code>{dyn.expression}</code>
                      </div>
                      {dyn.lineText && (
                        <div className="usage-context-line">
                          <span className="context-label">{t('keyUsage.context')}:</span>
                          <code>{dyn.lineText}</code>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            ) : filteredItems.length === 0 ? (
              <div className="key-usage-empty-state" data-testid="key-usage-empty-state">
                <span className="empty-icon">🔎</span>
                <p>{t('keyUsage.noKeysFound')}</p>
                {searchQuery && (
                  <button
                    type="button"
                    className="app-btn app-btn-sm"
                    onClick={() => setSearchQuery('')}
                  >
                    {t('search.clearSearch')}
                  </button>
                )}
              </div>
            ) : (
              /* Standard Key Usage Items List */
              <div className="key-items-list" role="list">
                {filteredItems.map((item) => {
                  const isSelected = activeSelectedKey === item.key
                  const statusClass = `status-${item.status}`

                  return (
                    <div
                      key={item.key}
                      className={`key-item-card ${statusClass} ${isSelected ? 'is-selected' : ''}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSelectKey(item.key)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          handleSelectKey(item.key)
                        }
                      }}
                      data-testid={`key-item-${item.key}`}
                    >
                      <div className="key-item-header">
                        <span className="key-item-path" title={item.key}>
                          {item.key}
                        </span>
                        <span className={`key-status-badge ${statusClass}`}>
                          {item.status === 'used'
                            ? t('keyUsage.statusUsed')
                            : item.status === 'unused'
                            ? (item.possibleDynamicUsages && item.possibleDynamicUsages.length > 0
                                ? (t('keyUsage.possibleDynamic') || '⚡ Possible Dynamic')
                                : t('keyUsage.statusUnused'))
                            : t('keyUsage.statusMissing')}
                        </span>
                      </div>

                      <div className="key-item-footer">
                        <span className="key-usage-count-badge">
                          {t('keyUsage.usagesCount', { count: item.usageCount })}
                        </span>
                        {item.possibleDynamicUsages && item.possibleDynamicUsages.length > 0 && (
                          <span className="key-possible-dyn-badge">
                            ⚡ {item.possibleDynamicUsages.length} {t('keyUsage.dynamicCandidates') || 'dynamic'}
                          </span>
                        )}
                        {item.status !== 'missing' && (
                          <span className="key-lang-count-badge">
                            {t('keyUsage.languagesCount', { count: item.presentInLanguages.length })}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Right Column: Key Details Pane */}
          <div className="key-usage-detail-pane" data-testid="key-usage-details">
            {filter === 'dynamic' ? (
              <div className="detail-dynamic-overview">
                <div className="detail-header-card">
                  <h3 className="detail-title">{t('keyUsage.dynamicReferencesTitle')}</h3>
                  <p className="detail-desc">{t('keyUsage.dynamicReferencesDesc')}</p>
                </div>
              </div>
            ) : !selectedItem ? (
              <div className="key-detail-empty">
                <span className="detail-empty-icon">🔎</span>
                <h3 className="detail-empty-title">{t('keyUsage.selectKeyTitle')}</h3>
                <p className="detail-empty-desc">{t('keyUsage.selectKeyDesc')}</p>
              </div>
            ) : (
              <div className="key-detail-content">
                {/* Key Overview Card */}
                <div className="key-detail-card">
                  <span className="detail-section-label">{t('keyUsage.keyPath')}</span>
                  <div className="detail-key-path-row">
                    <span className="detail-key-path" title={selectedItem.key}>
                      {selectedItem.key}
                    </span>
                    <button
                      type="button"
                      className="app-btn app-btn-sm detail-copy-btn"
                      onClick={() => handleCopy(selectedItem.key)}
                      title={t('common.copy')}
                      aria-label={t('common.copy')}
                    >
                      {copiedKey === selectedItem.key ? `✓ ${t('common.copied')}` : t('common.copy')}
                    </button>
                  </div>

                  <div className="detail-status-row">
                    <div className="status-indicator-group">
                      <span className="detail-meta-label">{t('keyUsage.statusLabel')}:</span>
                      <span className={`key-status-badge status-${selectedItem.status}`}>
                        {selectedItem.status === 'used'
                          ? t('keyUsage.statusUsed')
                          : selectedItem.status === 'unused'
                          ? t('keyUsage.statusUnused')
                          : t('keyUsage.statusMissing')}
                      </span>
                    </div>

                    <div className="detail-actions-group">
                      {onNavigateToLocalization && selectedItem.status !== 'missing' && (
                        <button
                          type="button"
                          className="app-btn app-btn-sm detail-nav-loc-btn"
                          onClick={() => onNavigateToLocalization(selectedItem.key)}
                          title={t('keyUsage.navToLocalizationTooltip')}
                          data-testid="nav-to-localization-btn"
                        >
                          📊 {t('keyUsage.navToLocalization')}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="detail-status-explanation">
                    {selectedItem.status === 'used' && (
                      <p className="status-text-used">
                        ✓ {t('keyUsage.usedExplanation', { count: selectedItem.usageCount })}
                      </p>
                    )}
                    {selectedItem.status === 'unused' && (
                      <p className="status-text-unused">
                        ℹ {t('keyUsage.unusedExplanation')}
                      </p>
                    )}
                    {selectedItem.status === 'missing' && (
                      <p className="status-text-missing">
                        ⚠ {t('keyUsage.missingExplanation')}
                      </p>
                    )}
                  </div>
                </div>

                {/* Localization Presence Card */}
                {selectedItem.status !== 'missing' && (
                  <div className="key-detail-card">
                    <span className="detail-section-label">
                      {t('keyUsage.localizationPresence')} ({selectedItem.presentInLanguages.length})
                    </span>
                    <div className="detail-lang-tags">
                      {selectedItem.presentInLanguages.map((lang) => (
                        <span key={lang} className="lang-presence-tag">
                          ✓ {lang}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Detected Source Code Usages */}
                <div className="key-detail-card usages-card">
                  <div className="usages-header">
                    <span className="detail-section-label">
                      {t('keyUsage.sourceUsages')} ({selectedItem.usages.length})
                    </span>
                  </div>

                  {selectedItem.usages.length === 0 ? (
                    <div className="usages-empty-box">
                      <span>{t('keyUsage.noStaticUsages')}</span>
                    </div>
                  ) : (
                    <div className="usages-list" role="list">
                      {selectedItem.usages.map((usage, uIdx) => (
                        <div
                          key={`${usage.filePath}-${usage.line}-${usage.column}-${uIdx}`}
                          className="usage-location-item"
                          role="button"
                          tabIndex={0}
                          onClick={() => onNavigateToSource?.(usage.filePath, usage.line)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              onNavigateToSource?.(usage.filePath, usage.line)
                            }
                          }}
                          title={t('keyUsage.openSourceTooltip')}
                          data-testid={`usage-item-${uIdx}`}
                        >
                          <div className="usage-loc-header">
                            <span className="usage-file-path">
                              📄 {usage.relativePath || usage.filePath.split(/[/|\\]/).pop()}
                            </span>
                            <span className="usage-line-tag">
                              {t('keyUsage.line')} {usage.line}:{usage.column}
                            </span>
                          </div>

                          <div className="usage-expr-snippet">
                            <code>{usage.matchedExpression}</code>
                          </div>

                          {usage.lineText && (
                            <div className="usage-context-line">
                              <code>{usage.lineText}</code>
                            </div>
                          )}

                          {usage.detectorId && (
                            <div className="usage-diagnostic-meta">
                              <span
                                className={`usage-detector-badge confidence-${usage.confidence || 'strong'}`}
                                title={`Resolution: ${usage.resolutionType || 'direct-static'}, Confidence: ${usage.confidence || 'strong'}`}
                              >
                                {usage.detectorId} • {usage.resolutionType || usage.pattern || 'direct-static'} ({usage.confidence || 'strong'})
                              </span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Possible Dynamic Usages Candidates */}
                {selectedItem.possibleDynamicUsages && selectedItem.possibleDynamicUsages.length > 0 && (
                  <div className="key-detail-card dynamic-candidates-card" style={{ marginTop: '16px' }}>
                    <div className="usages-header">
                      <span className="detail-section-label">
                        ⚡ {t('keyUsage.possibleDynamicCandidates') || 'Possible Dynamic Usages'} ({selectedItem.possibleDynamicUsages.length})
                      </span>
                    </div>
                    <div className="usages-list" role="list">
                      {selectedItem.possibleDynamicUsages.map((dyn, dIdx) => (
                        <div
                          key={`${dyn.filePath}-${dyn.line}-${dyn.column}-${dIdx}`}
                          className="usage-location-item possible-dynamic-item"
                          role="button"
                          tabIndex={0}
                          onClick={() => onNavigateToSource?.(dyn.filePath, dyn.line)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              onNavigateToSource?.(dyn.filePath, dyn.line)
                            }
                          }}
                          title={t('keyUsage.openSourceTooltip')}
                        >
                          <div className="usage-loc-header">
                            <span className="usage-file-path">
                              📄 {dyn.relativePath || dyn.filePath.split(/[/|\\]/).pop()}
                            </span>
                            <span className="usage-line-tag">
                              {t('keyUsage.line')} {dyn.line}:{dyn.column}
                            </span>
                          </div>
                          <div className="dynamic-expr-box">
                            <code>{dyn.expression}</code>
                          </div>
                          {dyn.lineText && (
                            <div className="usage-context-line">
                              <code>{dyn.lineText}</code>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
