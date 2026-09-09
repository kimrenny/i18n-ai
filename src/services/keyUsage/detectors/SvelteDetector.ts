import type {
  KeyUsageLocation,
  DynamicUsageLocation,
} from '../../../types/keyUsage'
import type { LocalizationDetector, DetectorContext, DetectorScanResult } from '../types'
import { TypeScriptAstDetector } from './TypeScriptAstDetector'

/**
 * Detector for Svelte components (.svelte).
 */
export class SvelteDetector implements LocalizationDetector {
  readonly id = 'svelte'
  readonly name = 'Svelte Component Detector'
  readonly supportedExtensions = ['.svelte']

  private tsDetector = new TypeScriptAstDetector()

  detect(context: DetectorContext): DetectorScanResult {
    const { filePath, relativePath, content } = context
    const staticUsages: KeyUsageLocation[] = []
    const dynamicUsages: DynamicUsageLocation[] = []
    const lines = content.split('\n')

    // 1. Scan <script> blocks
    const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi
    let match: RegExpExecArray | null
    const scriptRanges: Array<{ startLine: number; endLine: number }> = []

    while ((match = scriptRegex.exec(content)) !== null) {
      const scriptCode = match[1]
      const scriptOffset = match.index + match[0].indexOf(scriptCode)
      const startLine = content.substring(0, scriptOffset).split('\n').length
      const endLine = content.substring(0, scriptOffset + scriptCode.length).split('\n').length
      scriptRanges.push({ startLine, endLine })

      const lineOffset = startLine - 1
      const res = this.tsDetector.detect({
        filePath,
        relativePath,
        content: scriptCode,
      })

      for (const u of res.staticUsages) {
        staticUsages.push({
          ...u,
          line: u.line + lineOffset,
          lineText: lines[u.line + lineOffset - 1]?.trim() || u.lineText,
          detectorId: this.id,
          pattern: `svelte-script:${u.pattern || 'ts'}`,
        })
      }
      for (const d of res.dynamicUsages) {
        dynamicUsages.push({
          ...d,
          line: d.line + lineOffset,
          lineText: lines[d.line + lineOffset - 1]?.trim() || d.lineText,
          detectorId: this.id,
          pattern: `svelte-script:${d.pattern || 'dynamic'}`,
        })
      }
    }

    const isInsideScript = (lineNum: number) =>
      scriptRanges.some((r) => lineNum >= r.startLine && lineNum <= r.endLine)

    // 2. Scan Svelte Template expressions: {expr}
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const lineNum = lineIdx + 1
      if (isInsideScript(lineNum)) continue
      const lineText = lines[lineIdx]
      if (lineText.includes('<script') || lineText.includes('<style')) continue

      const svelteExprRegex = /\{([^}]+)\}/g
      let exprMatch: RegExpExecArray | null
      while ((exprMatch = svelteExprRegex.exec(lineText)) !== null) {
        const rawExpr = exprMatch[1].trim()
        if (
          rawExpr &&
          !rawExpr.startsWith('#') &&
          !rawExpr.startsWith('/') &&
          !rawExpr.startsWith(':') &&
          !rawExpr.startsWith('@')
        ) {
          // Check for {$t('KEY')} or {$_('KEY')}
          const dollarMatch = /^(\$t|\$_)\s*\(\s*(['"])([^'"]+)\2\s*\)$/.exec(rawExpr)
          if (dollarMatch) {
            staticUsages.push({
              filePath,
              relativePath,
              line: lineNum,
              column: exprMatch.index + 1,
              matchedExpression: exprMatch[0].trim(),
              lineText: lineText.trim(),
              key: dollarMatch[3].trim(),
              detectorId: this.id,
              pattern: `svelte-template:${dollarMatch[1]}`,
              confidence: 'strong',
            })
          } else {
            const res = this.tsDetector.detect({
              filePath,
              relativePath,
              content: rawExpr,
            })
            for (const u of res.staticUsages) {
              staticUsages.push({
                ...u,
                line: lineNum,
                lineText: lineText.trim(),
                detectorId: this.id,
                pattern: `svelte-template:${u.pattern || 'ts'}`,
              })
            }
            for (const d of res.dynamicUsages) {
              dynamicUsages.push({
                ...d,
                line: lineNum,
                lineText: lineText.trim(),
                detectorId: this.id,
                pattern: `svelte-template:${d.pattern || 'dynamic'}`,
              })
            }
          }
        }
      }
    }

    return { staticUsages, dynamicUsages }
  }
}
