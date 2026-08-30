import React, { useMemo } from 'react'
import type { AppLanguage } from '../types/settings'
import type { I18nContextValue } from './types'
import { translate } from './translator'
import { I18nContext } from './context'

export interface I18nProviderProps {
  language?: AppLanguage
  children: React.ReactNode
}

export const I18nProvider: React.FC<I18nProviderProps> = ({
  language = 'en',
  children,
}) => {
  const contextValue = useMemo<I18nContextValue>(() => {
    return {
      language,
      t: (keyPath: string, params?: Record<string, string | number>) =>
        translate(language, keyPath, params),
    }
  }, [language])

  return (
    <I18nContext.Provider value={contextValue}>
      {children}
    </I18nContext.Provider>
  )
}
