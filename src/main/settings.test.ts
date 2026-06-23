import { describe, it, expect } from 'vitest'
import { DEFAULT_SETTINGS, mergeSettings } from './settings'

describe('mergeSettings', () => {
  it('returns the defaults for empty JSON', () => {
    expect(mergeSettings('{}')).toEqual(DEFAULT_SETTINGS)
  })

  it('overrides only the provided keys', () => {
    const merged = mergeSettings('{"bubbleScale":0.34}')
    expect(merged.bubbleScale).toBe(0.34)
    expect(merged.corner).toBe(DEFAULT_SETTINGS.corner)
  })

  it('keeps extra persisted fields like device ids', () => {
    const merged = mergeSettings('{"corner":"top-right","webcamDeviceId":"cam-1"}')
    expect(merged.corner).toBe('top-right')
    expect(merged.webcamDeviceId).toBe('cam-1')
    expect(merged.bubbleScale).toBe(DEFAULT_SETTINGS.bubbleScale)
  })

  it('falls back to defaults on invalid JSON', () => {
    expect(mergeSettings('not json')).toEqual(DEFAULT_SETTINGS)
    expect(mergeSettings('')).toEqual(DEFAULT_SETTINGS)
  })
})
