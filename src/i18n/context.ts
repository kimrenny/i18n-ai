import { createContext } from 'react'
import type { I18nContextValue } from './types'
import { translate } from './translator'

export const I18nContext = createContext<I18nContextValue>({
  language: 'en',
  t: (keyPath, params) => translate('en', keyPath, params),
})
