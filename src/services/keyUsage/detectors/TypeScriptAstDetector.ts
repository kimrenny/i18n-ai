import ts from 'typescript'
import type {
  KeyUsageLocation,
  DynamicUsageLocation,
} from '../../../types/keyUsage'
import type { LocalizationDetector, DetectorContext, DetectorScanResult, StaticConstantsMap } from '../types'
import { StaticValuePropagator } from '../staticValuePropagator'

export type { StaticConstantsMap }

/**
 * Direct standalone localization function names.
 */
const DIRECT_LOCALIZATION_FUNCTIONS = new Set([
  't',
  '$t',
  '$tc',
  '$t18n',
  'translate',
  '$translate',
  'tr',
  '$tr',
  'localize',
  '$localize',
  'i18n',
  '_t',
  '__',
  'l10n',
])

/**
 * Strong method names that almost exclusively exist on localization services
 * (e.g. `translate.instant(...)`, `service.instant(...)`, `transloco.selectTranslate(...)`).
 */
const STRONG_LOCALIZATION_METHODS = new Set([
  'instant',
  'selectTranslate',
  'formatMessage',
])

/**
 * Contextual method names that perform localization when invoked on a localization-like receiver
 * (e.g. `translateService.get(...)`, `i18n.translate(...)`, `localization.t(...)`).
 */
const CONTEXTUAL_LOCALIZATION_METHODS = new Set([
  't',
  '$t',
  'tr',
  '$tr',
  'translate',
  '$translate',
  'localize',
  '$localize',
  'instant',
  'get',
  'getAsync',
  'stream',
  'select',
  'raw',
  'lookup',
  'has',
])

/**
 * Regex matching names indicative of localization services, tokens, or types.
 */
const LOCALIZATION_RECEIVER_REGEX =
  /(?:^|[_$a-z0-9])(?:translat|i18n|localiz|locale|intl|l10n|transloco)(?:$|[_$A-Za-z0-9])/i

/**
 * Excluded receiver patterns to prevent false positives on generic methods like `.get()`
 * (e.g. `userService.get(...)`, `apiService.get(...)`, `router.navigate(...)`, `logger.info(...)`).
 */
const EXCLUDED_RECEIVER_PREFIXES =
  /^(?:user|account|auth|api|http|axios|fetch|router|route|navigation|cache|store|state|storage|db|database|fs|file|dom|document|window|element|node|event|logger|log|console|date|time|math|array|string|object|map|set|promise|location|config)/i

export function isLocalizationReceiverName(name: string): boolean {
  if (!name) return false
  const lower = name.toLowerCase()

  // If it starts with an excluded prefix (e.g. 'userService', 'apiService', 'locationService'),
  // only treat as localization if it explicitly mentions translation/i18n/transloco/localiz
  if (EXCLUDED_RECEIVER_PREFIXES.test(lower)) {
    if (
      !lower.includes('translat') &&
      !lower.includes('i18n') &&
      !lower.includes('localiz') &&
      !lower.includes('transloco')
    ) {
      return false
    }
  }

  return (
    LOCALIZATION_RECEIVER_REGEX.test(name) ||
    lower === 'ctx' ||
    lower === 'this' ||
    lower === 'loc' ||
    lower === 'i18n'
  )
}

export interface FileScopeContext {
  localLocalizationCallables: Set<string>
  localLocalizationServices: Set<string>
  constants: StaticConstantsMap
}

export function createEmptyStaticConstantsMap(): StaticConstantsMap {
  return {
    strings: new Map(),
    arrays: new Map(),
    objects: new Map(),
    propertyValues: new Map(),
  }
}

export function mergeStaticConstants(target: StaticConstantsMap, source: StaticConstantsMap): void {
  for (const [k, v] of source.strings) target.strings.set(k, v)
  for (const [k, v] of source.arrays) target.arrays.set(k, v)
  for (const [k, v] of source.objects) target.objects.set(k, v)
  for (const [k, v] of source.propertyValues) {
    const existing = target.propertyValues.get(k) || []
    for (const item of v) {
      if (!existing.includes(item)) existing.push(item)
    }
    target.propertyValues.set(k, existing)
  }
}

