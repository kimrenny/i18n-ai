import type {
  KeyUsageLocation,
  DynamicUsageLocation,
} from '../../../types/keyUsage'
import type { LocalizationDetector, DetectorContext, DetectorScanResult } from '../types'

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
 * Detector for C# (.cs) and ASP.NET Razor (.razor, .cshtml) localization references.
 */
export class DotNetDetector implements LocalizationDetector {
  readonly id = 'dotnet-csharp'
  readonly name = '.NET / C# / Razor Detector'
  readonly supportedExtensions = ['.cs', '.razor', '.cshtml']

  detect(context: DetectorContext): DetectorScanResult {
    const { filePath, relativePath, content } = context
    const staticUsages: KeyUsageLocation[] = []
    const dynamicUsages: DynamicUsageLocation[] = []

    // 0. Extract static constants: const string KEY = "HOME.TITLE";
    const constRegex = /\bconst\s+string\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(['"])([^'"]+)\2\s*;/g
    const constants = new Map<string, string>()
    let match: RegExpExecArray | null
    while ((match = constRegex.exec(content)) !== null) {
      constants.set(match[1], match[3].trim())
    }

    // 1. C# Indexer on Localizer:
    // _localizer["KEY"], localizer["KEY"], IStringLocalizer["KEY"], @Localizer["KEY"], _sharedLocalizer["KEY"]
    const indexerRegex =
      /(?:@?_?[a-zA-Z0-9_$]*(?:localiz|stringlocaliz|viewlocaliz|sharedlocaliz|l10n|i18n)[a-zA-Z0-9_$]*)\s*\[\s*(?:(['"])([^'"]+)\1|([a-zA-Z_$][a-zA-Z0-9_$]*))\s*\]/gi

    while ((match = indexerRegex.exec(content)) !== null) {
      const offset = match.index
      const { line, column, lineText } = getLineAndColumn(content, offset)
      const stringLitKey = match[2]?.trim()
      const identKey = match[3]?.trim()

      if (stringLitKey) {
        staticUsages.push({
          filePath,
          relativePath,
          line,
          column,
          matchedExpression: match[0].trim(),
          lineText,
          key: stringLitKey,
          detectorId: this.id,
          pattern: 'csharp-indexer:string-literal',
          confidence: 'strong',
        })
      } else if (identKey && constants.has(identKey)) {
        staticUsages.push({
          filePath,
          relativePath,
          line,
          column,
          matchedExpression: match[0].trim(),
          lineText,
          key: constants.get(identKey)!,
          detectorId: this.id,
          pattern: 'csharp-indexer:constant-indirection',
          confidence: 'strong',
        })
      } else if (identKey) {
        dynamicUsages.push({
          filePath,
          relativePath,
          line,
          column,
          expression: match[0].trim(),
          lineText,
          detectorId: this.id,
          pattern: 'csharp-indexer:dynamic',
          confidence: 'dynamic',
        })
      }
    }

    // 2. C# GetString / GetHtml Method Calls:
    // _localizer.GetString("KEY"), _localizationService.GetString("KEY"), Localizer.GetHtml("KEY")
    const methodRegex =
      /(?:@?_?[a-zA-Z0-9_$]*(?:localiz|stringlocaliz|viewlocaliz|sharedlocaliz|l10n|i18n)[a-zA-Z0-9_$]*)\s*\.\s*(?:GetString|GetHtml|Get|Translate)\s*\(\s*(?:(['"])([^'"]+)\1|([a-zA-Z_$][a-zA-Z0-9_$]*))\s*\)/gi

    while ((match = methodRegex.exec(content)) !== null) {
      const offset = match.index
      const { line, column, lineText } = getLineAndColumn(content, offset)
      const stringLitKey = match[2]?.trim()
      const identKey = match[3]?.trim()

      if (stringLitKey) {
        staticUsages.push({
          filePath,
          relativePath,
          line,
          column,
          matchedExpression: match[0].trim(),
          lineText,
          key: stringLitKey,
          detectorId: this.id,
          pattern: 'csharp-method:string-literal',
          confidence: 'strong',
        })
      } else if (identKey && constants.has(identKey)) {
        staticUsages.push({
          filePath,
          relativePath,
          line,
          column,
          matchedExpression: match[0].trim(),
          lineText,
          key: constants.get(identKey)!,
          detectorId: this.id,
          pattern: 'csharp-method:constant-indirection',
          confidence: 'strong',
        })
      } else if (identKey) {
        dynamicUsages.push({
          filePath,
          relativePath,
          line,
          column,
          expression: match[0].trim(),
          lineText,
          detectorId: this.id,
          pattern: 'csharp-method:dynamic',
          confidence: 'dynamic',
        })
      }
    }

    return { staticUsages, dynamicUsages }
  }
}
