import type { ParsedLocalizationFile } from '../types/localization'
import type { KeyUsageScanResult } from '../types/keyUsage'
import {
  aggregateKeyUsages,
  type FileScanResult,
} from './keyUsageScanner'

/**
 * Executes a full static analysis of workspace source code to find all localization usages.
 * Communicates with Electron main process to discover and scan source files,
 * then aggregates results against currently parsed localization files.
 */
export async function performWorkspaceKeyUsageScan(
  workspacePath: string,
  parsedFiles: readonly ParsedLocalizationFile[]
): Promise<KeyUsageScanResult> {
  if (typeof window === 'undefined' || !window.electronAPI?.keyUsageScanWorkspace) {
    // In mock/browser environment without electronAPI, aggregate empty file scan results
    return aggregateKeyUsages([], parsedFiles)
  }

  try {
    const scanRes = await window.electronAPI.keyUsageScanWorkspace(workspacePath)
    const fileScanResults = (scanRes?.fileScanResults || []) as FileScanResult[]
    return aggregateKeyUsages(fileScanResults, parsedFiles)
  } catch (err) {
    console.error('[keyUsageService] Failed to scan workspace key usage:', err)
    return {
      scannedFilesCount: 0,
      parsedFilesCount: 0,
      skippedFilesCount: 1,
      skippedFiles: [{ filePath: workspacePath, error: String(err) }],
      totalUniqueKeys: 0,
      usedKeysCount: 0,
      unusedKeysCount: 0,
      missingKeysCount: 0,
      dynamicUsagesCount: 0,
      items: [],
      dynamicUsages: [],
    }
  }
}
