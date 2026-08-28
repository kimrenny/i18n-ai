import React, { useEffect, useCallback } from 'react'

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
    <div className="missing-navigator-bar" aria-label="Missing and empty key navigator">
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
          aria-label={`Navigate missing keys (${missingKeys.length})`}
        >
          <span className="mode-dot dot-missing">●</span>
          Missing: <strong>{missingKeys.length}</strong>
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
          aria-label={`Navigate empty keys (${emptyKeys.length})`}
        >
          <span className="mode-dot dot-empty">●</span>
          Empty: <strong>{emptyKeys.length}</strong>
        </button>
      </div>

      <div className="navigator-status">
        {hasCurrentProblems ? (
          currentIndex >= 0 ? (
            <span className="navigator-position" data-testid="navigator-position">
              {navMode === 'missing' ? 'Missing' : 'Empty'} translation {currentIndex + 1} of{' '}
              {currentList.length}
            </span>
          ) : (
            <span className="navigator-position" data-testid="navigator-position">
              {currentList.length} {navMode} translations in this file
            </span>
          )
        ) : (
          <span
            className="navigator-position navigator-all-complete"
            data-testid="navigator-position"
          >
            ✓ 0 {navMode} translations in this file
          </span>
        )}
      </div>

      <div className="navigator-controls">
        <button
          type="button"
          className="nav-btn prev-btn"
          onClick={handlePrevious}
          disabled={!canGoPrevious}
          aria-label="Previous key"
          title="Previous problem key"
        >
          ← Previous
        </button>

        <button
          type="button"
          className="nav-btn next-btn"
          onClick={handleNext}
          disabled={!canGoNext}
          aria-label="Next key"
          title="Next problem key"
        >
          Next →
        </button>

        <button
          type="button"
          className="nav-btn top-btn"
          onClick={onTop}
          aria-label="Scroll to top"
          title="Scroll tree to top"
        >
          ↑ Top
        </button>
      </div>
    </div>
  )
}
