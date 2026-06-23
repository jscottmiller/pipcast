import type { PipcastApi } from './index'

declare global {
  interface Window {
    pipcast: PipcastApi
  }
}

export {}
