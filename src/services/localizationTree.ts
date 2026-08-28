import type {
  LocalizationComparisonResult,
  ParsedLocalizationFile,
  LocalizationTreeNode,
  FileTreeData,
  JsonValue,
} from '../types/localization'

interface InternalNode {
  segment: string
  fullKey: string
  isLeaf: boolean
  isPresent: boolean
  isMissing: boolean
  isConflict: boolean
  value?: JsonValue
  missingInFiles: string[]
  presentInFiles: string[]
  children: Map<string, InternalNode>
}

function createInternalNode(segment: string, fullKey: string): InternalNode {
  return {
    segment,
    fullKey,
    isLeaf: false,
    isPresent: false,
    isMissing: false,
    isConflict: false,
    missingInFiles: [],
    presentInFiles: [],
    children: new Map(),
  }
}

/**
 * Builds a deterministic tree representation of localization keys for a specific target file,
 * using the comparison result as the authoritative source of truth for key presence/absence.
 */
export function buildLocalizationTree(
  filename: string,
  comparisonResult: LocalizationComparisonResult,
  fileData?: ParsedLocalizationFile
): FileTreeData {
  const fileKeys = fileData ? fileData.keys : {}
  const rootMap = new Map<string, InternalNode>()

  let presentKeysCount = 0
  let missingKeysCount = 0

  for (const entry of comparisonResult.keys) {
    const isPresentInFile = Object.prototype.hasOwnProperty.call(fileKeys, entry.key)
    if (isPresentInFile) {
      presentKeysCount++
    } else {
      missingKeysCount++
    }

    const segments = entry.key.split('.')
    let currentMap = rootMap
    let accumulatedPath = ''

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]
      accumulatedPath = accumulatedPath ? `${accumulatedPath}.${segment}` : segment
      const isLast = i === segments.length - 1

      let node = currentMap.get(segment)
      if (!node) {
        node = createInternalNode(segment, accumulatedPath)
        currentMap.set(segment, node)
      }

      // Check for structural conflict:
      // If an intermediate parent is defined as a leaf value in this file,
      // but child properties are defined in the union.
      if (!isLast && Object.prototype.hasOwnProperty.call(fileKeys, accumulatedPath)) {
        node.isConflict = true
        node.value = fileKeys[accumulatedPath]
      }

      if (isLast) {
        node.isLeaf = true
        node.isPresent = isPresentInFile
        node.isMissing = !isPresentInFile
        node.value = isPresentInFile ? fileKeys[entry.key] : undefined
        node.missingInFiles = [...entry.missingInFiles]
        node.presentInFiles = [...entry.presentInFiles]
      }

      currentMap = node.children
    }
  }

  function convertToPublicNodes(map: Map<string, InternalNode>): LocalizationTreeNode[] {
    const sortedNodes = Array.from(map.values()).sort((a, b) =>
      a.segment.localeCompare(b.segment)
    )

    return sortedNodes.map((node) => {
      const children = convertToPublicNodes(node.children)
      const type = node.isConflict
        ? 'conflict'
        : node.children.size > 0
          ? 'folder'
          : 'leaf'

      return {
        id: node.fullKey,
        segment: node.segment,
        fullKey: node.fullKey,
        type,
        children,
        isPresent: node.isPresent,
        isMissing: node.isMissing,
        isConflict: node.isConflict,
        value: node.value,
        missingInFiles: node.missingInFiles,
        presentInFiles: node.presentInFiles,
      }
    })
  }

  const rootNodes = convertToPublicNodes(rootMap)

  return {
    filename,
    totalKeys: comparisonResult.totalUniqueKeys,
    presentKeysCount,
    missingKeysCount,
    rootNodes,
  }
}
