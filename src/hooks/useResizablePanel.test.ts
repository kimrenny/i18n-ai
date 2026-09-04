import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useResizablePanel } from './useResizablePanel'

describe('useResizablePanel hook', () => {
  it('initializes with given initialSize', () => {
    const { result } = renderHook(() =>
      useResizablePanel({
        direction: 'horizontal',
        initialSize: 280,
        minSize: 180,
        maxSize: 600,
      })
    )

    expect(result.current.size).toBe(280)
    expect(result.current.lastSize).toBe(280)
    expect(result.current.isResizing).toBe(false)
  })

  it('updates horizontal size on pointer drag within bounds', () => {
    const { result } = renderHook(() =>
      useResizablePanel({
        direction: 'horizontal',
        initialSize: 280,
        minSize: 180,
        maxSize: 600,
      })
    )

    const mockTarget = {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
    } as unknown as HTMLElement

    // Pointer down at x = 280
    act(() => {
      result.current.handlePointerDown({
        clientX: 280,
        clientY: 100,
        pointerId: 1,
        currentTarget: mockTarget,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.PointerEvent<HTMLElement>)
    })

    expect(result.current.isResizing).toBe(true)

    // Drag right to x = 330 (+50px)
    act(() => {
      result.current.handlePointerMove({
        clientX: 330,
        clientY: 100,
        pointerId: 1,
      } as unknown as React.PointerEvent<HTMLElement>)
    })

    expect(result.current.size).toBe(330)
    expect(result.current.lastSize).toBe(330)

    // Pointer up
    act(() => {
      result.current.handlePointerUp({
        pointerId: 1,
        currentTarget: mockTarget,
      } as unknown as React.PointerEvent<HTMLElement>)
    })

    expect(result.current.isResizing).toBe(false)
  })

  it('clamps size within minSize and maxSize', () => {
    const { result } = renderHook(() =>
      useResizablePanel({
        direction: 'horizontal',
        initialSize: 280,
        minSize: 180,
        maxSize: 600,
      })
    )

    const mockTarget = {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
    } as unknown as HTMLElement

    act(() => {
      result.current.handlePointerDown({
        clientX: 280,
        clientY: 100,
        pointerId: 1,
        currentTarget: mockTarget,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.PointerEvent<HTMLElement>)
    })

    // Drag way too small -> clamps to minSize 180
    act(() => {
      result.current.handlePointerMove({
        clientX: 50,
        clientY: 100,
        pointerId: 1,
      } as unknown as React.PointerEvent<HTMLElement>)
    })

    expect(result.current.size).toBe(180)

    // Drag way too large -> clamps to maxSize 600
    act(() => {
      result.current.handlePointerMove({
        clientX: 1000,
        clientY: 100,
        pointerId: 1,
      } as unknown as React.PointerEvent<HTMLElement>)
    })

    expect(result.current.size).toBe(600)
  })

  it('updates vertical size on pointer drag (dragging up increases height)', () => {
    const { result } = renderHook(() =>
      useResizablePanel({
        direction: 'vertical',
        initialSize: 220,
        minSize: 120,
        maxSize: 600,
      })
    )

    const mockTarget = {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
    } as unknown as HTMLElement

    // Pointer down at y = 500
    act(() => {
      result.current.handlePointerDown({
        clientX: 100,
        clientY: 500,
        pointerId: 1,
        currentTarget: mockTarget,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.PointerEvent<HTMLElement>)
    })

    // Drag up to y = 450 (delta = 500 - 450 = +50px height)
    act(() => {
      result.current.handlePointerMove({
        clientX: 100,
        clientY: 450,
        pointerId: 1,
      } as unknown as React.PointerEvent<HTMLElement>)
    })

    expect(result.current.size).toBe(270)
  })

  it('triggers onCollapse when dragged below collapseThreshold', () => {
    const mockCollapse = vi.fn()
    const { result } = renderHook(() =>
      useResizablePanel({
        direction: 'horizontal',
        initialSize: 280,
        minSize: 180,
        maxSize: 600,
        collapseThreshold: 120,
        onCollapse: mockCollapse,
      })
    )

    const mockTarget = {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
    } as unknown as HTMLElement

    act(() => {
      result.current.handlePointerDown({
        clientX: 280,
        clientY: 100,
        pointerId: 1,
        currentTarget: mockTarget,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.PointerEvent<HTMLElement>)
    })

    // Drag left to raw size = 280 - 180 = 100 (below threshold 120)
    act(() => {
      result.current.handlePointerMove({
        clientX: 100,
        clientY: 100,
        pointerId: 1,
      } as unknown as React.PointerEvent<HTMLElement>)
    })

    expect(mockCollapse).toHaveBeenCalledTimes(1)
  })

  it('adjusts size using keyboard arrow keys', () => {
    const { result } = renderHook(() =>
      useResizablePanel({
        direction: 'horizontal',
        initialSize: 280,
        minSize: 180,
        maxSize: 600,
      })
    )

    act(() => {
      result.current.handleKeyDown({
        key: 'ArrowRight',
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent<HTMLElement>)
    })
    expect(result.current.size).toBe(290)

    act(() => {
      result.current.handleKeyDown({
        key: 'ArrowLeft',
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent<HTMLElement>)
    })
    expect(result.current.size).toBe(280)

    act(() => {
      result.current.handleKeyDown({
        key: 'Home',
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent<HTMLElement>)
    })
    expect(result.current.size).toBe(180)

    act(() => {
      result.current.handleKeyDown({
        key: 'End',
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent<HTMLElement>)
    })
    expect(result.current.size).toBe(600)
  })
})
