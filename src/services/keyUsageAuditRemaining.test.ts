import { scanWorkspaceSourceFiles } from '../../electron/main/keyUsageService'
import { parseLocalizationData } from './localizationParser'
import { aggregateKeyUsages } from './keyUsageScanner'
import fs from 'node:fs/promises'
import path from 'node:path'
import { describe, it } from 'vitest'

describe('Inspect All Remaining Unused Keys', () => {
  it(
    'analyzes every remaining unused key with evidence',
    async () => {
      const workspaceRoot = process.cwd()
    const scanResult = await scanWorkspaceSourceFiles(workspaceRoot)

    const enPath = path.join(workspaceRoot, 'src/i18n/locales/en.json')
    const enContent = await fs.readFile(enPath, 'utf-8')
    const parsedEn = parseLocalizationData('en.json', enPath, JSON.parse(enContent))

    const aggregated = aggregateKeyUsages(scanResult.fileScanResults, [parsedEn])

    const unused = aggregated.items.filter((i) => i.status === 'unused')
    console.log(`\n=== FULL AUDIT OF ALL ${unused.length} REMAINING UNUSED KEYS ===\n`)

    const categorized: Record<string, string[]> = {
      CONFIRMED_UNUSED: [],
      POSSIBLE_DYNAMIC_USAGE: [],
    }

    for (const item of unused) {
      const hasDyn = item.possibleDynamicUsages && item.possibleDynamicUsages.length > 0
      const classification = hasDyn ? 'POSSIBLE_DYNAMIC_USAGE' : 'CONFIRMED_UNUSED'
      categorized[classification].push(item.key)

      console.log(`KEY: ${item.key}`)
      console.log(`CLASSIFICATION: ${classification}`)
      if (hasDyn) {
        console.log(`DYNAMIC CANDIDATES:`)
        for (const dyn of item.possibleDynamicUsages!) {
          console.log(`  - ${dyn.relativePath}:${dyn.line} -> ${dyn.expression}`)
        }
      } else {
        console.log(`SOURCE REFERENCES: 0 direct or dynamic references found in any source file.`)
      }
      console.log('---')
    }

    console.log(`\nSUMMARY:`)
    console.log(`Total Unused: ${unused.length}`)
    console.log(`Confirmed Unused: ${categorized.CONFIRMED_UNUSED.length}`)
    console.log(`Possible Dynamic Usage: ${categorized.POSSIBLE_DYNAMIC_USAGE.length}`)
  }, 60000)
})
