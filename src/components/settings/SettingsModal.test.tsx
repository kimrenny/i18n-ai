import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SettingsModal } from './SettingsModal'
import { DEFAULT_APP_SETTINGS } from '../../types/settings'
import {
  FEATURE_DEFINITIONS,
  FEATURE_CATEGORIES,
  getDefaultFeatureState,
} from '../../types/features'
import { I18nProvider } from '../../i18n/I18nContext'

describe('SettingsModal - Features Tab & Dynamic Toggles', () => {
  const defaultProps = {
    settings: {
      ...DEFAULT_APP_SETTINGS,
      features: getDefaultFeatureState(),
    },
    isSaving: false,
    saveError: null,
    onUpdateAiSettings: vi.fn(),
    onUpdateTranslationSettings: vi.fn(),
    onUpdateFeatureSettings: vi.fn(),
    onClose: vi.fn(),
  }

  const renderWithI18n = (ui: React.ReactElement, language = 'en' as const) => {
    return render(<I18nProvider language={language}>{ui}</I18nProvider>)
  }

  it('renders tab navigation with Translation and Features tabs', () => {
    renderWithI18n(<SettingsModal {...defaultProps} />)

    const translationTab = screen.getByRole('tab', { name: /translation & general/i })
    const featuresTab = screen.getByRole('tab', { name: /features/i })

    expect(translationTab).toBeInTheDocument()
    expect(featuresTab).toBeInTheDocument()
    expect(translationTab).toHaveAttribute('aria-selected', 'true')
    expect(featuresTab).toHaveAttribute('aria-selected', 'false')
  })

  it('switches to Features tab when clicked and displays intro banner', () => {
    renderWithI18n(<SettingsModal {...defaultProps} />)

    const featuresTab = screen.getByRole('tab', { name: /features/i })
    fireEvent.click(featuresTab)

    expect(featuresTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel', { name: /features/i })).toHaveAttribute(
      'id',
      'settings-panel-features'
    )
    expect(
      screen.getByRole('heading', { level: 3, name: /built-in features/i })
    ).toBeInTheDocument()
  })

  it('renders all feature categories and all registered features from FEATURE_DEFINITIONS', () => {
    renderWithI18n(<SettingsModal {...defaultProps} initialTab="features" />)

    // Verify all categories are rendered
    for (const category of FEATURE_CATEGORIES) {
      const catHeading = screen.getByRole('heading', {
        level: 4,
        name: category.name,
      })
      expect(catHeading).toBeInTheDocument()
    }

    // Verify all registered features are rendered with their names and descriptions
    for (const feature of FEATURE_DEFINITIONS) {
      expect(screen.getByText(feature.name)).toBeInTheDocument()
      if (feature.description) {
        expect(screen.getByText(feature.description)).toBeInTheDocument()
      }
      const toggle = screen.getByRole('checkbox', {
        name: new RegExp(`toggle ${feature.name}`, 'i'),
      })
      expect(toggle).toBeInTheDocument()
      expect(toggle).toBeChecked()
    }
  })

  it('toggles a feature and calls onUpdateFeatureSettings', () => {
    const onUpdateFeatureSettings = vi.fn()

    renderWithI18n(
      <SettingsModal
        {...defaultProps}
        initialTab="features"
        onUpdateFeatureSettings={onUpdateFeatureSettings}
      />
    )

    const keyUsageToggle = screen.getByRole('checkbox', {
      name: /toggle key usage scanner/i,
    })
    expect(keyUsageToggle).toBeChecked()

    // Turn OFF Key Usage Scanner
    fireEvent.click(keyUsageToggle)

    expect(onUpdateFeatureSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        key_usage_scanner: false,
      })
    )
  })

  it('falls back to onUpdateTranslationSettings when onUpdateFeatureSettings is not provided', () => {
    const onUpdateTranslationSettings = vi.fn()

    renderWithI18n(
      <SettingsModal
        {...defaultProps}
        initialTab="features"
        onUpdateFeatureSettings={undefined}
        onUpdateTranslationSettings={onUpdateTranslationSettings}
      />
    )

    const keyUsageToggle = screen.getByRole('checkbox', {
      name: /toggle key usage scanner/i,
    })

    fireEvent.click(keyUsageToggle)

    expect(onUpdateTranslationSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        features: expect.objectContaining({
          key_usage_scanner: false,
        }),
      })
    )
  })

  it('reflects persisted disabled feature state from settings prop', () => {
    const customSettings = {
      ...DEFAULT_APP_SETTINGS,
      features: {
        ...getDefaultFeatureState(),
        git_integration: false,
        ai_translation: false,
      },
    }

    renderWithI18n(
      <SettingsModal
        {...defaultProps}
        settings={customSettings}
        initialTab="features"
      />
    )

    const gitToggle = screen.getByRole('checkbox', {
      name: /toggle git integration/i,
    })
    const aiToggle = screen.getByRole('checkbox', {
      name: /toggle ai translation/i,
    })
    const diffViewerToggle = screen.getByRole('checkbox', {
      name: /toggle diff viewer/i,
    })

    expect(gitToggle).not.toBeChecked()
    expect(aiToggle).not.toBeChecked()
    expect(diffViewerToggle).toBeChecked()
  })

  it('allows toggling a feature back ON from disabled state', () => {
    const onUpdateFeatureSettings = vi.fn()
    const customSettings = {
      ...DEFAULT_APP_SETTINGS,
      features: {
        ...getDefaultFeatureState(),
        git_integration: false,
      },
    }

    renderWithI18n(
      <SettingsModal
        {...defaultProps}
        settings={customSettings}
        initialTab="features"
        onUpdateFeatureSettings={onUpdateFeatureSettings}
      />
    )

    const gitToggle = screen.getByRole('checkbox', {
      name: /toggle git integration/i,
    })
    expect(gitToggle).not.toBeChecked()

    // Turn ON Git Integration
    fireEvent.click(gitToggle)

    expect(onUpdateFeatureSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        git_integration: true,
      })
    )
  })

  it('disables toggle switches when isSaving is true', () => {
    renderWithI18n(
      <SettingsModal
        {...defaultProps}
        initialTab="features"
        isSaving={true}
      />
    )

    for (const feature of FEATURE_DEFINITIONS) {
      const toggle = screen.getByRole('checkbox', {
        name: new RegExp(`toggle ${feature.name}`, 'i'),
      })
      expect(toggle).toBeDisabled()
    }
  })
})
