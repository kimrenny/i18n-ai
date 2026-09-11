import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SettingsModal } from '../components/settings/SettingsModal'
import { DEFAULT_APP_SETTINGS, migrateAppSettings, AppSettings } from '../types/settings'
import {
  type FeatureId,
  getDefaultFeatureState,
} from '../types/features'
import { I18nProvider } from '../i18n/I18nContext'
import React, { useState } from 'react'

describe('Feature Toggle State Persistence & Non-Reset Regression Tests', () => {
  const renderWithI18n = (ui: React.ReactElement) => {
    return render(<I18nProvider language="en">{ui}</I18nProvider>)
  }

  it('Critical Case 1: Disables ai_translation -> disables free_translation -> enables free_translation -> asserts ai_translation remains false', () => {
    // Harness simulating authoritative App.tsx state management and IPC merging
    let currentSettings: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      features: getDefaultFeatureState(),
    }

    const Harness: React.FC = () => {
      const [settings, setSettings] = useState<AppSettings>(currentSettings)

      const handleUpdateTranslationSettings = (update: Partial<AppSettings>) => {
        const merged: AppSettings = {
          ...settings,
          ...update,
          features: update.features
            ? {
                ...settings.features,
                ...update.features,
              }
            : settings.features,
        }
        const migrated = migrateAppSettings(merged)
        currentSettings = migrated
        setSettings(migrated)
      }

      const handleUpdateFeatureSettings = (update: Partial<Record<FeatureId, boolean>>) => {
        const merged: AppSettings = {
          ...settings,
          features: {
            ...settings.features,
            ...update,
          },
        }
        const migrated = migrateAppSettings(merged)
        currentSettings = migrated
        setSettings(migrated)
      }

      return (
        <SettingsModal
          settings={settings}
          isSaving={false}
          saveError={null}
          initialTab="features"
          onUpdateAiSettings={() => {}}
          onUpdateTranslationSettings={handleUpdateTranslationSettings}
          onUpdateFeatureSettings={handleUpdateFeatureSettings}
          onClose={() => {}}
        />
      )
    }

    renderWithI18n(<Harness />)

    const aiToggle = screen.getByRole('checkbox', { name: /toggle ai translation/i })
    const freeToggle = screen.getByRole('checkbox', { name: /toggle free translation/i })

    expect(aiToggle).toBeChecked()
    expect(freeToggle).toBeChecked()

    // 1. Disable ai_translation
    fireEvent.click(aiToggle)
    expect(aiToggle).not.toBeChecked()
    expect(currentSettings.features.ai_translation).toBe(false)
    expect(currentSettings.engine).toBe('free')

    // 2. Disable free_translation
    fireEvent.click(freeToggle)
    expect(freeToggle).not.toBeChecked()
    expect(currentSettings.features.free_translation).toBe(false)
    expect(currentSettings.features.ai_translation).toBe(false)

    // 3. Enable free_translation
    fireEvent.click(freeToggle)
    expect(freeToggle).toBeChecked()
    expect(currentSettings.features.free_translation).toBe(true)

    // 4. Critical Assertion: ai_translation is STILL false!
    expect(aiToggle).not.toBeChecked()
    expect(currentSettings.features.ai_translation).toBe(false)
  })

  it('Critical Case 2: Disables three features -> toggles the middle one back ON -> asserts the other two remain OFF', () => {
    let currentSettings: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      features: getDefaultFeatureState(),
    }

    const Harness: React.FC = () => {
      const [settings, setSettings] = useState<AppSettings>(currentSettings)

      const handleUpdateFeatureSettings = (update: Partial<Record<FeatureId, boolean>>) => {
        const merged: AppSettings = {
          ...settings,
          features: {
            ...settings.features,
            ...update,
          },
        }
        const migrated = migrateAppSettings(merged)
        currentSettings = migrated
        setSettings(migrated)
      }

      return (
        <SettingsModal
          settings={settings}
          isSaving={false}
          saveError={null}
          initialTab="features"
          onUpdateAiSettings={() => {}}
          onUpdateTranslationSettings={() => {}}
          onUpdateFeatureSettings={handleUpdateFeatureSettings}
          onClose={() => {}}
        />
      )
    }

    renderWithI18n(<Harness />)

    const diffToggle = screen.getByTestId('feature-toggle-diff_viewer')
    const inspectorToggle = screen.getByTestId('feature-toggle-key_inspector')
    const searchToggle = screen.getByTestId('feature-toggle-global_search')

    expect(diffToggle).toBeChecked()
    expect(inspectorToggle).toBeChecked()
    expect(searchToggle).toBeChecked()

    // 1. Disable all three
    fireEvent.click(diffToggle)
    fireEvent.click(inspectorToggle)
    fireEvent.click(searchToggle)

    expect(currentSettings.features.diff_viewer).toBe(false)
    expect(currentSettings.features.key_inspector).toBe(false)
    expect(currentSettings.features.global_search).toBe(false)

    // 2. Toggle the middle one (key_inspector) back ON
    fireEvent.click(inspectorToggle)
    expect(currentSettings.features.key_inspector).toBe(true)

    // 3. Assert the other two remain OFF
    expect(currentSettings.features.diff_viewer).toBe(false)
    expect(currentSettings.features.global_search).toBe(false)
    expect(diffToggle).not.toBeChecked()
    expect(inspectorToggle).toBeChecked()
    expect(searchToggle).not.toBeChecked()
  })

  it('Critical Case 3: Persistence and Migration preserves all disabled feature states', () => {
    const initialState: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      features: {
        ...getDefaultFeatureState(),
        git_integration: false,
        translation_history: false,
        quality_checks: false,
      },
    }

    // JSON serialization (simulating disk write)
    const serialized = JSON.stringify(initialState)
    const deserialized = JSON.parse(serialized)

    // Migration (simulating disk reload and app restart)
    const reloaded = migrateAppSettings(deserialized)

    expect(reloaded.features.git_integration).toBe(false)
    expect(reloaded.features.translation_history).toBe(false)
    expect(reloaded.features.quality_checks).toBe(false)
    expect(reloaded.features.diff_viewer).toBe(true)
    expect(reloaded.features.ai_translation).toBe(true)
  })

  it('Critical Case 4: Migration never turns existing false into true and ignores unknown obsolete keys', () => {
    const rawPartialWithObsolete = {
      language: 'uk',
      features: {
        diff_viewer: false,
        key_usage_scanner: false,
        obsolete_legacy_flag_1: true,
        obsolete_legacy_flag_2: false,
      },
    }

    const migrated = migrateAppSettings(rawPartialWithObsolete)

    // Existing explicit false values are preserved
    expect(migrated.features.diff_viewer).toBe(false)
    expect(migrated.features.key_usage_scanner).toBe(false)

    // Missing registered features receive defaults
    expect(migrated.features.ai_translation).toBe(true)
    expect(migrated.features.git_integration).toBe(true)

    // Obsolete keys are omitted from type-safe feature map
    expect((migrated.features as Record<string, unknown>).obsolete_legacy_flag_1).toBeUndefined()
    expect((migrated.features as Record<string, unknown>).obsolete_legacy_flag_2).toBeUndefined()
  })

  it('Critical Case 5: Serialized lock / atomic merge handles concurrent updates without dropped toggles', async () => {
    let settingsStore: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      features: getDefaultFeatureState(),
    }

    let settingsMutex: Promise<unknown> = Promise.resolve()
    const withLock = async <T,>(fn: () => Promise<T>): Promise<T> => {
      const next = settingsMutex.then(fn, fn)
      settingsMutex = next.catch(() => {})
      return next
    }

    const updateFeature = async (update: Partial<Record<FeatureId, boolean>>) => {
      return withLock(async () => {
        // simulate async I/O latency
        await new Promise((resolve) => setTimeout(resolve, 10))
        const merged: AppSettings = {
          ...settingsStore,
          features: {
            ...settingsStore.features,
            ...update,
          },
        }
        settingsStore = migrateAppSettings(merged)
        return settingsStore
      })
    }

    // Fire 5 concurrent toggle operations simultaneously
    await Promise.all([
      updateFeature({ diff_viewer: false }),
      updateFeature({ key_inspector: false }),
      updateFeature({ global_search: false }),
      updateFeature({ git_integration: false }),
      updateFeature({ translation_history: false }),
    ])

    expect(settingsStore.features.diff_viewer).toBe(false)
    expect(settingsStore.features.key_inspector).toBe(false)
    expect(settingsStore.features.global_search).toBe(false)
    expect(settingsStore.features.git_integration).toBe(false)
    expect(settingsStore.features.translation_history).toBe(false)
    // Other features remain enabled
    expect(settingsStore.features.ai_translation).toBe(true)
    expect(settingsStore.features.free_translation).toBe(true)
  })

  it('Critical Case 6: Closing and reopening Settings preserves all toggled states', () => {
    let currentSettings: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      features: getDefaultFeatureState(),
    }

    const ModalController: React.FC = () => {
      const [isOpen, setIsOpen] = useState(true)
      const [settings, setSettings] = useState<AppSettings>(currentSettings)

      const handleUpdateFeatureSettings = (update: Partial<Record<FeatureId, boolean>>) => {
        const merged: AppSettings = {
          ...settings,
          features: {
            ...settings.features,
            ...update,
          },
        }
        const migrated = migrateAppSettings(merged)
        currentSettings = migrated
        setSettings(migrated)
      }

      return (
        <div>
          <button data-testid="reopen-settings-btn" onClick={() => setIsOpen(true)}>
            Open
          </button>
          {isOpen && (
            <SettingsModal
              settings={settings}
              isSaving={false}
              saveError={null}
              initialTab="features"
              onUpdateAiSettings={() => {}}
              onUpdateTranslationSettings={() => {}}
              onUpdateFeatureSettings={handleUpdateFeatureSettings}
              onClose={() => setIsOpen(false)}
            />
          )}
        </div>
      )
    }

    renderWithI18n(<ModalController />)

    // 1. Disable diff_viewer and git_integration
    fireEvent.click(screen.getByTestId('feature-toggle-diff_viewer'))
    fireEvent.click(screen.getByTestId('feature-toggle-git_integration'))

    expect(screen.getByTestId('feature-toggle-diff_viewer')).not.toBeChecked()
    expect(screen.getByTestId('feature-toggle-git_integration')).not.toBeChecked()

    // 2. Close modal
    fireEvent.click(screen.getByRole('button', { name: /close settings/i }))
    expect(screen.queryByTestId('feature-toggle-diff_viewer')).not.toBeInTheDocument()

    // 3. Reopen modal
    fireEvent.click(screen.getByTestId('reopen-settings-btn'))

    // 4. Verify toggles retained their disabled states
    expect(screen.getByTestId('feature-toggle-diff_viewer')).not.toBeChecked()
    expect(screen.getByTestId('feature-toggle-git_integration')).not.toBeChecked()
    expect(screen.getByTestId('feature-toggle-ai_translation')).toBeChecked()
  })

  it('Critical Case 7: Changing language or AI provider settings does NOT reset feature states', () => {
    let currentSettings: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      features: {
        ...getDefaultFeatureState(),
        diff_viewer: false,
        key_inspector: false,
      },
    }

    const AppHarness: React.FC = () => {
      const [settings, setSettings] = useState<AppSettings>(currentSettings)

      const handleUpdateTranslationSettings = (update: Partial<AppSettings>) => {
        const merged: AppSettings = {
          ...settings,
          ...update,
          features: update.features
            ? {
                ...settings.features,
                ...update.features,
              }
            : settings.features,
        }
        const migrated = migrateAppSettings(merged)
        currentSettings = migrated
        setSettings(migrated)
      }

      return (
        <SettingsModal
          settings={settings}
          isSaving={false}
          saveError={null}
          initialTab="translation"
          onUpdateAiSettings={() => {}}
          onUpdateTranslationSettings={handleUpdateTranslationSettings}
          onUpdateFeatureSettings={() => {}}
          onClose={() => {}}
        />
      )
    }

    renderWithI18n(<AppHarness />)

    // Change language in translation tab
    const languageSelect = screen.getByRole('combobox', { name: /application language/i })
    fireEvent.change(languageSelect, { target: { value: 'de' } })

    expect(currentSettings.language).toBe('de')
    // Crucial: features must remain false!
    expect(currentSettings.features.diff_viewer).toBe(false)
    expect(currentSettings.features.key_inspector).toBe(false)
    expect(currentSettings.features.ai_translation).toBe(true)
  })
})
