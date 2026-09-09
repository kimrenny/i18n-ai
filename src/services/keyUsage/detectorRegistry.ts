import type { LocalizationDetector, DetectorContext, DetectorScanResult } from './types'
import { AngularHtmlDetector } from './detectors/AngularHtmlDetector'
import { TypeScriptAstDetector } from './detectors/TypeScriptAstDetector'
import { DotNetDetector } from './detectors/DotNetDetector'
import { VueDetector } from './detectors/VueDetector'
import { SvelteDetector } from './detectors/SvelteDetector'

export class DetectorRegistry {
  private detectors: LocalizationDetector[] = []

  constructor() {
    this.registerDefaultDetectors()
  }

  /**
   * Registers standard default detector strategies.
   */
  private registerDefaultDetectors(): void {
    this.register(new AngularHtmlDetector())
    this.register(new TypeScriptAstDetector())
    this.register(new DotNetDetector())
    this.register(new VueDetector())
    this.register(new SvelteDetector())
  }

  /**
   * Registers a new localization usage detector strategy.
   */
  register(detector: LocalizationDetector): void {
    // Avoid duplicate detector IDs
    this.detectors = this.detectors.filter((d) => d.id !== detector.id)
    this.detectors.push(detector)
  }

  /**
   * Returns all registered detectors.
   */
  getAll(): readonly LocalizationDetector[] {
    return this.detectors
  }

  /**
   * Finds all detectors capable of handling the given file path.
   */
  getDetectorsForFile(filePath: string): LocalizationDetector[] {
    const lower = filePath.toLowerCase()
    const dotIndex = lower.lastIndexOf('.')
    if (dotIndex === -1) return []
    const ext = lower.substring(dotIndex)

    return this.detectors.filter((detector) =>
      detector.supportedExtensions.includes(ext)
    )
  }

  /**
   * Scans a file by invoking all matching detectors and merging results.
   */
  detectUsages(context: DetectorContext): DetectorScanResult {
    const matchingDetectors = this.getDetectorsForFile(context.filePath)
    if (matchingDetectors.length === 0) {
      return { staticUsages: [], dynamicUsages: [] }
    }

    const staticUsages: DetectorScanResult['staticUsages'] = []
    const dynamicUsages: DetectorScanResult['dynamicUsages'] = []

    for (const detector of matchingDetectors) {
      try {
        const res = detector.detect(context)
        staticUsages.push(...res.staticUsages)
        dynamicUsages.push(...res.dynamicUsages)
      } catch (err) {
        console.warn(`[DetectorRegistry] Detector ${detector.id} failed on ${context.relativePath}:`, err)
      }
    }

    return { staticUsages, dynamicUsages }
  }
}

/**
 * Singleton default registry instance.
 */
export const defaultDetectorRegistry = new DetectorRegistry()
