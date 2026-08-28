import React, { useEffect, useCallback } from 'react'

interface MissingKeyNavigatorProps {
  missingKeys: string[]
  activeMissingKey: string | null
  onNavigate: (key: string) => void
  onTop: () => void
}

export const MissingKeyNavigator: React.FC<MissingKeyNavigatorProps> = ({
  missingKeys,
  activeMissingKey,
  onNavigate,
  onTop,
}) => {
  const currentIndex = activeMissingKey !== null ? missingKeys.indexOf(activeMissingKey) : -1
  const hasMissing = missingKeys.length > 0
  const canGoPrevious = activeMissingKey !== null && currentIndex > 0
  const canGoNext =
    hasMissing && (activeMissingKey === null || currentIndex < missingKeys.length - 1)

  const handlePrevious = useCallback(() => {
    if (!canGoPrevious) return
    onNavigate(missingKeys[currentIndex - 1])
  }, [canGoPrevious, currentIndex, missingKeys, onNavigate])

  const handleNext = useCallback(() => {
    if (!canGoNext) return
    if (activeMissingKey === null || currentIndex === -1) {
      onNavigate(missingKeys[0])
    } else {
      onNavigate(missingKeys[currentIndex + 1])
    }
  }, [canGoNext, activeMissingKey, currentIndex, missingKeys, onNavigate])

  // Optional keyboard navigation (ArrowDown/Right -> Next, ArrowUp/Left -> Previous)
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
    <div className="missing-navigator-bar" aria-label="Missing key navigator">
      <div className="navigator-status">
        <span className="navigator-icon">⚠️</span>
        {hasMissing ? (
          currentIndex >= 0 ? (
            <span className="navigator-position" data-testid="navigator-position">
              Missing translation {currentIndex + 1} of {missingKeys.length}
            </span>
          ) : (
            <span className="navigator-position" data-testid="navigator-position">
              {missingKeys.length} missing translations in this file
            </span>
          )
        ) : (
          <span
            className="navigator-position navigator-all-complete"
            data-testid="navigator-position"
          >
            ✓ All translations complete in this file
          </span>
        )}
      </div>

      <div className="navigator-controls">
        <button
          type="button"
          className="nav-btn prev-btn"
          onClick={handlePrevious}
          disabled={!canGoPrevious}
          aria-label="Previous missing key"
          title="Previous missing key (Arrow Up/Left)"
        >
          ← Previous
        </button>

        <button
          type="button"
          className="nav-btn next-btn"
          onClick={handleNext}
          disabled={!canGoNext}
          aria-label="Next missing key"
          title="Next missing key (Arrow Down/Right)"
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
