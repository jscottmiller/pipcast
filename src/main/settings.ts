export interface PipcastSettings {
  webcamDeviceId?: string
  micDeviceId?: string
  bubbleScale: number
  corner: string
}

export const DEFAULT_SETTINGS: PipcastSettings = { bubbleScale: 0.26, corner: 'bottom-left' }

/**
 * Merge persisted settings JSON over the defaults. Returns the defaults
 * unchanged if the input is missing or not valid JSON.
 */
export function mergeSettings(raw: string): PipcastSettings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_SETTINGS
  }
}