/**
 * Scans a TypeScript AST source file to collect imports, hooks, constructor injections,
 * inject() calls, statically declared constants, and object property value mappings.
 */
export function collectFileScopeContext(sourceFile: ts.SourceFile): FileScopeContext {
  const localLocalizationCallables = new Set<string>()
  const localLocalizationServices = new Set<string>()
  const constants: StaticConstantsMap = {
    strings: new Map(),
    arrays: new Map(),
    objects: new Map(),
    propertyValues: new Map(),
  }

  function registerPropertyValue(propName: string, val: string) {
    if (!propName || !val) return
    const list = constants.propertyValues.get(propName) || []
    if (!list.includes(val)) {
      list.push(val)
      constants.propertyValues.set(propName, list)
    }
  }

  function inspectNode(node: ts.Node) {
    // 1. Imports from i18n packages
    if (ts.isImportDeclaration(node)) {
      const moduleSpecifier = ts.isStringLiteral(node.moduleSpecifier)
        ? node.moduleSpecifier.text.toLowerCase()
        : ''
      const isI18nModule =
        moduleSpecifier.includes('i18n') ||
        moduleSpecifier.includes('translat') ||
        moduleSpecifier.includes('transloco') ||
        moduleSpecifier.includes('localiz') ||
        moduleSpecifier.includes('locale') ||
        moduleSpecifier.includes('intl') ||
        moduleSpecifier.includes('l10n')

      if (isI18nModule && node.importClause) {
        if (node.importClause.name) {
          const name = node.importClause.name.text
          localLocalizationServices.add(name)
          if (DIRECT_LOCALIZATION_FUNCTIONS.has(name.toLowerCase())) {
            localLocalizationCallables.add(name)
          }
        }
        if (node.importClause.namedBindings) {
          if (ts.isNamedImports(node.importClause.namedBindings)) {
            for (const elem of node.importClause.namedBindings.elements) {
              const importedName = elem.propertyName ? elem.propertyName.text : elem.name.text
              const localName = elem.name.text
              if (
                DIRECT_LOCALIZATION_FUNCTIONS.has(importedName.toLowerCase()) ||
                importedName.toLowerCase().startsWith('use') ||
                importedName.toLowerCase().includes('translat') ||
                importedName.toLowerCase().includes('i18n') ||
                importedName.toLowerCase().includes('transloco')
              ) {
                localLocalizationCallables.add(localName)
                localLocalizationServices.add(localName)
              }
            }
          } else if (ts.isNamespaceImport(node.importClause.namedBindings)) {
            localLocalizationServices.add(node.importClause.namedBindings.name.text)
          }
        }
      }
    }

    // Property assignment helper: obj.prop = 'val' or { errorKey: 'errorEmpty' }
    if (ts.isPropertyAssignment(node)) {
      let propName = ''
      if (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) {
        propName = node.name.text
      }
      if (propName) {
        const currentCtx: FileScopeContext = {
          localLocalizationCallables,
          localLocalizationServices,
          constants,
        }
        const evalRes = StaticValuePropagator.evaluate(node.initializer, currentCtx)
        if (evalRes.type === 'static') {
          for (const v of evalRes.values) {
            registerPropertyValue(propName, v)
          }
        }
      }
    }

    // 2. Variable declarations: hooks, inject(), and static constants
    if (ts.isVariableDeclaration(node) && node.initializer) {
      let initExpr = node.initializer
      while (
        ts.isAsExpression(initExpr) ||
        ts.isTypeAssertionExpression(initExpr) ||
        ts.isParenthesizedExpression(initExpr)
      ) {
        initExpr = initExpr.expression
      }

      if (ts.isIdentifier(node.name)) {
        const varName = node.name.text
        const currentCtx: FileScopeContext = {
          localLocalizationCallables,
          localLocalizationServices,
          constants,
        }

        const evalRes = StaticValuePropagator.evaluate(initExpr, currentCtx)
        if (evalRes.type === 'static' && evalRes.values.length > 0) {
          if (evalRes.values.length === 1) {
            constants.strings.set(varName, evalRes.values[0])
          } else {
            constants.arrays.set(varName, evalRes.values)
          }
        } else if (ts.isObjectLiteralExpression(initExpr)) {
          // const KEYS = { Title: 'HOME.TITLE', Subtitle: 'HOME.SUBTITLE' }
          const map = new Map<string, string>()
          for (const prop of initExpr.properties) {
            if (ts.isPropertyAssignment(prop)) {
              let propKey = ''
              if (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) {
                propKey = prop.name.text
              }
              if (propKey) {
                const propEval = StaticValuePropagator.evaluate(prop.initializer, currentCtx)
                if (propEval.type === 'static' && propEval.values.length === 1) {
                  map.set(propKey, propEval.values[0])
                  registerPropertyValue(propKey, propEval.values[0])
                }
              }
            }
          }
          if (map.size > 0) {
            constants.objects.set(varName, map)
          }
        } else if (ts.isArrayLiteralExpression(initExpr)) {
          // const PROVIDERS = [ { id: 'gemini' }, { id: 'openai' } ]
          for (const el of initExpr.elements) {
            let unwrappedEl = el
            while (
              ts.isAsExpression(unwrappedEl) ||
              ts.isTypeAssertionExpression(unwrappedEl) ||
              ts.isParenthesizedExpression(unwrappedEl)
            ) {
              unwrappedEl = unwrappedEl.expression
            }
            if (ts.isObjectLiteralExpression(unwrappedEl)) {
              for (const prop of unwrappedEl.properties) {
                if (ts.isPropertyAssignment(prop)) {
                  let propKey = ''
                  if (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) {
                    propKey = prop.name.text
                  }
                  if (propKey) {
                    const propEval = StaticValuePropagator.evaluate(prop.initializer, currentCtx)
                    if (propEval.type === 'static') {
                      for (const v of propEval.values) {
                        registerPropertyValue(propKey, v)
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }

      // B. Function calls in initializer (hooks, inject())
      if (ts.isCallExpression(initExpr)) {
        const initCall = initExpr
        let calleeName = ''
        if (ts.isIdentifier(initCall.expression)) {
          calleeName = initCall.expression.text.toLowerCase()
        } else if (ts.isPropertyAccessExpression(initCall.expression)) {
          calleeName = initCall.expression.name.text.toLowerCase()
        }

        // Angular 14+ inject(TranslateService)
        if (calleeName === 'inject' && initCall.arguments.length > 0) {
          const arg0 = initCall.arguments[0]
          let tokenName = ''
          if (ts.isIdentifier(arg0)) {
            tokenName = arg0.text
          }
          if (isLocalizationReceiverName(tokenName)) {
            if (ts.isIdentifier(node.name)) {
              localLocalizationServices.add(node.name.text)
            }
          }
        }

        // React / Vue / Svelte Hook: const { t } = useTranslation() or const t = useTranslations()
        const isHookLike =
          calleeName.startsWith('use') &&
          (calleeName.includes('translat') ||
            calleeName.includes('i18n') ||
            calleeName.includes('locale') ||
            calleeName.includes('intl') ||
            calleeName.includes('transloco') ||
            calleeName.includes('l10n'))

        if (isHookLike) {
          if (ts.isObjectBindingPattern(node.name)) {
            for (const elem of node.name.elements) {
              if (ts.isIdentifier(elem.name)) {
                localLocalizationCallables.add(elem.name.text)
              }
            }
          } else if (ts.isIdentifier(node.name)) {
            localLocalizationCallables.add(node.name.text)
            localLocalizationServices.add(node.name.text)
          }
        }
      }
    }

    // 3. Angular Constructor Injection: constructor(private translate: TranslateService, ...)
    if (ts.isParameter(node) && ts.isIdentifier(node.name)) {
      const paramName = node.name.text
      let typeName = ''
      if (node.type && ts.isTypeReferenceNode(node.type)) {
        if (ts.isIdentifier(node.type.typeName)) {
          typeName = node.type.typeName.text
        }
      }

      if (isLocalizationReceiverName(paramName) || isLocalizationReceiverName(typeName)) {
        localLocalizationServices.add(paramName)
      }
    }

    // 4. Class Property Declaration: private translate = inject(TranslateService) or private i18nService: I18nService
    if (ts.isPropertyDeclaration(node) && ts.isIdentifier(node.name)) {
      const propName = node.name.text
      let typeName = ''
      if (node.type && ts.isTypeReferenceNode(node.type) && ts.isIdentifier(node.type.typeName)) {
        typeName = node.type.typeName.text
      }

      if (isLocalizationReceiverName(propName) || isLocalizationReceiverName(typeName)) {
        localLocalizationServices.add(propName)
      }

      // Check initializer for inject(TranslateService)
      if (node.initializer && ts.isCallExpression(node.initializer)) {
        const initCall = node.initializer
        if (ts.isIdentifier(initCall.expression) && initCall.expression.text.toLowerCase() === 'inject') {
          if (initCall.arguments.length > 0 && ts.isIdentifier(initCall.arguments[0])) {
            const token = initCall.arguments[0].text
            if (isLocalizationReceiverName(token)) {
              localLocalizationServices.add(propName)
            }
          }
        }
      }
    }

    ts.forEachChild(node, inspectNode)
  }

  inspectNode(sourceFile)
  return { localLocalizationCallables, localLocalizationServices, constants }
}

/**
 * Checks whether a call expression is a candidate localization target.
 */
export function isLocalizationCallTarget(
  node: ts.LeftHandSideExpression,
  context?: FileScopeContext
): boolean {
  // 1. Standalone function call: t('...'), translate('...'), etc.
  if (ts.isIdentifier(node)) {
    const name = node.text
    if (DIRECT_LOCALIZATION_FUNCTIONS.has(name.toLowerCase())) {
      return true
    }
    if (context?.localLocalizationCallables.has(name)) {
      return true
    }
    return false
  }

  // 2. Member call: this.translate.instant('...'), service.get('...'), etc.
  if (ts.isPropertyAccessExpression(node)) {
    const methodName = node.name.text
    const methodLower = methodName.toLowerCase()

    // Strong localization method name (e.g. .instant, .selectTranslate, .formatMessage)
    if (STRONG_LOCALIZATION_METHODS.has(methodName) || STRONG_LOCALIZATION_METHODS.has(methodLower)) {
      return true
    }

    const receiver = node.expression

    // this.t('...'), this.instant('...'), this.translate('...')
    if (receiver.kind === ts.SyntaxKind.ThisKeyword) {
      if (
        DIRECT_LOCALIZATION_FUNCTIONS.has(methodLower) ||
        STRONG_LOCALIZATION_METHODS.has(methodName) ||
        methodLower === 'instant' ||
        methodLower === 'translate'
      ) {
        return true
      }
      return false
    }

    // this.receiver.method('...')
    if (ts.isPropertyAccessExpression(receiver) && receiver.expression.kind === ts.SyntaxKind.ThisKeyword) {
      const receiverProp = receiver.name.text
      const isKnown =
        context?.localLocalizationServices.has(receiverProp) ||
        isLocalizationReceiverName(receiverProp)

      if (isKnown && CONTEXTUAL_LOCALIZATION_METHODS.has(methodLower)) {
        return true
      }
      return false
    }

    // receiver.method('...')
    if (ts.isIdentifier(receiver)) {
      const receiverName = receiver.text
      const isKnown =
        context?.localLocalizationServices.has(receiverName) ||
        isLocalizationReceiverName(receiverName)

      if (isKnown && CONTEXTUAL_LOCALIZATION_METHODS.has(methodLower)) {
        return true
      }
      return false
    }
  }

  return false
}

type ExtractedKeys =
  | {
      type: 'static'
      keys: string[]
      pattern: string
      resolutionType: 'direct-static' | 'constant' | 'array' | 'template-resolved' | 'object-property' | 'union-resolved'
    }
  | {
      type: 'dynamic'
      expression: string
      pattern: string
      staticPrefix?: string
      staticSuffix?: string
    }
  | null

/**
 * Extracts static key(s) or dynamic expression from a call argument,
 * resolving static constants and expressions where available.
 */
function extractKeysFromCall(
  node: ts.CallExpression,
  context?: FileScopeContext
): ExtractedKeys {
  if (node.arguments.length === 0) return null
  const arg0 = node.arguments[0]

  // Direct string literal check for fast path
  if (ts.isStringLiteral(arg0) || ts.isNoSubstitutionTemplateLiteral(arg0)) {
    const key = arg0.text.trim()
    return key
      ? { type: 'static', keys: [key], pattern: 'string-literal', resolutionType: 'direct-static' }
      : null
  }

  // Evaluate argument with StaticValuePropagator
  const evalRes = StaticValuePropagator.evaluate(arg0, context)
  if (evalRes.type === 'static' && evalRes.values.length > 0) {
    return {
      type: 'static',
      keys: evalRes.values,
      pattern: evalRes.resolutionType,
      resolutionType: evalRes.resolutionType,
    }
  }

  return {
    type: 'dynamic',
    expression: arg0.getText(),
    pattern: 'dynamic-call',
    staticPrefix: evalRes.type === 'dynamic' ? evalRes.staticPrefix : undefined,
    staticSuffix: evalRes.type === 'dynamic' ? evalRes.staticSuffix : undefined,
  }
}

/**
 * TypeScript / JavaScript AST Localization Detector.
 */
export class TypeScriptAstDetector implements LocalizationDetector {
  readonly id = 'typescript-ast'
  readonly name = 'TypeScript / JavaScript AST Detector'
  readonly supportedExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']

  detect(context: DetectorContext): DetectorScanResult {
    const { filePath, relativePath, content: code } = context
    const staticUsages: KeyUsageLocation[] = []
    const dynamicUsages: DynamicUsageLocation[] = []

    const lower = filePath.toLowerCase()
    let scriptKind = ts.ScriptKind.TS
    if (lower.endsWith('.tsx')) scriptKind = ts.ScriptKind.TSX
    else if (lower.endsWith('.jsx')) scriptKind = ts.ScriptKind.JSX
    else if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) {
      scriptKind = ts.ScriptKind.JS
    }

    let sourceFile: ts.SourceFile
    try {
      sourceFile = ts.createSourceFile(
        relativePath,
        code,
        ts.ScriptTarget.Latest,
        true,
        scriptKind
      )
    } catch {
      return { staticUsages: [], dynamicUsages: [] }
    }

    const lines = code.split('\n')
    const scopeContext = collectFileScopeContext(sourceFile)
    if (context.workspaceConstants) {
      mergeStaticConstants(scopeContext.constants, context.workspaceConstants)
    }

    function visit(node: ts.Node) {
      // 1. Call Expressions: t('key'), this.translate.instant('key'), translate.get(['a', 'b'])
      if (ts.isCallExpression(node)) {
        if (isLocalizationCallTarget(node.expression, scopeContext)) {
          const extracted = extractKeysFromCall(node, scopeContext)
          if (extracted) {
            const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart())
            const lineText = lines[line]?.trim() || ''

            if (extracted.type === 'static') {
              for (const k of extracted.keys) {
                staticUsages.push({
                  filePath,
                  relativePath,
                  line: line + 1,
                  column: character + 1,
                  matchedExpression: node.getText(sourceFile),
                  lineText,
                  key: k,
                  detectorId: 'typescript-ast',
                  pattern: `ts-call:${extracted.pattern}`,
                  confidence: extracted.resolutionType === 'direct-static' ? 'strong' : 'medium',
                  resolutionType: extracted.resolutionType,
                })
              }
            } else {
              dynamicUsages.push({
                filePath,
                relativePath,
                line: line + 1,
                column: character + 1,
                expression: node.getText(sourceFile),
                lineText,
                detectorId: 'typescript-ast',
                pattern: `ts-dynamic:${extracted.pattern}`,
                confidence: 'dynamic',
                staticPrefix: extracted.staticPrefix,
              })
            }
          }
        }
      }

      // 2. Tagged Template Expressions: t`key`
      if (ts.isTaggedTemplateExpression(node)) {
        if (isLocalizationCallTarget(node.tag, scopeContext)) {
          const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart())
          const lineText = lines[line]?.trim() || ''

          if (ts.isNoSubstitutionTemplateLiteral(node.template)) {
            const keyValue = node.template.text.trim()
            if (keyValue) {
              staticUsages.push({
                filePath,
                relativePath,
                line: line + 1,
                column: character + 1,
                matchedExpression: node.getText(sourceFile),
                lineText,
                key: keyValue,
                detectorId: 'typescript-ast',
                pattern: 'ts-tagged-template',
                confidence: 'strong',
              })
            }
          } else {
            dynamicUsages.push({
              filePath,
              relativePath,
              line: line + 1,
              column: character + 1,
              expression: node.getText(sourceFile),
              lineText,
              detectorId: 'typescript-ast',
              pattern: 'ts-dynamic-template',
              confidence: 'dynamic',
            })
          }
        }
      }

      // 3. React JSX Elements: <FormattedMessage id="KEY" /> or <Trans i18nKey="KEY" />
      if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
        let tagName = ''
        if (ts.isIdentifier(node.tagName)) {
          tagName = node.tagName.text
        }

        if (tagName === 'FormattedMessage' || tagName === 'Trans' || tagName === 'Translate') {
          for (const attr of node.attributes.properties) {
            if (ts.isJsxAttribute(attr) && ts.isIdentifier(attr.name)) {
              const attrName = attr.name.text
              if (
                (tagName === 'FormattedMessage' && attrName === 'id') ||
                ((tagName === 'Trans' || tagName === 'Translate') && (attrName === 'i18nKey' || attrName === 'key'))
              ) {
                if (attr.initializer) {
                  let key = ''
                  if (ts.isStringLiteral(attr.initializer)) {
                    key = attr.initializer.text.trim()
                  } else if (
                    ts.isJsxExpression(attr.initializer) &&
                    attr.initializer.expression &&
                    ts.isStringLiteral(attr.initializer.expression)
                  ) {
                    key = attr.initializer.expression.text.trim()
                  }

                  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart())
                  const lineText = lines[line]?.trim() || ''

                  if (key) {
                    staticUsages.push({
                      filePath,
                      relativePath,
                      line: line + 1,
                      column: character + 1,
                      matchedExpression: node.getText(sourceFile),
                      lineText,
                      key,
                      detectorId: 'typescript-ast',
                      pattern: `jsx-element:${tagName}`,
                      confidence: 'strong',
                    })
                  } else if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
                    dynamicUsages.push({
                      filePath,
                      relativePath,
                      line: line + 1,
                      column: character + 1,
                      expression: node.getText(sourceFile),
                      lineText,
                      detectorId: 'typescript-ast',
                      pattern: `jsx-dynamic:${tagName}`,
                      confidence: 'dynamic',
                    })
                  }
                }
              }
            }
          }
        }
      }

      ts.forEachChild(node, visit)
    }

    try {
      visit(sourceFile)
    } catch {
      // Ignored
    }

    return { staticUsages, dynamicUsages }
  }
}
