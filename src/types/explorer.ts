export interface ProjectFileEntry {
  name: string
  path: string
  relativePath: string
  isDirectory: boolean
  isLocalizationCandidate?: boolean
  size?: number
  children?: ProjectFileEntry[]
}

export interface DirectoryTreeResult {
  rootPath: string
  rootName: string
  entries: ProjectFileEntry[]
  totalLocalizationCandidates: number
}
