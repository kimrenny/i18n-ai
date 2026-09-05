import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { TranslationKeyInspector } from './TranslationKeyInspector'
import { I18nProvider } from '../../i18n/I18nContext'
import type { ParsedLocalizationFile } from '../../types/localization'

describe('TranslationKeyInspector Component', () => {
  const mockFiles: ParsedLocalizationFile[] = [
    {
      filename: 'en.json',
      path: '/locales/en.json',
      raw: {
        ADMIN: {
          TITLE: 'Dashboard',
        },
      },
      keys: {
        'ADMIN.TITLE': 'Dashboard',
      },
      keyCount: 1,
    },
    {
      filename: 'uk.json',
      path: '/locales/uk.json',
      raw: {
        ADMIN: {
          TITLE: 'Панель керування',
        },
      },
      keys: {
        'ADMIN.TITLE': 'Панель керування',
      },
      keyCount: 1,
    },
    {
      filename: 'de.json',
      path: '/locales/de.json',
      raw: {
        ADMIN: {
          TITLE: '',
        },
      },
      keys: {
        'ADMIN.TITLE': '',
      },
      keyCount: 1,
    },
    {
      filename: 'fr.json',
      path: '/locales/fr.json',
      raw: {},
      keys: {},
      keyCount: 0,
    },
  ]

  const renderInspector = (
    props: Partial<React.ComponentProps<typeof TranslationKeyInspector>> = {}
  ) => {
    const defaultProps = {
      selectedKey: null,
      parsedFiles: mockFiles,
      onNavigateLanguage: vi.fn(),
      onClose: vi.fn(),
      ...props,
    }

    const utils = render(
      <I18nProvider language="en">
        <TranslationKeyInspector {...defaultProps} />
      </I18nProvider>
    )

    return { ...utils, props: defaultProps }
  }

  it('renders empty selection state when no key is selected', () => {
    renderInspector({ selectedKey: null })

    expect(screen.getByTestId('inspector-empty-state')).toBeInTheDocument()
    expect(screen.getByText('No translation key selected')).toBeInTheDocument()
  })

  it('renders inspected key details, reference language, coverage, and translations', () => {
    renderInspector({ selectedKey: 'ADMIN.TITLE' })

    // Key Path
    expect(screen.getByTestId('inspector-key-card')).toHaveTextContent('ADMIN.TITLE')

    // Reference Language
    const refCard = screen.getByTestId('inspector-reference-card')
    expect(refCard).toHaveTextContent('English')
    expect(refCard).toHaveTextContent('en.json')
    expect(refCard).toHaveTextContent('"Dashboard"')

    // Coverage: 2 / 4 = 50%
    expect(screen.getByText('2 / 4')).toBeInTheDocument()
    expect(screen.getByText('50% complete')).toBeInTheDocument()

    // Problems: 1 Empty, 1 Missing
    expect(screen.getByText(/1 Empty/)).toBeInTheDocument()
    expect(screen.getByText(/1 Missing/)).toBeInTheDocument()

    // Translations list per language
    expect(screen.getByTestId('inspector-lang-en.json')).toHaveTextContent('English')
    expect(screen.getByTestId('inspector-lang-en.json')).toHaveTextContent('Dashboard')

    expect(screen.getByTestId('inspector-lang-uk.json')).toHaveTextContent('Ukrainian')
    expect(screen.getByTestId('inspector-lang-uk.json')).toHaveTextContent('Панель керування')

    expect(screen.getByTestId('inspector-lang-de.json')).toHaveTextContent('German')
    expect(screen.getByTestId('inspector-lang-de.json')).toHaveTextContent('""')

    expect(screen.getByTestId('inspector-lang-fr.json')).toHaveTextContent('French')
    expect(screen.getByTestId('inspector-lang-fr.json')).toHaveTextContent('(Missing)')
  })

  it('triggers onNavigateLanguage when clicking Open on a language row', () => {
    const onNavigateLanguage = vi.fn()
    renderInspector({ selectedKey: 'ADMIN.TITLE', onNavigateLanguage })

    const ukItem = screen.getByTestId('inspector-lang-uk.json')
    const openBtn = ukItem.querySelector('button.inspector-open-btn')!
    fireEvent.click(openBtn)

    expect(onNavigateLanguage).toHaveBeenCalledWith('uk.json', 'ADMIN.TITLE')
  })

  it('triggers onClose when close button is clicked', () => {
    const onClose = vi.fn()
    renderInspector({ selectedKey: 'ADMIN.TITLE', onClose })

    fireEvent.click(screen.getByLabelText(/close inspector/i))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
