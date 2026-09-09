import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { scanWorkspaceSourceFiles } from '../../electron/main/keyUsageService'
import { parseLocalizationData } from './localizationParser'
import { aggregateKeyUsages } from './keyUsageScanner'

describe('Realistic Multi-Framework Workspace Verification: Key Usage Scanner', () => {
  let tempWorkspace: string

  beforeEach(async () => {
    tempWorkspace = await fs.mkdtemp(path.join(os.tmpdir(), 'realistic-workspace-'))
  })

  afterEach(async () => {
    if (tempWorkspace) {
      await fs.rm(tempWorkspace, { recursive: true, force: true })
    }
  })

  it('connects localization files with Angular, React, Vue, Svelte, and TS services in a realistic workspace', async () => {
    // 1. Create Workspace Structure
    const srcDir = path.join(tempWorkspace, 'src')
    const angularDir = path.join(srcDir, 'angular-app')
    const reactDir = path.join(srcDir, 'react-app')
    const vueDir = path.join(srcDir, 'vue-app')
    const svelteDir = path.join(srcDir, 'svelte-app')
    const servicesDir = path.join(srcDir, 'services')
    const localesDir = path.join(tempWorkspace, 'locales')

    await fs.mkdir(angularDir, { recursive: true })
    await fs.mkdir(reactDir, { recursive: true })
    await fs.mkdir(vueDir, { recursive: true })
    await fs.mkdir(svelteDir, { recursive: true })
    await fs.mkdir(servicesDir, { recursive: true })
    await fs.mkdir(localesDir, { recursive: true })

    // 2. Create Localization Files (en.json, de.json)
    const enData = {
      ANGULAR: {
        TITLE: 'Angular Home',
        HEADER: 'Angular Header',
        INSTANT_KEY: 'Instant Message',
        UNUSED_KEY: 'Unused Angular Key',
      },
      REACT: {
        WELCOME: 'Welcome to React',
        PROFILE: 'User Profile',
      },
      VUE: {
        TITLE: 'Vue Title',
        SUBTITLE: 'Vue Subtitle',
      },
      SVELTE: {
        CARD: 'Svelte Card',
      },
      COMMON: {
        SAVE: 'Save',
        CANCEL: 'Cancel',
        UNUSED_COMMON: 'Unused Common Item',
      },
    }

    const deData = {
      ANGULAR: {
        TITLE: 'Angular Startseite',
        HEADER: 'Angular Kopfzeile',
        INSTANT_KEY: 'Sofortige Nachricht',
        UNUSED_KEY: 'Unbenutzter Schlüssel',
      },
      REACT: {
        WELCOME: 'Willkommen bei React',
        PROFILE: 'Benutzerprofil',
      },
      VUE: {
        TITLE: 'Vue Titel',
        SUBTITLE: 'Vue Untertitel',
      },
      SVELTE: {
        CARD: 'Svelte Karte',
      },
      COMMON: {
        SAVE: 'Speichern',
        CANCEL: 'Abbrechen',
        UNUSED_COMMON: 'Unbenutzter Eintrag',
      },
    }

    await fs.writeFile(path.join(localesDir, 'en.json'), JSON.stringify(enData, null, 2))
    await fs.writeFile(path.join(localesDir, 'de.json'), JSON.stringify(deData, null, 2))

    // 3. Angular Service & Component (uses TranslationService, translate.instant, this.translationService.instant)
    const angularComponentCode = `
      import { Component, OnInit } from '@angular/core'
      import { TranslationService, TranslateService } from './translation.service'

      @Component({
        selector: 'app-home',
        templateUrl: './home.component.html'
      })
      export class HomeComponent implements OnInit {
        title = ''
        header = ''
        instantKey = ''

        constructor(
          private translationService: TranslationService,
          private translate: TranslateService
        ) {}

        ngOnInit() {
          // 1. translationService.instant
          this.title = this.translationService.instant('ANGULAR.TITLE')
          // 2. translationService.translate
          this.header = this.translationService.translate('ANGULAR.HEADER')
          // 3. translate.instant
          this.instantKey = this.translate.instant('ANGULAR.INSTANT_KEY')
          // 4. Code-reference missing key
          const missingKey = this.translationService.instant('ANGULAR.MISSING_CODE_KEY')

          // 5. Dynamic calls
          const dyn = getDynamicSection()
          this.translationService.instant(dyn)
          this.translate.instant('ANGULAR.' + dyn)
          this.translationService.instant(\`ANGULAR.\${dyn}\`)

          // 6. Unrelated methods (MUST NOT be treated as localization)
          const user = this.userService.get('ANGULAR.TITLE')
          const api = this.apiService.get('ANGULAR.HEADER')
        }
      }
    `
    await fs.writeFile(path.join(angularDir, 'home.component.ts'), angularComponentCode)

    // 3b. Angular HTML Template (uses pipes, bound attributes)
    const angularHtmlCode = `
      <section class="banner">
        <h2>{{ 'ANGULAR.TITLE' | translate }}</h2>
        <button [attr.aria-label]="'COMMON.SAVE' | translate">Save</button>
      </section>
    `
    await fs.writeFile(path.join(angularDir, 'home.component.html'), angularHtmlCode)

    // 4. React Component (uses useTranslation, t, tr)
    const reactComponentCode = `
      import React from 'react'
      import { useTranslation } from '../i18n'

      export function ProfileView() {
        const { t } = useTranslation()

        return (
          <div>
            <h1>{t('REACT.WELCOME')}</h1>
            <p>{t('REACT.PROFILE')}</p>
            <button>{t('COMMON.SAVE')}</button>
          </div>
        )
      }
    `
    await fs.writeFile(path.join(reactDir, 'ProfileView.tsx'), reactComponentCode)

    // 5. Vue Component (uses template {{ translationService.instant(...) }}, {{ $t(...) }})
    const vueComponentCode = `
      <template>
        <div>
          <h1>{{ translationService.instant('VUE.TITLE') }}</h1>
          <p>{{ $t('VUE.SUBTITLE') }}</p>
        </div>
      </template>

      <script lang="ts">
      import { defineComponent } from 'vue'

      export default defineComponent({
        setup() {
          const cancel = translationService.translate('COMMON.CANCEL')
          return { cancel }
        }
      })
      </script>
    `
    await fs.writeFile(path.join(vueDir, 'VueView.vue'), vueComponentCode)

    // 6. Svelte Component (uses {$t('SVELTE.CARD')})
    const svelteComponentCode = `
      <script>
        import { t } from 'svelte-i18n'
      </script>

      <div class="card">
        <h2>{$t('SVELTE.CARD')}</h2>
      </div>
    `
    await fs.writeFile(path.join(svelteDir, 'SvelteCard.svelte'), svelteComponentCode)

    // 7. Unrelated Service File (pure business logic, must have 0 usages)
    const unrelatedCode = `
      export class UserService {
        getUser(id: string) {
          return this.http.get('ANGULAR.TITLE')
        }
        find(path: string) {
          return this.cache.get('REACT.WELCOME')
        }
        navigate() {
          this.router.navigate('COMMON.SAVE')
        }
      }
    `
    await fs.writeFile(path.join(servicesDir, 'user.service.ts'), unrelatedCode)

    // 8. Run Scanner on the entire realistic workspace
    const scanResult = await scanWorkspaceSourceFiles(tempWorkspace)
    expect(scanResult.error).toBeUndefined()
    expect(scanResult.totalSourceFiles).toBe(6)

    // 9. Parse and Aggregate Localization Files
    const parsedEn = parseLocalizationData('en.json', path.join(localesDir, 'en.json'), enData)
    const parsedDe = parseLocalizationData('de.json', path.join(localesDir, 'de.json'), deData)
    const aggregated = aggregateKeyUsages(scanResult.fileScanResults, [parsedEn, parsedDe])

    // 10. Verify Aggregated Results

    // Total unique keys in localization files: 4 (ANGULAR) + 2 (REACT) + 2 (VUE) + 1 (SVELTE) + 3 (COMMON) = 12 keys
    // Plus 1 code-reference missing key = 13 keys total
    expect(aggregated.totalUniqueKeys).toBe(13)

    // Verify USED keys:
    // ANGULAR.TITLE, ANGULAR.HEADER, ANGULAR.INSTANT_KEY, REACT.WELCOME, REACT.PROFILE, VUE.TITLE, VUE.SUBTITLE, SVELTE.CARD, COMMON.SAVE, COMMON.CANCEL -> 10 used keys
    expect(aggregated.usedKeysCount).toBe(10)

    const angularTitle = aggregated.items.find((i) => i.key === 'ANGULAR.TITLE')
    expect(angularTitle?.status).toBe('used')
    // Used in both home.component.ts and home.component.html -> 2 usages!
    expect(angularTitle?.usageCount).toBe(2)
    expect(angularTitle?.usages.some((u) => u.filePath.includes('home.component.ts'))).toBe(true)
    expect(angularTitle?.usages.some((u) => u.filePath.includes('home.component.html'))).toBe(true)

    const angularInstant = aggregated.items.find((i) => i.key === 'ANGULAR.INSTANT_KEY')
    expect(angularInstant?.status).toBe('used')
    expect(angularInstant?.usageCount).toBe(1)

    const reactWelcome = aggregated.items.find((i) => i.key === 'REACT.WELCOME')
    expect(reactWelcome?.status).toBe('used')
    expect(reactWelcome?.usageCount).toBe(1)

    const vueTitle = aggregated.items.find((i) => i.key === 'VUE.TITLE')
    expect(vueTitle?.status).toBe('used')
    expect(vueTitle?.usageCount).toBe(1)

    const svelteCard = aggregated.items.find((i) => i.key === 'SVELTE.CARD')
    expect(svelteCard?.status).toBe('used')
    expect(svelteCard?.usageCount).toBe(1)

    const commonSave = aggregated.items.find((i) => i.key === 'COMMON.SAVE')
    expect(commonSave?.status).toBe('used')
    // Used in ProfileView.tsx and home.component.html -> 2 usages!
    expect(commonSave?.usageCount).toBe(2)

    const commonCancel = aggregated.items.find((i) => i.key === 'COMMON.CANCEL')
    expect(commonCancel?.status).toBe('used')
    expect(commonCancel?.usageCount).toBe(1)

    // Verify UNUSED keys:
    // ANGULAR.UNUSED_KEY, COMMON.UNUSED_COMMON -> 2 unused keys
    expect(aggregated.unusedKeysCount).toBe(2)

    const angularUnused = aggregated.items.find((i) => i.key === 'ANGULAR.UNUSED_KEY')
    expect(angularUnused?.status).toBe('unused')
    expect(angularUnused?.usageCount).toBe(0)

    const commonUnused = aggregated.items.find((i) => i.key === 'COMMON.UNUSED_COMMON')
    expect(commonUnused?.status).toBe('unused')
    expect(commonUnused?.usageCount).toBe(0)

    // Verify CODE-REFERENCE MISSING keys:
    // ANGULAR.MISSING_CODE_KEY -> 1 missing key
    expect(aggregated.missingKeysCount).toBe(1)

    const missingKey = aggregated.items.find((i) => i.key === 'ANGULAR.MISSING_CODE_KEY')
    expect(missingKey?.status).toBe('missing')
    expect(missingKey?.usageCount).toBe(1)
    expect(missingKey?.presentInLanguages).toEqual([])

    // Verify DYNAMIC references:
    // 3 dynamic calls in home.component.ts
    expect(aggregated.dynamicUsagesCount).toBe(3)
    expect(aggregated.dynamicUsages[0].expression).toContain('dyn')
  })
})
