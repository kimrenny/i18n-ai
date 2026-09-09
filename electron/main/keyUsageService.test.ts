import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { scanWorkspaceSourceFiles } from './keyUsageService'

describe('keyUsageService', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'key-usage-test-'))
  })

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true })
    } catch {
      // ignore cleanup errors
    }
  })

  it('scans source files and ignores node_modules and .git', async () => {
    // 1. Create valid source files
    const srcDir = path.join(tmpDir, 'src')
    await fs.mkdir(srcDir, { recursive: true })
    await fs.writeFile(
      path.join(srcDir, 'App.tsx'),
      `import React from 'react'\nconst title = t('app.header.title')\n`,
      'utf-8'
    )
    await fs.writeFile(
      path.join(srcDir, 'utils.ts'),
      `export const msg = translate('common.confirm')\n`,
      'utf-8'
    )

    // 2. Create ignored directories
    const nodeModulesDir = path.join(tmpDir, 'node_modules', 'some-pkg')
    await fs.mkdir(nodeModulesDir, { recursive: true })
    await fs.writeFile(
      path.join(nodeModulesDir, 'index.ts'),
      `const ignored = t('ignored.pkg.key')\n`,
      'utf-8'
    )

    const gitDir = path.join(tmpDir, '.git')
    await fs.mkdir(gitDir, { recursive: true })
    await fs.writeFile(
      path.join(gitDir, 'config.ts'),
      `const gitKey = t('git.ignored.key')\n`,
      'utf-8'
    )

    // 3. Create non-source file
    await fs.writeFile(
      path.join(tmpDir, 'locales.json'),
      `{ "app.header.title": "Title" }`,
      'utf-8'
    )

    const res = await scanWorkspaceSourceFiles(tmpDir)

    expect(res.totalSourceFiles).toBe(2)
    expect(res.totalScannedFiles).toBe(2)
    expect(res.totalSkippedFiles).toBe(0)
    expect(res.fileScanResults).toHaveLength(2)

    const appRes = res.fileScanResults.find((r) => r.relativePath === 'src/App.tsx')
    expect(appRes).toBeDefined()
    expect(appRes?.staticUsages).toHaveLength(1)
    expect(appRes?.staticUsages[0].matchedExpression).toBe("t('app.header.title')")

    const utilsRes = res.fileScanResults.find((r) => r.relativePath === 'src/utils.ts')
    expect(utilsRes).toBeDefined()
    expect(utilsRes?.staticUsages).toHaveLength(1)
    expect(utilsRes?.staticUsages[0].matchedExpression).toBe("translate('common.confirm')")
  })
})
