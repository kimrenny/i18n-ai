import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FilePreview } from './FilePreview'
import { I18nProvider } from '../../i18n/I18nContext'

describe('FilePreview', () => {
  it('renders read-only file preview for text content with line numbers and filename', () => {
    const jsonContent = JSON.stringify({ APP: { TITLE: 'My App' } })
    render(
      <I18nProvider language="en">
        <FilePreview
          fileName="en.json"
          filePath="C:/project/locales/en.json"
          content={jsonContent}
          isLocalizationCandidate={true}
          isCheckedForComparison={true}
        />
      </I18nProvider>
    )

    expect(screen.getByTestId('preview-filename')).toHaveTextContent('en.json')
    expect(screen.getByText('C:/project/locales/en.json')).toBeInTheDocument()
    expect(screen.getByText(/read-only/i)).toBeInTheDocument()
    expect(screen.getByText(/translation file/i)).toBeInTheDocument()
    expect(screen.getByTestId('preview-code-view')).toBeInTheDocument()
    expect(screen.getByText(/"TITLE": "My App"/)).toBeInTheDocument()
  })

  it('renders fallback for binary files', () => {
    render(
      <I18nProvider language="en">
        <FilePreview
          fileName="logo.png"
          filePath="C:/project/assets/logo.png"
          content=""
          isBinary={true}
        />
      </I18nProvider>
    )

    expect(screen.getByTestId('preview-binary-state')).toBeInTheDocument()
    expect(screen.getByText(/preview not available for binary file/i)).toBeInTheDocument()
    expect(screen.queryByTestId('preview-code-view')).not.toBeInTheDocument()
  })

  it('allows toggling comparison inclusion for translation files from preview header', () => {
    const handleToggle = vi.fn()
    render(
      <I18nProvider language="en">
        <FilePreview
          fileName="ru.json"
          filePath="C:/project/locales/ru.json"
          content='{ "TITLE": "Привет" }'
          isLocalizationCandidate={true}
          isCheckedForComparison={false}
          onToggleCheckFile={handleToggle}
        />
      </I18nProvider>
    )

    const includeBtn = screen.getByRole('button', { name: /include in comparison/i })
    fireEvent.click(includeBtn)
    expect(handleToggle).toHaveBeenCalledWith('C:/project/locales/ru.json')
  })
})
