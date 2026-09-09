import type {
  KeyUsageLocation,
  DynamicUsageLocation,
} from '../../../types/keyUsage'
import type { LocalizationDetector, DetectorContext, DetectorScanResult } from '../types'

/**
 * Known translation pipe names in Angular ecosystem.
 */
const TRANSLATION_PIPES = new Set([
  'translate',
  'transloco',
  'i18n',
  'localize',
  'l10n',
  't',
  'tr',
])

/**
 * Computes 1-indexed line and column from string character offset.
 */
function getLineAndColumn(content: string, offset: number): { line: number; column: number; lineText: string } {
  const preceding = content.substring(0, offset)
  const lines = preceding.split('\n')
  const line = lines.length
  const column = lines[lines.length - 1].length + 1

  // Extract full line text
  const lineStart = content.lastIndexOf('\n', offset - 1) + 1
  let lineEnd = content.indexOf('\n', offset)
  if (lineEnd === -1) lineEnd = content.length
  const lineText = content.substring(lineStart, lineEnd).trim()

  return { line, column, lineText }
}

/**
 * Detector for Angular HTML templates (.html, .component.html).
 * Handles translation pipes, bound attributes, directives, and transloco helpers.
 */
export class AngularHtmlDetector implements LocalizationDetector {
  readonly id = 'angular-html'
  readonly name = 'Angular HTML Template Detector'
  readonly supportedExtensions = ['.html']

