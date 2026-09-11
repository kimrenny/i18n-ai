export type FeatureCategory =
  | 'core'
  | 'analysis'
  | 'history_vcs'
  | 'translation'

export interface FeatureCategoryDefinition {
  id: FeatureCategory
  name: string
  description?: string
}

export const FEATURE_CATEGORIES: readonly FeatureCategoryDefinition[] = [
  {
    id: 'core',
    name: 'Core Localization',
    description: 'Core comparison, editing, navigation, and inspection features',
  },
  {
    id: 'analysis',
    name: 'Quality & Code Analysis',
    description: 'Codebase key usage analysis and localization quality verification',
  },
  {
    id: 'history_vcs',
    name: 'History & Version Control',
    description: 'Translation edit history and Git version control integration',
  },
  {
    id: 'translation',
    name: 'Automated Translation',
    description: 'AI and free machine translation providers and review workflows',
  },
] as const

export type FeatureId =
  | 'diff_viewer'
  | 'translation_editor'
  | 'missing_key_navigator'
  | 'key_inspector'
  | 'global_search'
  | 'key_usage_scanner'
  | 'quality_checks'
  | 'preflight_validator'
  | 'translation_history'
  | 'git_integration'
  | 'ai_translation'
  | 'free_translation'

export interface FeatureDefinition {
  id: FeatureId
  name: string
  category: FeatureCategory
  defaultEnabled: boolean
  description: string
}

export const FEATURE_DEFINITIONS: readonly FeatureDefinition[] = [
  {
    id: 'diff_viewer',
    name: 'Diff Viewer',
    category: 'core',
    defaultEnabled: true,
    description: 'Side-by-side multi-language comparison matrix and hierarchical key tree.',
  },
  {
    id: 'translation_editor',
    name: 'Translation Editor',
    category: 'core',
    defaultEnabled: true,
    description: 'Inline editing, adding new keys, renaming key paths, and deleting translations.',
  },
  {
    id: 'missing_key_navigator',
    name: 'Missing Key Navigator',
    category: 'core',
    defaultEnabled: true,
    description: 'Quick previous/next navigation between missing and empty translations with keyboard shortcuts.',
  },
  {
    id: 'key_inspector',
    name: 'Translation Key Inspector',
    category: 'core',
    defaultEnabled: true,
    description: 'Detailed inspection of key variants, parameter chips, quality issues, and code references.',
  },
  {
    id: 'global_search',
    name: 'Global Search',
    category: 'core',
    defaultEnabled: true,
    description: 'Search translation keys and values across all loaded localization files with quick navigation.',
  },
  {
    id: 'key_usage_scanner',
    name: 'Key Usage Scanner',
    category: 'analysis',
    defaultEnabled: true,
    description: 'Static AST analysis of source code to find used, confirmed unused, and dynamic localization keys.',
  },
  {
    id: 'quality_checks',
    name: 'Quality Checks',
    category: 'analysis',
    defaultEnabled: true,
    description: 'Detection of placeholder mismatches, corrupted markup tags, empty values, and structural conflicts.',
  },
  {
    id: 'preflight_validator',
    name: 'Pre-flight Validator',
    category: 'analysis',
    defaultEnabled: true,
    description: 'Pre-release validation panel aggregating blocking errors and warnings across all files.',
  },
  {
    id: 'translation_history',
    name: 'Translation History',
    category: 'history_vcs',
    defaultEnabled: true,
    description: 'History action log of translation edits, additions, and deletions with selective revert and undo/redo.',
  },
  {
    id: 'git_integration',
    name: 'Git Integration',
    category: 'history_vcs',
    defaultEnabled: true,
    description: 'Version control integration including working tree status, visual diff, selective commit, branches, and remote sync.',
  },
  {
    id: 'ai_translation',
    name: 'AI Translation',
    category: 'translation',
    defaultEnabled: true,
    description: 'Assisted translation using AI providers (OpenAI, Gemini, Claude, Mistral, xAI, DeepSeek, Ollama).',
  },
  {
    id: 'free_translation',
    name: 'Free Translation',
    category: 'translation',
    defaultEnabled: true,
    description: 'Assisted translation using free providers (LibreTranslate, MyMemory).',
  },
] as const

export type FeatureToggleState = Record<FeatureId, boolean>

const VALID_FEATURE_IDS: ReadonlySet<string> = new Set(
  FEATURE_DEFINITIONS.map((def) => def.id)
)

const VALID_CATEGORY_IDS: ReadonlySet<string> = new Set(
  FEATURE_CATEGORIES.map((cat) => cat.id)
)

export function isFeatureId(val: unknown): val is FeatureId {
  return typeof val === 'string' && VALID_FEATURE_IDS.has(val)
}

export function isFeatureCategory(val: unknown): val is FeatureCategory {
  return typeof val === 'string' && VALID_CATEGORY_IDS.has(val)
}

export function getFeatureDefinition(id: FeatureId): FeatureDefinition | undefined {
  return FEATURE_DEFINITIONS.find((def) => def.id === id)
}

export function getAllFeatureDefinitions(): readonly FeatureDefinition[] {
  return FEATURE_DEFINITIONS
}

export function getAllFeatureCategories(): readonly FeatureCategoryDefinition[] {
  return FEATURE_CATEGORIES
}

/**
 * Returns the default enabled state for all registered features.
 */
export function getDefaultFeatureState(): FeatureToggleState {
  const state: Partial<FeatureToggleState> = {}
  for (const def of FEATURE_DEFINITIONS) {
    state[def.id] = def.defaultEnabled
  }
  return state as FeatureToggleState
}

/**
 * Checks whether a specific feature is enabled in the given state.
 * If state is undefined or the feature is missing, falls back to the feature's default value.
 */
export function isFeatureEnabled(
  state: Partial<FeatureToggleState> | undefined | null,
  id: FeatureId
): boolean {
  if (!state || typeof state !== 'object') {
    return getFeatureDefinition(id)?.defaultEnabled ?? true
  }
  const val = state[id]
  if (typeof val === 'boolean') {
    return val
  }
  return getFeatureDefinition(id)?.defaultEnabled ?? true
}

/**
 * Returns a new feature state with the specified feature enabled or disabled.
 */
export function setFeatureEnabled(
  state: FeatureToggleState,
  id: FeatureId,
  enabled: boolean
): FeatureToggleState {
  return {
    ...state,
    [id]: enabled,
  }
}

/**
 * Resets all features to their default values.
 */
export function resetFeatureState(): FeatureToggleState {
  return getDefaultFeatureState()
}

/**
 * Migrates a raw, partial, or legacy feature state object.
 * Missing features receive their default enabled state.
 * Unknown or obsolete feature IDs in raw input are safely ignored without crashing.
 */
export function migrateFeatureState(raw: unknown): FeatureToggleState {
  const defaults = getDefaultFeatureState()
  if (!raw || typeof raw !== 'object') {
    return defaults
  }

  const rawObj = raw as Record<string, unknown>
  const result: Partial<FeatureToggleState> = { ...defaults }

  for (const def of FEATURE_DEFINITIONS) {
    const rawVal = rawObj[def.id]
    if (typeof rawVal === 'boolean') {
      result[def.id] = rawVal
    } else {
      result[def.id] = def.defaultEnabled
    }
  }

  return result as FeatureToggleState
}
