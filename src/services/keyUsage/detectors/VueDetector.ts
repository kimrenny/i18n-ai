import type {
  KeyUsageLocation,
  DynamicUsageLocation,
} from '../../../types/keyUsage'
import type { LocalizationDetector, DetectorContext, DetectorScanResult } from '../types'
import { TypeScriptAstDetector } from './TypeScriptAstDetector'

/**
 * Computes 1-indexed line and column from string character offset.
 */
function getLineAndColumn(content: string, offset: number): { line: number; column: number; lineText: string } {
  const preceding = content.substring(0, offset)
  const lines = preceding.split('\n')
  const line = lines.length
  const column = lines[lines.length - 1].length + 1

  const lineStart = content.lastIndexOf('\n', offset - 1) + 1
  let lineEnd = content.indexOf('\n', offset)
  if (lineEnd === -1) lineEnd = content.length
  const lineText = content.substring(lineStart, lineEnd).trim()

  return { line, column, lineText }
}

/**
 * Detector for Vue Single File Components (.vue).
 */
export class VueDetector implements LocalizationDetector {
  readonly id = 'vue-sfc'
  readonly name = 'Vue SFC Detector'
  readonly supportedExtensions = ['.vue']

  private tsDetector = new TypeScriptAstDetector()

  detect(context: DetectorContext): DetectorScanResult {
    const { filePath, relativePath, content } = context
    const staticUsages: KeyUsageLocation[] = []
    const dynamicUsages: DynamicUsageLocation[] = []
    const lines = content.split('\n')

    // 1. Scan <script> and <script setup> blocks using TypeScriptAstDetector
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
          pattern: `vue-script:${u.pattern || 'ts'}`,
        })
      }
      for (const d of res.dynamicUsages) {
        dynamicUsages.push({
          ...d,
          line: d.line + lineOffset,
          lineText: lines[d.line + lineOffset - 1]?.trim() || d.lineText,
          detectorId: this.id,
          pattern: `vue-script:${d.pattern || 'dynamic'}`,
        })
      }
    }

    const isInsideScript = (lineNum: number) =>
      scriptRanges.some((r) => lineNum >= r.startLine && lineNum <= r.endLine)

    // 2. Scan Vue template expressions: {{ expr }}, :attr="expr", v-bind:attr="expr"
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const lineNum = lineIdx + 1
      if (isInsideScript(lineNum)) continue
      const lineText = lines[lineIdx]
      if (lineText.includes('<script') || lineText.includes('<style')) continue

      // A. Interpolations: {{ expr }}
      const interpolationRegex = /\{\{([\s\S]*?)\}\}/g
      let intMatch: RegExpExecArray | null
      while ((intMatch = interpolationRegex.exec(lineText)) !== null) {
        const expr = intMatch[1].trim()
        if (expr) {
          const res = this.tsDetector.detect({
            filePath,
            relativePath,
            content: expr,
          })
          for (const u of res.staticUsages) {
            staticUsages.push({
              ...u,
              line: lineNum,
              lineText: lineText.trim(),
              detectorId: this.id,
              pattern: `vue-template:${u.pattern || 'ts'}`,
            })
          }
          for (const d of res.dynamicUsages) {
            dynamicUsages.push({
              ...d,
              line: lineNum,
              lineText: lineText.trim(),
              detectorId: this.id,
              pattern: `vue-template:${d.pattern || 'dynamic'}`,
            })
          }
        }
      }

      // B. Bound attributes: :attr="expr" or v-bind:attr="expr"
      const boundAttrRegex = /(?::[a-zA-Z0-9_-]+|v-bind:[a-zA-Z0-9_-]+)="([^"]+)"/g
      let attrMatch: RegExpExecArray | null
      while ((attrMatch = boundAttrRegex.exec(lineText)) !== null) {
        const expr = attrMatch[1].trim()
        if (expr) {
          const res = this.tsDetector.detect({
            filePath,
            relativePath,
            content: expr,
          })
          for (const u of res.staticUsages) {
            staticUsages.push({
              ...u,
              line: lineNum,
              lineText: lineText.trim(),
              detectorId: this.id,
              pattern: `vue-template-bind:${u.pattern || 'ts'}`,
            })
          }
          for (const d of res.dynamicUsages) {
            dynamicUsages.push({
              ...d,
              line: lineNum,
              lineText: lineText.trim(),
              detectorId: this.id,
              pattern: `vue-template-bind:${d.pattern || 'dynamic'}`,
            })
          }
        }
      }
    }

    // 3. Vue directive: v-t="'KEY'" or v-t="`KEY`"
    const vtRegex = /v-t\s*=\s*(['"])(?:'([^']+)'|"([^"]+)"|`([^`]+)`)\1/g
    while ((match = vtRegex.exec(content)) !== null) {
      const key = (match[2] || match[3] || match[4] || '').trim()
      if (key) {
        const offset = match.index
        const { line, column, lineText } = getLineAndColumn(content, offset)
        if (!isInsideScript(line)) {
          staticUsages.push({
            filePath,
            relativePath,
            line,
            column,
            matchedExpression: match[0].trim(),
            lineText,
            key,
            detectorId: this.id,
            pattern: 'vue-directive:v-t',
            confidence: 'strong',
          })
        }
      }
    }

    return { staticUsages, dynamicUsages }
  }
}
