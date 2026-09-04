import { useState, useCallback, useRef } from 'react'

export type ResizeDirection = 'horizontal' | 'vertical'

export interface UseResizableOptions {
  direction: ResizeDirection
  initialSize: number
  minSize: number
  maxSize: number
  collapseThreshold?: number
  isCollapsed?: boolean
  onCollapse?: () => void
  onExpand?: () => void
}

export interface UseResizableReturn {
  size: number
  lastSize: number
  isResizing: boolean
  setSize: (size: number) => void
  resetToLastSize: () => void
  handlePointerDown: (e: React.PointerEvent<HTMLElement>) => void
  handlePointerMove: (e: React.PointerEvent<HTMLElement>) => void
  handlePointerUp: (e: React.PointerEvent<HTMLElement>) => void
  handleKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void
}

export function useResizablePanel({
  direction,
  initialSize,
  minSize,
  maxSize,
  collapseThreshold,
  isCollapsed = false,
  onCollapse,
  onExpand,
}: UseResizableOptions): UseResizableReturn {
  const [size, setSize] = useState<number>(initialSize)
  const [lastSize, setLastSize] = useState<number>(initialSize)
  const [isResizing, setIsResizing] = useState<boolean>(false)
  const isResizingRef = useRef<boolean>(false)
  const startPosRef = useRef<number>(0)
  const startSizeRef = useRef<number>(initialSize)
  const activePointerIdRef = useRef<number | null>(null)

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      e.preventDefault()
      e.stopPropagation()
      const target = e.currentTarget
      try {
        target.setPointerCapture(e.pointerId)
      } catch {
        // Safe fallback for environments where setPointerCapture might be unavailable
      }
      activePointerIdRef.current = e.pointerId
      isResizingRef.current = true
      setIsResizing(true)

      startPosRef.current = direction === 'horizontal' ? e.clientX : e.clientY
      startSizeRef.current = isCollapsed
        ? collapseThreshold || minSize
        : size
    },
    [direction, isCollapsed, size, collapseThreshold, minSize]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (activePointerIdRef.current !== e.pointerId) return

      const currentPos = direction === 'horizontal' ? e.clientX : e.clientY
      const delta =
        direction === 'horizontal'
          ? currentPos - startPosRef.current
          : startPosRef.current - currentPos // Upward drag increases vertical panel height

      const rawSize = startSizeRef.current + delta

      if (collapseThreshold !== undefined && rawSize < collapseThreshold) {
        if (!isCollapsed && onCollapse) {
          onCollapse()
        }
        return
      }

      if (isCollapsed && onExpand && rawSize >= (collapseThreshold || minSize)) {
        onExpand()
      }

      const clampedSize = Math.max(minSize, Math.min(maxSize, rawSize))
      setSize(clampedSize)
      setLastSize(clampedSize)
    },
    [
      direction,
      collapseThreshold,
      isCollapsed,
      onCollapse,
      onExpand,
      minSize,
      maxSize,
    ]
  )

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (activePointerIdRef.current === e.pointerId) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        // Safe fallback
      }
      activePointerIdRef.current = null
      isResizingRef.current = false
      setIsResizing(false)
    }
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      const step = 10
      if (direction === 'horizontal') {
        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          const newSize = Math.max(minSize, size - step)
          setSize(newSize)
          setLastSize(newSize)
        } else if (e.key === 'ArrowRight') {
          e.preventDefault()
          const newSize = Math.min(maxSize, size + step)
          setSize(newSize)
          setLastSize(newSize)
        } else if (e.key === 'Home') {
          e.preventDefault()
          setSize(minSize)
          setLastSize(minSize)
        } else if (e.key === 'End') {
          e.preventDefault()
          setSize(maxSize)
          setLastSize(maxSize)
        }
      } else {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          const newSize = Math.max(minSize, size - step)
          setSize(newSize)
          setLastSize(newSize)
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          const newSize = Math.min(maxSize, size + step)
          setSize(newSize)
          setLastSize(newSize)
        } else if (e.key === 'Home') {
          e.preventDefault()
          setSize(minSize)
          setLastSize(minSize)
        } else if (e.key === 'End') {
          e.preventDefault()
          setSize(maxSize)
          setLastSize(maxSize)
        }
      }
    },
    [direction, size, minSize, maxSize]
  )

  const resetToLastSize = useCallback(() => {
    setSize(lastSize > 0 ? lastSize : initialSize)
  }, [lastSize, initialSize])

  return {
    size,
    lastSize,
    isResizing,
    setSize,
    resetToLastSize,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleKeyDown,
  }
}