  detect(context: DetectorContext): DetectorScanResult {
    const { filePath, relativePath, content } = context
    const staticUsages: KeyUsageLocation[] = []
    const dynamicUsages: DynamicUsageLocation[] = []

    // 1. Angular Interpolation and Binding Pipes:
    // Examples:
    // {{ 'HOME.TITLE' | translate }}
    // {{ "HOME.TITLE" | translate: { name: user } }}
    // [title]="'BUTTON.SAVE' | translate"
    // [attr.aria-label]="'ACCESSIBILITY.CLOSE' | transloco"
    // condition ? ('KEY_A' | translate) : ('KEY_B' | translate)
    //
    // Matches expressions like: ('KEY' | pipe) or ("KEY" | pipe) or (`KEY` | pipe) or (dynamicVar | pipe)
    const pipeRegex = /(['"`])([^'"`\r\n]+?)\1\s*\|\s*([a-zA-Z_$][a-zA-Z0-9_$]*)(?:\s*:\s*[^}\]\r\n]*)?/g
    let match: RegExpExecArray | null

    while ((match = pipeRegex.exec(content)) !== null) {
      const keyOrExpr = match[2]
      const pipeName = match[3].toLowerCase()

      if (TRANSLATION_PIPES.has(pipeName)) {
        const offset = match.index
        const { line, column, lineText } = getLineAndColumn(content, offset)
        const matchedExpression = match[0].trim()

        staticUsages.push({
          filePath,
          relativePath,
          line,
          column,
          matchedExpression,
          lineText,
          key: keyOrExpr.trim(),
          detectorId: this.id,
          pattern: `angular-pipe:${pipeName}`,
          confidence: 'strong',
        })
      }
    }

    // 2. Dynamic pipes: {{ dynamicVariable | translate }} or [title]="dynamicVariable | translate"
    // Exclude matches where the left-hand side was a string literal (already handled above)
    const dynamicPipeRegex = /([a-zA-Z_$][a-zA-Z0-9_$.?()]*)\s*\|\s*([a-zA-Z_$][a-zA-Z0-9_$]*)/g
    while ((match = dynamicPipeRegex.exec(content)) !== null) {
      const expr = match[1].trim()
      const pipeName = match[2].toLowerCase()

      if (TRANSLATION_PIPES.has(pipeName)) {
        // Ensure it is not a boolean or null or simple keyword
        if (expr && expr !== 'true' && expr !== 'false' && expr !== 'null' && expr !== 'undefined') {
          // Check if this offset was already captured as a static usage
          const offset = match.index
          const alreadyCaptured = staticUsages.some(
            (u) => Math.abs(u.line - getLineAndColumn(content, offset).line) === 0 && u.matchedExpression.includes(expr)
          )

          if (!alreadyCaptured) {
            const { line, column, lineText } = getLineAndColumn(content, offset)
            dynamicUsages.push({
              filePath,
              relativePath,
              line,
              column,
              expression: match[0].trim(),
              lineText,
              detectorId: this.id,
              pattern: `angular-dynamic-pipe:${pipeName}`,
              confidence: 'dynamic',
            })
          }
        }
      }
    }

    // 3. Translate Directives / Attribute Bindings:
    // Examples:
    // [translate]="'HOME.TITLE'" or [transloco]="'HOME.TITLE'"
    // translate="HOME.TITLE" or transloco="HOME.TITLE"
    const boundDirectiveRegex = /\[(?:translate|transloco|localize)\]\s*=\s*(['"])(?:'([^']+)'|"([^"]+)"|`([^`]+)`)\1/g
    while ((match = boundDirectiveRegex.exec(content)) !== null) {
      const key = (match[2] || match[3] || match[4] || '').trim()
      if (key) {
        const offset = match.index
        const { line, column, lineText } = getLineAndColumn(content, offset)
        staticUsages.push({
          filePath,
          relativePath,
          line,
          column,
          matchedExpression: match[0].trim(),
          lineText,
          key,
          detectorId: this.id,
          pattern: 'angular-directive:bound',
          confidence: 'strong',
        })
      }
    }

    // Static attribute: translate="HOME.TITLE"
    const staticAttrRegex = /\b(?:translate|transloco|localize)\s*=\s*(['"])([^'"]+)\1/g
    while ((match = staticAttrRegex.exec(content)) !== null) {
      const fullMatch = match[0]
      // Make sure it wasn't [translate]="..."
      const matchIndex = match.index
      if (matchIndex > 0 && content[matchIndex - 1] === '[') {
        continue
      }
      const key = match[2].trim()
      if (key && !key.includes('{{') && !key.includes('|')) {
        const { line, column, lineText } = getLineAndColumn(content, matchIndex)
        staticUsages.push({
          filePath,
          relativePath,
          line,
          column,
          matchedExpression: fullMatch.trim(),
          lineText,
          key,
          detectorId: this.id,
          pattern: 'angular-directive:static-attr',
          confidence: 'strong',
        })
      }
    }

    // Tag body translate directive on leaf tags: <span translate>HOME.TITLE</span> or <p translate>HOME.TITLE</p>
    const tagBodyRegex = /<([a-zA-Z0-9_-]+)\b([^>]*)>([^<]+)<\/\1>/gi
    while ((match = tagBodyRegex.exec(content)) !== null) {
      const tagAttrs = match[2]
      const innerText = match[3].trim()

      // Ensure 'translate' is a standalone attribute (e.g. <span translate>, <p class="lead" translate>),
      // and NOT part of an attribute value like [attr.aria-label]="'KEY' | translate"
      const hasStandaloneTranslateAttr = /(?:^|\s)translate(?:\s|>|$)/i.test(tagAttrs)

      if (
        hasStandaloneTranslateAttr &&
        innerText &&
        !innerText.includes('<') &&
        !innerText.includes('{{') &&
        !innerText.includes('\n')
      ) {
        const offset = match.index
        const { line, column, lineText } = getLineAndColumn(content, offset)
        staticUsages.push({
          filePath,
          relativePath,
          line,
          column,
          matchedExpression: match[0].trim(),
          lineText,
          key: innerText,
          detectorId: this.id,
          pattern: 'angular-directive:tag-content',
          confidence: 'strong',
        })
      }
    }

    // Transloco function calls inside template: {{ t('KEY') }} or {{ t("KEY") }}
    const templateCallRegex = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(\s*(['"])([^'"]+)\2\s*\)/g
    while ((match = templateCallRegex.exec(content)) !== null) {
      const fnName = match[1].toLowerCase()
      if (fnName === 't' || fnName === '$t' || fnName === 'translate' || fnName === 'localize') {
        const key = match[3].trim()
        if (key) {
          const offset = match.index
          const { line, column, lineText } = getLineAndColumn(content, offset)
          staticUsages.push({
            filePath,
            relativePath,
            line,
            column,
            matchedExpression: match[0].trim(),
            lineText,
            key,
            detectorId: this.id,
            pattern: `angular-template-call:${fnName}`,
            confidence: 'strong',
          })
        }
      }
    }

    return { staticUsages, dynamicUsages }
  }
}
