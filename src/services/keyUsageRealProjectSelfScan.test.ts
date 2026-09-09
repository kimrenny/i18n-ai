import { scanWorkspaceSourceFiles } from '../../electron/main/keyUsageService'
import { parseLocalizationData } from './localizationParser'
import { aggregateKeyUsages } from './keyUsageScanner'
import fs from 'node:fs/promises'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

describe('Scan Current Workspace (i18nh-pc)', () => {
  it('scans the actual project and detects non-zero key usages', async () => {
    const workspaceRoot = process.cwd()
    const scanResult = await scanWorkspaceSourceFiles(workspaceRoot)
    if (scanResult.error) {
      console.error('scanWorkspaceSourceFiles error:', scanResult.error)
    }
    expect(scanResult.totalSourceFiles).toBeGreaterThan(30)
    expect(scanResult.fileScanResults.length).toBeGreaterThan(30)

    const enPath = path.join(workspaceRoot, 'src/i18n/locales/en.json')
    const enContent = await fs.readFile(enPath, 'utf-8')
    const parsedEn = parseLocalizationData('en.json', enPath, JSON.parse(enContent))

    const aggregated = aggregateKeyUsages(scanResult.fileScanResults, [parsedEn])
    console.log('Actual Workspace Scan Results:')
    console.log('Total Source Files:', scanResult.totalSourceFiles)
    console.log('Total Unique Keys in en.json:', aggregated.totalUniqueKeys)
    console.log('Used Keys Count:', aggregated.usedKeysCount)
    console.log('Unused Keys Count:', aggregated.unusedKeysCount)
    console.log('Missing Keys Count:', aggregated.missingKeysCount)
    console.log('Dynamic Usages Count:', aggregated.dynamicUsagesCount)

    const unusedKeys = aggregated.items.filter((i) => i.status === 'unused')
    console.log('Sample of remaining unused keys (first 20):', unusedKeys.slice(0, 20).map((i) => i.key))

    // Verify that known used keys in this project are detected
    expect(aggregated.usedKeysCount).toBeGreaterThan(500)

    const appTitleUsage = aggregated.items.find((i) => i.key === 'app.title')
    expect(appTitleUsage?.status).toBe('used')
    expect(appTitleUsage?.usageCount).toBeGreaterThanOrEqual(1)

    const diffCompareUsage = aggregated.items.find((i) => i.key === 'app.compareFiles')
    expect(diffCompareUsage?.status).toBe('used')

    // Verify resolved dynamic keys from AddTranslationKeyModal
    const addKeyEmpty = aggregated.items.find((i) => i.key === 'addKey.errorEmpty')
    expect(addKeyEmpty?.status).toBe('used')
    expect(addKeyEmpty?.usageCount).toBeGreaterThanOrEqual(1)
    expect(addKeyEmpty?.usages[0].matchedExpression).toContain('addKey.')

    const addKeyConsecutive = aggregated.items.find((i) => i.key === 'addKey.errorConsecutiveDots')
    expect(addKeyConsecutive?.status).toBe('used')
    expect(addKeyConsecutive?.usageCount).toBeGreaterThanOrEqual(1)

    const geminiProvider = aggregated.items.find((i) => i.key === 'providers.gemini.name')
    expect(geminiProvider?.status).toBe('used')
    expect(geminiProvider?.usageCount).toBeGreaterThanOrEqual(1)
  }, 60000)
})
