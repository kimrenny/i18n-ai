import React, { useEffect, useCallback } from 'react'
import { useTranslation } from '../../i18n/useTranslation'

export type ProblemNavMode = 'missing' | 'empty'

interface MissingKeyNavigatorProps {
  missingKeys: string[]
  emptyKeys: string[]
  activeMissingKey: string | null
  navMode: ProblemNavMode
  onSelectNavMode: (mode: ProblemNavMode) => void
  onNavigate: (key: string, mode: ProblemNavMode) => void
  onTop: () => void
}

export const MissingKeyNavigator: React.FC<MissingKeyNavigatorProps> = ({
  missingKeys,
  emptyKeys,
  activeMissingKey,
  navMode,
  onSelectNavMode,
  onNavigate,
  onTop,
}) => {
  const { t } = useTranslation()
  const currentList = navMode === 'missing' ? missingKeys : emptyKeys
  const currentIndex =
    activeMissingKey !== null ? currentList.indexOf(activeMissingKey) : -1
  const hasCurrentProblems = currentList.length > 0
  const canGoPrevious = activeMissingKey !== null && currentIndex > 0
  const canGoNext =
    hasCurrentProblems &&
    (activeMissingKey === null || currentIndex < currentList.length - 1)

  const handlePrevious = useCallback(() => {
    if (!canGoPrevious) return
    onNavigate(currentList[currentIndex - 1], navMode)
  }, [canGoPrevious, currentIndex, currentList, navMode, onNavigate])

  const handleNext = useCallback(() => {
    if (!canGoNext) return
    if (activeMissingKey === null || currentIndex === -1) {
      onNavigate(currentList[0], navMode)
    } else {
      onNavigate(currentList[currentIndex + 1], navMode)
    }
  }, [canGoNext, activeMissingKey, currentIndex, currentList, navMode, onNavigate])

  // Keyboard navigation (ArrowDown/Right -> Next, ArrowUp/Left -> Previous)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)

      if (isInput) return

      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        if (canGoNext) {
          e.preventDefault()
          handleNext()
        }
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        if (canGoPrevious) {
          e.preventDefault()
          handlePrevious()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [canGoNext, canGoPrevious, handleNext, handlePrevious])

  return (
    <div className="missing-navigator-bar" aria-label={t('nav.navigatorAria')}>
      <div className="navigator-modes">
        <button
          type="button"
          className={`nav-mode-btn ${navMode === 'missing' ? 'active-mode-missing' : ''}`}
          onClick={() => {
            onSelectNavMode('missing')
            if (missingKeys.length > 0) {
              onNavigate(missingKeys[0], 'missing')
            }
          }}
          disabled={missingKeys.length === 0}
          aria-label={`${t('nav.modeMissing')} (${missingKeys.length})`}
        >
          <span className="mode-dot dot-missing">●</span>
          {t('nav.modeMissing')}: <strong>{missingKeys.length}</strong>
        </button>

        <button
          type="button"
          className={`nav-mode-btn ${navMode === 'empty' ? 'active-mode-empty' : ''}`}
          onClick={() => {
            onSelectNavMode('empty')
            if (emptyKeys.length > 0) {
              onNavigate(emptyKeys[0], 'empty')
            }
          }}
          disabled={emptyKeys.length === 0}
          aria-label={`${t('nav.modeEmpty')} (${emptyKeys.length})`}
        >
          <span className="mode-dot dot-empty">●</span>
          {t('nav.modeEmpty')}: <strong>{emptyKeys.length}</strong>
        </button>
      </div>

      <div className="navigator-controls">
        <span
          className="nav-index-display"
          data-testid="navigator-position"
          role="status"
        >
          {activeMissingKey !== null && currentIndex !== -1
            ? (navMode === 'missing'
                ? t('nav.missingIndex', { current: currentIndex + 1, total: currentList.length })
                : t('nav.emptyIndex', { current: currentIndex + 1, total: currentList.length }))
            : (navMode === 'missing'
                ? t('nav.missingCountTotal', { count: currentList.length })
                : t('nav.emptyCountTotal', { count: currentList.length }))}
        </span>

        <button
          type="button"
          className="nav-btn prev-btn"
          onClick={handlePrevious}
          disabled={!canGoPrevious}
          title={t('nav.prevProblem')}
          aria-label={t('nav.prevProblem')}
        >
          ◀ Prev
        </button>

        <button
          type="button"
          className="nav-btn next-btn"
          onClick={handleNext}
          disabled={!canGoNext}
          title={t('nav.nextProblem')}
          aria-label={t('nav.nextProblem')}
        >
          Next ▶
        </button>

        <button
          type="button"
          className="nav-btn top-btn"
          onClick={onTop}
          title={t('nav.scrollTop')}
          aria-label={t('nav.scrollTop')}
        >
          ▲ Top
        </button>
      </div>
    </div>
  )
}
