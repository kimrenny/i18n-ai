import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ResizeHandle } from './ResizeHandle'

describe('ResizeHandle component', () => {
  it('renders horizontal handle with separator role and ARIA attributes', () => {
    render(
      <ResizeHandle
        direction="horizontal"
        onPointerDown={vi.fn()}
        valueNow={280}
        valueMin={180}
        valueMax={600}
      />
    )

    const handle = screen.getByTestId('explorer-resize-handle')
    expect(handle).toBeInTheDocument()
    expect(handle).toHaveAttribute('role', 'separator')
    expect(handle).toHaveAttribute('aria-orientation', 'vertical')
    expect(handle).toHaveAttribute('aria-valuenow', '280')
    expect(handle).toHaveAttribute('aria-valuemin', '180')
    expect(handle).toHaveAttribute('aria-valuemax', '600')
    expect(handle).toHaveClass('resize-handle-horizontal')
  })

  it('renders vertical handle with custom aria label and test id', () => {
    render(
      <ResizeHandle
        direction="vertical"
        onPointerDown={vi.fn()}
        valueNow={220}
        valueMin={120}
        valueMax={600}
      />
    )

    const handle = screen.getByTestId('problems-resize-handle')
    expect(handle).toBeInTheDocument()
    expect(handle).toHaveAttribute('role', 'separator')
    expect(handle).toHaveAttribute('aria-orientation', 'horizontal')
    expect(handle).toHaveClass('resize-handle-vertical')
  })

  it('invokes pointer down and key down handlers', () => {
    const mockPointerDown = vi.fn()
    const mockKeyDown = vi.fn()

    render(
      <ResizeHandle
        direction="horizontal"
        onPointerDown={mockPointerDown}
        onKeyDown={mockKeyDown}
        isResizing={true}
      />
    )

    const handle = screen.getByTestId('explorer-resize-handle')
    expect(handle).toHaveClass('is-resizing')

    fireEvent.pointerDown(handle)
    expect(mockPointerDown).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(mockKeyDown).toHaveBeenCalledTimes(1)
  })
})
