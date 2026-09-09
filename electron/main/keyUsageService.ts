import fs from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'
import {
  scanSourceFile,
  isIgnoredPath,
  isSupportedSourceFile,
  collectFileScopeContext,
  createEmptyStaticConstantsMap,
  mergeStaticConstants,
  type FileScanResult,
} from '../../src/services/keyUsageScanner'

export interface WorkspaceScanOptions {
  maxDepth?: number
  maxFileSize?: number
}

const DEFAULT_MAX_DEPTH = 12
const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

interface PendingFile {
  fullPath: string
  relativePath: string
  content: string
}

/**
 * Recursively scans a workspace directory for source files and extracts localization usages.
 * Uses a two-stage analysis for static value propagation across files.
 */
export async function scanWorkspaceSourceFiles(
  rootDirectory: string,
  options: WorkspaceScanOptions = {}
): Promise<{
  fileScanResults: FileScanResult[]
  totalSourceFiles: number
  totalScannedFiles: number
  totalSkippedFiles: number
  error?: string
}> {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH
  const maxFileSize = options.maxFileSize ?? DEFAULT_MAX_FILE_SIZE
  const fileScanResults: FileScanResult[] = []
  const pendingFiles: PendingFile[] = []

  let totalSourceFiles = 0
  let totalScannedFiles = 0
  let totalSkippedFiles = 0

  async function walk(currentDir: string, currentDepth: number) {
    if (currentDepth > maxDepth) return

    let entries: import('node:fs').Dirent[]
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true })
    } catch (err) {
      console.warn(`[keyUsageService] Failed to read directory ${currentDir}:`, err)
      return
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name)
      const relativePath = path.relative(rootDirectory, fullPath).replace(/\\/g, '/')

      if (entry.isDirectory()) {
        if (isIgnoredPath(entry.name) || isIgnoredPath(relativePath)) {
          continue
        }
        await walk(fullPath, currentDepth + 1)
      } else if (entry.isFile()) {
        if (!isSupportedSourceFile(relativePath)) {
          continue
        }

        totalSourceFiles++

        try {
          const stats = await fs.stat(fullPath)
          if (stats.size > maxFileSize) {
            totalSkippedFiles++
            fileScanResults.push({
              filePath: fullPath,
              relativePath,
              staticUsages: [],
              dynamicUsages: [],
              success: false,
              error: 'File size exceeds maximum scan limit (10MB)',
            })
            continue
          }

          const content = await fs.readFile(fullPath, 'utf-8')
          pendingFiles.push({ fullPath, relativePath, content })
        } catch (readErr) {
          totalSkippedFiles++
          fileScanResults.push({
            filePath: fullPath,
            relativePath,
            staticUsages: [],
            dynamicUsages: [],
            success: false,
            error: readErr instanceof Error ? readErr.message : String(readErr),
          })
        }
      }
    }
  }

  try {
    await walk(rootDirectory, 0)

    // Stage 1: Build workspace-level static constants map across all TS/JS files
    const workspaceConstants = createEmptyStaticConstantsMap()
    for (const file of pendingFiles) {
      const lower = file.relativePath.toLowerCase()
      if (
        lower.endsWith('.ts') ||
        lower.endsWith('.tsx') ||
        lower.endsWith('.js') ||
        lower.endsWith('.jsx') ||
        lower.endsWith('.mjs') ||
        lower.endsWith('.cjs')
      ) {
        try {
          let scriptKind = ts.ScriptKind.TS
          if (lower.endsWith('.tsx')) scriptKind = ts.ScriptKind.TSX
          else if (lower.endsWith('.jsx')) scriptKind = ts.ScriptKind.JSX
          else if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) {
            scriptKind = ts.ScriptKind.JS
          }

          const sourceFile = ts.createSourceFile(
            file.relativePath,
            file.content,
            ts.ScriptTarget.Latest,
            true,
            scriptKind
          )
          const fileCtx = collectFileScopeContext(sourceFile)
          mergeStaticConstants(workspaceConstants, fileCtx.constants)
        } catch {
          // Ignore parse errors in stage 1
        }
      }
    }

    // Stage 2: Scan all files with workspaceConstants passed for cross-file static propagation
    for (const file of pendingFiles) {
      const result = scanSourceFile(
        file.fullPath,
        file.relativePath,
        file.content,
        workspaceConstants
      )

      if (result.success) {
        totalScannedFiles++
      } else {
        totalSkippedFiles++
      }

      fileScanResults.push(result)
    }

    return {
      fileScanResults,
      totalSourceFiles,
      totalScannedFiles,
      totalSkippedFiles,
    }
  } catch (err) {
    return {
      fileScanResults,
      totalSourceFiles,
      totalScannedFiles,
      totalSkippedFiles,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
