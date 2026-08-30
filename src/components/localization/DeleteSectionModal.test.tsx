import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DeleteSectionModal } from './DeleteSectionModal'

describe('DeleteSectionModal', () => {
  it('renders section deletion details and warns the user', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()

    render(
      <DeleteSectionModal
        sectionPath="AUTH.ERRORS"
        targetFilename="ru.json"
        entryCount={4}
        isDeleting={false}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )

    expect(
      screen.getByRole('heading', { name: /confirm section deletion/i })
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Are you sure you want to delete section "AUTH.ERRORS" and all of its 4 entries from ru.json\?/i)
    ).toBeInTheDocument()

    const confirmBtn = screen.getByRole('button', { name: /delete section/i })
    fireEvent.click(confirmBtn)
    expect(onConfirm).toHaveBeenCalledTimes(1)

    const cancelBtn = screen.getByRole('button', { name: /cancel/i })
    fireEvent.click(cancelBtn)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
