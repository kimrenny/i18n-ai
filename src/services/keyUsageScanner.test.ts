import { describe, it, expect } from 'vitest'
import {
  scanSourceFile,
  scanSourceCode,
  scanVueFile,
  scanSvelteFile,
  aggregateKeyUsages,
  isIgnoredPath,
  isSupportedSourceFile,
} from './keyUsageScanner'
import type { ParsedLocalizationFile } from '../types/localization'

describe('keyUsageScanner', () => {
  describe('Path and extension filters', () => {
    it('correctly identifies ignored directories', () => {
      expect(isIgnoredPath('node_modules/pkg/index.ts')).toBe(true)
      expect(isIgnoredPath('.git/HEAD')).toBe(true)
      expect(isIgnoredPath('dist/index.js')).toBe(true)
      expect(isIgnoredPath('dist-electron/main/index.js')).toBe(true)
      expect(isIgnoredPath('.next/server/page.js')).toBe(true)
      expect(isIgnoredPath('src/components/App.tsx')).toBe(false)
      expect(isIgnoredPath('e:/project/src/pages/Home.vue')).toBe(false)
    })

    it('correctly identifies supported source file extensions', () => {
      expect(isSupportedSourceFile('src/App.tsx')).toBe(true)
      expect(isSupportedSourceFile('src/index.ts')).toBe(true)
      expect(isSupportedSourceFile('src/utils.js')).toBe(true)
      expect(isSupportedSourceFile('src/components/Button.jsx')).toBe(true)
      expect(isSupportedSourceFile('src/main.mjs')).toBe(true)
      expect(isSupportedSourceFile('src/cli.cjs')).toBe(true)
      expect(isSupportedSourceFile('src/App.vue')).toBe(true)
      expect(isSupportedSourceFile('src/Widget.svelte')).toBe(true)

      // Excluded
      expect(isSupportedSourceFile('locales/en.json')).toBe(false)
      expect(isSupportedSourceFile('assets/logo.png')).toBe(false)
      expect(isSupportedSourceFile('node_modules/lib/index.ts')).toBe(false)
    })
  })

  describe('Direct Function Calls (t, translate, tr, localize, etc.)', () => {
    it('detects single and double quoted t() calls', () => {
      const code = `
        import React from 'react'
        import { useTranslation } from '../i18n'

        export function MyComponent() {
          const { t } = useTranslation()
          return (
            <div>
              <h1>{t('app.title')}</h1>
              <p>{t("common.welcome")}</p>
            </div>
          )
        }
      `
      const res = scanSourceCode('/path/MyComponent.tsx', 'src/MyComponent.tsx', code)
      expect(res.success).toBe(true)
      expect(res.staticUsages).toHaveLength(2)
      expect(res.staticUsages[0].key).toBe('app.title')
      expect(res.staticUsages[0].matchedExpression).toBe("t('app.title')")
      expect(res.staticUsages[0].line).toBe(9)
      expect(res.staticUsages[1].key).toBe('common.welcome')
      expect(res.staticUsages[1].matchedExpression).toBe('t("common.welcome")')
      expect(res.staticUsages[1].line).toBe(10)
      expect(res.dynamicUsages).toHaveLength(0)
    })

    it('detects direct translate(), tr(), $t(), and this.tr() calls', () => {
      const code = `
        const a = translate('header.title')
        const b = tr('header.subtitle')
        const c = $t('footer.copyright')
        const d = this.tr('common.save')
      `
      const res = scanSourceCode('/path/utils.ts', 'src/utils.ts', code)
      expect(res.success).toBe(true)
      expect(res.staticUsages).toHaveLength(4)
      expect(res.staticUsages[0].key).toBe('header.title')
      expect(res.staticUsages[1].key).toBe('header.subtitle')
      expect(res.staticUsages[2].key).toBe('footer.copyright')
      expect(res.staticUsages[3].key).toBe('common.save')
    })

    it('detects locally imported or defined translation wrappers', () => {
      const code = `
        import { translate as customTr } from './i18n'

        export function render() {
          return customTr('HOME.WELCOME')
        }
      `
      const res = scanSourceCode('/path/Home.tsx', 'src/Home.tsx', code)
      expect(res.success).toBe(true)
      expect(res.staticUsages).toHaveLength(1)
      expect(res.staticUsages[0].key).toBe('HOME.WELCOME')
    })
  })

  describe('Service / Member Calls (TranslationService, instant, translate, etc.)', () => {
    it('detects translationService.instant and translationService.translate', () => {
      const code = `
        const title = translationService.instant('HOME.TITLE')
        const desc = translationService.translate('HOME.DESCRIPTION')
      `
      const res = scanSourceCode('/path/home.ts', 'src/home.ts', code)
      expect(res.success).toBe(true)
      expect(res.staticUsages).toHaveLength(2)
      expect(res.staticUsages[0].key).toBe('HOME.TITLE')
      expect(res.staticUsages[0].matchedExpression).toBe("translationService.instant('HOME.TITLE')")
      expect(res.staticUsages[1].key).toBe('HOME.DESCRIPTION')
      expect(res.staticUsages[1].matchedExpression).toBe("translationService.translate('HOME.DESCRIPTION')")
    })

    it('detects this.translationService.instant and this.translationService.translate', () => {
      const code = `
        class Component {
          ngOnInit() {
            const title = this.translationService.instant('HOME.TITLE')
            const save = this.translationService.translate('BUTTON.SAVE')
          }
        }
      `
      const res = scanSourceCode('/path/component.ts', 'src/component.ts', code)
      expect(res.success).toBe(true)
      expect(res.staticUsages).toHaveLength(2)
      expect(res.staticUsages[0].key).toBe('HOME.TITLE')
      expect(res.staticUsages[1].key).toBe('BUTTON.SAVE')
    })

    it('detects translate.instant, this.translate.instant, and i18nService.instant', () => {
      const code = `
        const a = translate.instant('HOME.TITLE')
        const b = this.translate.instant('NAV.SETTINGS')
        const c = i18nService.instant('MODAL.CONFIRM')
        const d = this.i18nService.get('COMMON.CANCEL')
        const e = localizationService.t('USER.PROFILE')
        const f = this.localization.t('ADMIN.DASHBOARD')
      `
      const res = scanSourceCode('/path/services.ts', 'src/services.ts', code)
      expect(res.success).toBe(true)
      expect(res.staticUsages).toHaveLength(6)
      expect(res.staticUsages.map((u) => u.key)).toEqual([
        'HOME.TITLE',
        'NAV.SETTINGS',
        'MODAL.CONFIRM',
        'COMMON.CANCEL',
        'USER.PROFILE',
        'ADMIN.DASHBOARD',
      ])
    })

    it('detects class constructor dependency injection with TranslationService', () => {
      const code = `
        export class MyComponent {
          constructor(private ts: TranslationService, private i18n: I18nService) {}

          getTitle() {
            return this.ts.instant('PAGE.TITLE')
          }

          getHelp() {
            return this.i18n.get('PAGE.HELP')
          }
        }
      `
      const res = scanSourceCode('/path/MyComponent.ts', 'src/MyComponent.ts', code)
      expect(res.success).toBe(true)
      expect(res.staticUsages).toHaveLength(2)
      expect(res.staticUsages[0].key).toBe('PAGE.TITLE')
      expect(res.staticUsages[1].key).toBe('PAGE.HELP')
    })
  })

  describe('Static vs Dynamic Argument Handling', () => {
    it('resolves static template literals without substitutions as static usages', () => {
      const code = `
        const text = translationService.instant(\`STATIC.TEMPLATE.KEY\`)
        const tag = t\`STATIC.TAGGED.KEY\`
        const direct = translate(\`ANOTHER.STATIC.KEY\`)
      `
      const res = scanSourceCode('/path/test.ts', 'src/test.ts', code)
      expect(res.success).toBe(true)
      expect(res.staticUsages).toHaveLength(3)
      expect(res.staticUsages[0].key).toBe('STATIC.TEMPLATE.KEY')
      expect(res.staticUsages[1].key).toBe('STATIC.TAGGED.KEY')
      expect(res.staticUsages[2].key).toBe('ANOTHER.STATIC.KEY')
      expect(res.dynamicUsages).toHaveLength(0)
    })

    it('flags dynamic arguments and interpolated template literals as dynamic/unresolved, and resolves static constants', () => {
      const code = `
        const staticKey = 'RESOLVED.STATIC.KEY'
        const a = translationService.instant(staticKey)

        let dynamicVar = getDynamicKey()
        const b = translationService.instant(dynamicVar)
        const c = translationService.instant('prefix.' + dynamicVar)
        const d = translationService.instant(\`HOME.\${section}\`)
        const e = t(someExternalKey)
      `
      const res = scanSourceCode('/path/dynamic.ts', 'src/dynamic.ts', code)
      expect(res.success).toBe(true)
      expect(res.staticUsages).toHaveLength(1)
      expect(res.staticUsages[0].key).toBe('RESOLVED.STATIC.KEY')
      expect(res.dynamicUsages).toHaveLength(4)
      expect(res.dynamicUsages[0].expression).toBe('translationService.instant(dynamicVar)')
      expect(res.dynamicUsages[1].expression).toBe("translationService.instant('prefix.' + dynamicVar)")
      expect(res.dynamicUsages[2].expression).toBe("translationService.instant(`HOME.${section}`)")
      expect(res.dynamicUsages[3].expression).toBe('t(someExternalKey)')
    })
  })

  describe('Negative Exclusions (Unrelated Method Calls)', () => {
    it('does NOT detect unrelated methods or services as translation usages', () => {
      const code = `
        const user = userService.get('HOME.TITLE')
        const api = apiService.get('HOME.TITLE')
        const httpRes = http.get('HOME.TITLE')
        const cached = cache.get('HOME.TITLE')
        const elem = document.getElementById('HOME.TITLE')
        router.navigate('HOME.TITLE')
        logger.info('HOME.TITLE')
        console.log('HOME.TITLE')
      `
      const res = scanSourceCode('/path/other.ts', 'src/other.ts', code)
      expect(res.success).toBe(true)
      expect(res.staticUsages).toHaveLength(0)
      expect(res.dynamicUsages).toHaveLength(0)
    })
  })

  describe('Vue and Svelte Component Scanning', () => {
    it('scans Vue components for script and template translation calls', () => {
      const vueContent = `
        <template>
          <div>
            <h1>{{ translationService.instant('VUE.TITLE') }}</h1>
            <p>{{ $t('VUE.SUBTITLE') }}</p>
            <span :title="translate.instant('VUE.TOOLTIP')">Text</span>
            <input :placeholder="$t('VUE.PLACEHOLDER')" />
          </div>
        </template>

        <script lang="ts">
        import { defineComponent } from 'vue'

        export default defineComponent({
          setup() {
            const staticKey = translationService.instant('VUE.SCRIPT.KEY')
            return { staticKey }
          }
        })
        </script>

        <style scoped>
        .title { color: red; }
        </style>
      `
      const res = scanVueFile('/path/App.vue', 'src/App.vue', vueContent)
      expect(res.success).toBe(true)
      const keys = res.staticUsages.map((u) => u.key)
      expect(keys).toContain('VUE.SCRIPT.KEY')
      expect(keys).toContain('VUE.TITLE')
      expect(keys).toContain('VUE.SUBTITLE')
      expect(keys).toContain('VUE.TOOLTIP')
      expect(keys).toContain('VUE.PLACEHOLDER')
    })

    it('scans Svelte components for script and template expressions', () => {
      const svelteContent = `
        <script>
          import { t } from 'svelte-i18n'
          const scriptVal = t('SVELTE.SCRIPT.VAL')
        </script>

        <h1>{translationService.instant('SVELTE.HEADING')}</h1>
        <p>{$t('SVELTE.BODY')}</p>
      `
      const res = scanSvelteFile('/path/Widget.svelte', 'src/Widget.svelte', svelteContent)
      expect(res.success).toBe(true)
      const keys = res.staticUsages.map((u) => u.key)
      expect(keys).toContain('SVELTE.SCRIPT.VAL')
      expect(keys).toContain('SVELTE.HEADING')
      expect(keys).toContain('SVELTE.BODY')
    })
  })

  describe('Aggregation & Status Categorization', () => {
    const mockParsedFiles: ParsedLocalizationFile[] = [
      {
        filename: 'en.json',
        path: '/locales/en.json',
        raw: {},
        keyCount: 3,
        keys: {
          'app.used_key': 'Used Value',
          'app.unused_key': 'Unused Value',
          'common.save': 'Save',
        },
      },
      {
        filename: 'de.json',
        path: '/locales/de.json',
        raw: {},
        keyCount: 3,
        keys: {
          'app.used_key': 'Verwendeter Wert',
          'app.unused_key': 'Unbenutzter Wert',
          'common.save': 'Speichern',
        },
      },
    ]

    it('aggregates used, unused, missing, and dynamic counts accurately', () => {
      const fileResults = [
        {
          filePath: '/src/App.tsx',
          relativePath: 'src/App.tsx',
          success: true,
          staticUsages: [
            {
              filePath: '/src/App.tsx',
              relativePath: 'src/App.tsx',
              line: 10,
              column: 5,
              matchedExpression: "translationService.instant('app.used_key')",
              key: 'app.used_key',
            },
            {
              filePath: '/src/App.tsx',
              relativePath: 'src/App.tsx',
              line: 12,
              column: 5,
              matchedExpression: "translate('common.save')",
              key: 'common.save',
            },
            {
              filePath: '/src/App.tsx',
              relativePath: 'src/App.tsx',
              line: 15,
              column: 5,
              matchedExpression: "t('missing.in.locales')",
              key: 'missing.in.locales',
            },
          ],
          dynamicUsages: [
            {
              filePath: '/src/App.tsx',
              relativePath: 'src/App.tsx',
              line: 20,
              column: 5,
              expression: 't(dynamicKey)',
            },
          ],
        },
      ]

      const result = aggregateKeyUsages(fileResults, mockParsedFiles)

      expect(result.scannedFilesCount).toBe(1)
      expect(result.totalUniqueKeys).toBe(4) // 3 known + 1 code-reference missing
      expect(result.usedKeysCount).toBe(2) // app.used_key, common.save
      expect(result.unusedKeysCount).toBe(1) // app.unused_key
      expect(result.missingKeysCount).toBe(1) // missing.in.locales
      expect(result.dynamicUsagesCount).toBe(1)

      const usedItem = result.items.find((i) => i.key === 'app.used_key')
      expect(usedItem?.status).toBe('used')
      expect(usedItem?.usageCount).toBe(1)
      expect(usedItem?.presentInLanguages).toHaveLength(2)

      const unusedItem = result.items.find((i) => i.key === 'app.unused_key')
      expect(unusedItem?.status).toBe('unused')
      expect(unusedItem?.usageCount).toBe(0)

      const missingItem = result.items.find((i) => i.key === 'missing.in.locales')
      expect(missingItem?.status).toBe('missing')
      expect(missingItem?.usageCount).toBe(1)
      expect(missingItem?.presentInLanguages).toHaveLength(0)
    })
  })

  describe('Angular HTML Template Scanning', () => {
    it('scans Angular HTML files for pipes, bound attributes, and directives', () => {
      const htmlContent = `
        <header class="app-header">
          <h1>{{ 'HEADER.TITLE' | translate }}</h1>
          <h2>{{ "HEADER.SUBTITLE" | translate: { user: username } }}</h2>
          <span [title]="'BUTTON.TOOLTIP' | translate">Hover</span>
          <button [attr.aria-label]="'BUTTON.CLOSE' | transloco">X</button>
          <div [translate]="'DIRECTIVE.KEY'"></div>
          <p translate>TAG.CONTENT.KEY</p>
          <ng-container *transloco="let t">
            <span>{{ t('TRANSLOCO.FUNCTION.KEY') }}</span>
          </ng-container>
          <div>{{ dynamicVar | translate }}</div>
        </header>
      `
      const res = scanSourceFile('/path/header.component.html', 'src/app/header.component.html', htmlContent)
      expect(res.success).toBe(true)
      const keys = res.staticUsages.map((u) => u.key)
      expect(keys).toContain('HEADER.TITLE')
      expect(keys).toContain('HEADER.SUBTITLE')
      expect(keys).toContain('BUTTON.TOOLTIP')
      expect(keys).toContain('BUTTON.CLOSE')
      expect(keys).toContain('DIRECTIVE.KEY')
      expect(keys).toContain('TAG.CONTENT.KEY')
      expect(keys).toContain('TRANSLOCO.FUNCTION.KEY')

      expect(res.dynamicUsages.length).toBeGreaterThanOrEqual(1)
      expect(res.dynamicUsages.some((d) => d.expression.includes('dynamicVar'))).toBe(true)
    })
  })

  describe('Angular Modern inject() and Array Arguments', () => {
    it('detects keys in array arguments and Angular inject() services', () => {
      const tsContent = `
        import { Component, inject } from '@angular/core'
        import { TranslateService } from '@ngx-translate/core'

        @Component({
          selector: 'app-list',
          template: ''
        })
        export class ListComponent {
          private translate = inject(TranslateService)

          load() {
            this.translate.instant(['LIST.ITEM_1', 'LIST.ITEM_2', 'LIST.ITEM_3'])
            this.translate.get(['ASYNC.KEY_A', 'ASYNC.KEY_B'])
          }
        }
      `
      const res = scanSourceFile('/path/list.component.ts', 'src/app/list.component.ts', tsContent)
      expect(res.success).toBe(true)
      const keys = res.staticUsages.map((u) => u.key)
      expect(keys).toContain('LIST.ITEM_1')
      expect(keys).toContain('LIST.ITEM_2')
      expect(keys).toContain('LIST.ITEM_3')
      expect(keys).toContain('ASYNC.KEY_A')
      expect(keys).toContain('ASYNC.KEY_B')
    })
  })

  describe('C# / .NET / Razor Localization Scanning', () => {
    it('detects C# indexer, GetString, and Razor expressions', () => {
      const csContent = `
        namespace MyApp.Controllers
        {
          public class HomeController : Controller
          {
            private readonly IStringLocalizer<HomeController> _localizer;

            public HomeController(IStringLocalizer<HomeController> localizer)
            {
              _localizer = localizer;
            }

            public IActionResult Index()
            {
              const string WelcomeKey = "DOTNET.WELCOME";
              ViewData["Title"] = _localizer[WelcomeKey];
              ViewData["Desc"] = _localizer["DOTNET.DESC"];
              ViewData["Sub"] = _localizer.GetString("DOTNET.SUBTITLE");
              return View();
            }
          }
        }
      `
      const csRes = scanSourceFile('/path/HomeController.cs', 'Controllers/HomeController.cs', csContent)
      expect(csRes.success).toBe(true)
      const csKeys = csRes.staticUsages.map((u) => u.key)
      expect(csKeys).toContain('DOTNET.WELCOME')
      expect(csKeys).toContain('DOTNET.DESC')
      expect(csKeys).toContain('DOTNET.SUBTITLE')

      const razorContent = `
        @inject IViewLocalizer Localizer
        <h1>@Localizer["RAZOR.TITLE"]</h1>
        <p>@Localizer.GetString("RAZOR.PARAGRAPH")</p>
      `
      const razorRes = scanSourceFile('/path/Index.razor', 'Pages/Index.razor', razorContent)
      expect(razorRes.success).toBe(true)
      const razorKeys = razorRes.staticUsages.map((u) => u.key)
      expect(razorKeys).toContain('RAZOR.TITLE')
      expect(razorKeys).toContain('RAZOR.PARAGRAPH')
    })
  })

  describe('Static Value Propagation and Dynamic Key Resolution', () => {
    it('resolves alias chains, template literals, concatenation, and ternary unions', () => {
      const code = `
        // Alias chain
        const a = 'CHAIN.KEY'
        const b = a
        const c = b
        t(c)

        // Template literal construction
        const prefix = 'HEADER'
        t(\`\${prefix}.TITLE\`)

        // String concatenation
        const p = 'COMMON.'
        const s = 'SAVE'
        t(p + s)

        // Ternary finite union
        const unionKey = isEdit ? 'FORM.EDIT_TITLE' : 'FORM.CREATE_TITLE'
        t(unionKey)

        // Object property
        const config = { titleKey: 'CONFIG.TITLE' }
        t(config.titleKey)
      `
      const res = scanSourceCode('/path/propagation.ts', 'src/propagation.ts', code)
      expect(res.success).toBe(true)
      const keys = res.staticUsages.map((u) => u.key)
      expect(keys).toContain('CHAIN.KEY')
      expect(keys).toContain('HEADER.TITLE')
      expect(keys).toContain('COMMON.SAVE')
      expect(keys).toContain('FORM.EDIT_TITLE')
      expect(keys).toContain('FORM.CREATE_TITLE')
      expect(keys).toContain('CONFIG.TITLE')
    })

    it('populates possibleDynamicUsages on candidate keys for dynamic prefix calls', () => {
      const mockParsedFiles: ParsedLocalizationFile[] = [
        {
          filename: 'en.json',
          path: '/locales/en.json',
          raw: {},
          keyCount: 4,
          keys: {
            'addKey.errorEmpty': 'Key cannot be empty',
            'addKey.errorDotBoundary': 'Cannot start or end with dot',
            'addKey.errorConsecutiveDots': 'Consecutive dots not allowed',
            'addKey.errorEmptySegment': 'Cannot have empty segment',
          },
        },
      ]

      const fileResults = [
        {
          filePath: '/src/AddModal.tsx',
          relativePath: 'src/AddModal.tsx',
          success: true,
          staticUsages: [],
          dynamicUsages: [
            {
              filePath: '/src/AddModal.tsx',
              relativePath: 'src/AddModal.tsx',
              line: 177,
              column: 16,
              expression: 't(`addKey.${plan.validation.errorKey}`)',
              staticPrefix: 'addKey.',
            },
          ],
        },
      ]

      const aggregated = aggregateKeyUsages(fileResults, mockParsedFiles)

      expect(aggregated.usedKeysCount).toBe(0)
      expect(aggregated.unusedKeysCount).toBe(4)

      const emptyItem = aggregated.items.find((i) => i.key === 'addKey.errorEmpty')
      expect(emptyItem?.status).toBe('unused')
      expect(emptyItem?.possibleDynamicUsages?.length).toBe(1)
      expect(emptyItem?.possibleDynamicUsages?.[0].line).toBe(177)

      const consecutiveItem = aggregated.items.find((i) => i.key === 'addKey.errorConsecutiveDots')
      expect(consecutiveItem?.status).toBe('unused')
      expect(consecutiveItem?.possibleDynamicUsages?.length).toBe(1)
    })
  })
})
