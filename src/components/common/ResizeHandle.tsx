import React from 'react'
import './ResizeHandle.css'

export interface ResizeHandleProps {
  direction: 'horizontal' | 'vertical'
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void
  onPointerMove?: (e: React.PointerEvent<HTMLElement>) => void
  onPointerUp?: (e: React.PointerEvent<HTMLElement>) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLElement>) => void
  isResizing?: boolean
  ariaLabel?: string
  valueNow?: number
  valueMin?: number
  valueMax?: number
  className?: string
  testId?: string
}

export const ResizeHandle: React.FC<ResizeHandleProps> = ({
  direction,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onKeyDown,
  isResizing = false,
  ariaLabel,
  valueNow,
  valueMin,
  valueMax,
  className = '',
  testId,
}) => {
  const defaultLabel =
    direction === 'horizontal' ? 'Resize Explorer' : 'Resize Problems Panel'

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation={direction === 'horizontal' ? 'vertical' : 'horizontal'}
      aria-label={ariaLabel || defaultLabel}
      aria-valuenow={valueNow}
      aria-valuemin={valueMin}
      aria-valuemax={valueMax}
      data-testid={
        testId ||
        (direction === 'horizontal'
          ? 'explorer-resize-handle'
          : 'problems-resize-handle')
      }
      className={`resize-handle resize-handle-${direction} ${
        isResizing ? 'is-resizing' : ''
      } ${className}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
    />
  )
}
