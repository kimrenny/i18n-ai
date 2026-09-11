import { describe, it, expect } from 'vitest'
import {
  isFeatureId,
  isFeatureCategory,
  getFeatureDefinition,
  getAllFeatureDefinitions,
  getAllFeatureCategories,
  getDefaultFeatureState,
  isFeatureEnabled,
  setFeatureEnabled,
  resetFeatureState,
  migrateFeatureState,
  type FeatureId,
} from './features'
import { migrateAppSettings, DEFAULT_APP_SETTINGS } from './settings'

describe('Feature Toggle System Foundation', () => {
  describe('Registry & Definitions', () => {
    it('contains only valid feature definitions with non-empty fields', () => {
      const definitions = getAllFeatureDefinitions()
      expect(definitions.length).toBeGreaterThanOrEqual(10)

      for (const def of definitions) {
        expect(def.id).toBeTruthy()
        expect(typeof def.id).toBe('string')
        expect(def.name).toBeTruthy()
        expect(typeof def.name).toBe('string')
        expect(def.description).toBeTruthy()
        expect(typeof def.description).toBe('string')
        expect(def.category).toBeTruthy()
        expect(isFeatureCategory(def.category)).toBe(true)
        expect(typeof def.defaultEnabled).toBe('boolean')
      }
    })

    it('ensures all feature IDs in registry are strictly unique', () => {
      const definitions = getAllFeatureDefinitions()
      const ids = definitions.map((d) => d.id)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(ids.length)
    })

    it('ensures all feature categories are strictly unique', () => {
      const categories = getAllFeatureCategories()
      const ids = categories.map((c) => c.id)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(ids.length)
    })

    it('retrieves specific definitions via getFeatureDefinition', () => {
      const diffViewer = getFeatureDefinition('diff_viewer')
      expect(diffViewer).toBeDefined()
      expect(diffViewer?.name).toBe('Diff Viewer')
      expect(diffViewer?.category).toBe('core')

      const scanner = getFeatureDefinition('key_usage_scanner')
      expect(scanner).toBeDefined()
      expect(scanner?.name).toBe('Key Usage Scanner')
      expect(scanner?.category).toBe('analysis')

      const git = getFeatureDefinition('git_integration')
      expect(git).toBeDefined()
      expect(git?.category).toBe('history_vcs')

      const ai = getFeatureDefinition('ai_translation')
      expect(ai).toBeDefined()
      expect(ai?.category).toBe('translation')
    })

    it('validates feature IDs and category IDs correctly using type guards', () => {
      expect(isFeatureId('diff_viewer')).toBe(true)
      expect(isFeatureId('key_usage_scanner')).toBe(true)
      expect(isFeatureId('non_existent_feature_xyz')).toBe(false)
      expect(isFeatureId(null)).toBe(false)
      expect(isFeatureId(undefined)).toBe(false)
      expect(isFeatureId(123)).toBe(false)

      expect(isFeatureCategory('core')).toBe(true)
      expect(isFeatureCategory('analysis')).toBe(true)
      expect(isFeatureCategory('history_vcs')).toBe(true)
      expect(isFeatureCategory('translation')).toBe(true)
      expect(isFeatureCategory('invalid_category')).toBe(false)
    })
  })

  describe('Defaults & State Management', () => {
    it('sets all existing built-in features to enabled by default', () => {
      const defaultState = getDefaultFeatureState()
      const definitions = getAllFeatureDefinitions()

      for (const def of definitions) {
        expect(defaultState[def.id]).toBe(true)
        expect(def.defaultEnabled).toBe(true)
      }
    })

    it('checks feature enablement with isFeatureEnabled and falls back safely', () => {
      const defaultState = getDefaultFeatureState()
      expect(isFeatureEnabled(defaultState, 'diff_viewer')).toBe(true)
      expect(isFeatureEnabled(defaultState, 'git_integration')).toBe(true)

      const modifiedState = { ...defaultState, git_integration: false }
      expect(isFeatureEnabled(modifiedState, 'git_integration')).toBe(false)
      expect(isFeatureEnabled(modifiedState, 'diff_viewer')).toBe(true)

      // Fallback when state is undefined or partial
      expect(isFeatureEnabled(undefined, 'diff_viewer')).toBe(true)
      expect(isFeatureEnabled(null, 'diff_viewer')).toBe(true)
      expect(isFeatureEnabled({}, 'diff_viewer')).toBe(true)
    })

    it('updates feature state via setFeatureEnabled immutably', () => {
      const initial = getDefaultFeatureState()
      const updated = setFeatureEnabled(initial, 'key_usage_scanner', false)

      expect(initial.key_usage_scanner).toBe(true)
      expect(updated.key_usage_scanner).toBe(false)
      expect(updated.diff_viewer).toBe(true)
    })

    it('resets feature state back to defaults via resetFeatureState', () => {
      const initial = getDefaultFeatureState()
      const disabledAll = { ...initial }
      for (const id of Object.keys(disabledAll) as FeatureId[]) {
        disabledAll[id] = false
      }
      expect(disabledAll.diff_viewer).toBe(false)

      const reset = resetFeatureState()
      expect(reset.diff_viewer).toBe(true)
      expect(reset.key_usage_scanner).toBe(true)
      expect(reset.git_integration).toBe(true)
    })
  })

  describe('Persistence Integration & Backward Compatibility', () => {
    it('migrates missing or empty feature settings to full default enabled state', () => {
      const migratedEmpty = migrateFeatureState({})
      const defaultState = getDefaultFeatureState()
      expect(migratedEmpty).toEqual(defaultState)

      const migratedNull = migrateFeatureState(null)
      expect(migratedNull).toEqual(defaultState)
    })

    it('preserves user customizations while populating newly added features with defaults', () => {
      const partialUserCustomization = {
        key_usage_scanner: false,
        git_integration: false,
      }

      const migrated = migrateFeatureState(partialUserCustomization)
      expect(migrated.key_usage_scanner).toBe(false)
      expect(migrated.git_integration).toBe(false)
      expect(migrated.diff_viewer).toBe(true)
      expect(migrated.translation_editor).toBe(true)
      expect(migrated.ai_translation).toBe(true)
    })

    it('safely ignores unknown or obsolete feature IDs in persisted settings without crashing', () => {
      const legacyWithObsolete = {
        diff_viewer: true,
        obsolete_removed_plugin_v1: false,
        random_future_id_123: true,
      }

      const migrated = migrateFeatureState(legacyWithObsolete)
      expect(migrated.diff_viewer).toBe(true)
      expect(migrated.git_integration).toBe(true)
      expect((migrated as Record<string, unknown>).obsolete_removed_plugin_v1).toBeUndefined()
      expect((migrated as Record<string, unknown>).random_future_id_123).toBeUndefined()
    })

    it('seamlessly integrates feature state into migrateAppSettings', () => {
      const legacyAppSettings = {
        language: 'de',
        engine: 'ai',
        aiTranslation: {
          provider: 'openai',
          providers: {
            openai: { model: 'gpt-4o', apiKey: 'test-key' },
          },
        },
      }

      const migrated = migrateAppSettings(legacyAppSettings)
      expect(migrated.language).toBe('de')
      expect(migrated.features).toBeDefined()
      expect(migrated.features.diff_viewer).toBe(true)
      expect(migrated.features.key_usage_scanner).toBe(true)

      // Settings with feature overrides
      const appSettingsWithFeatures = {
        ...legacyAppSettings,
        features: {
          key_usage_scanner: false,
        },
      }

      const migratedWithFeatures = migrateAppSettings(appSettingsWithFeatures)
      expect(migratedWithFeatures.features.key_usage_scanner).toBe(false)
      expect(migratedWithFeatures.features.diff_viewer).toBe(true)
    })

    it('ensures DEFAULT_APP_SETTINGS contains complete default features state', () => {
      expect(DEFAULT_APP_SETTINGS.features).toBeDefined()
      expect(DEFAULT_APP_SETTINGS.features.diff_viewer).toBe(true)
      expect(DEFAULT_APP_SETTINGS.features.ai_translation).toBe(true)
      expect(DEFAULT_APP_SETTINGS.features.free_translation).toBe(true)
    })
  })
})
