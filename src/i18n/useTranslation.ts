import { useContext } from 'react'
import { I18nContext } from './context'
import type { I18nContextValue } from './types'

export function useTranslation(): I18nContextValue {
  return useContext(I18nContext)
}
