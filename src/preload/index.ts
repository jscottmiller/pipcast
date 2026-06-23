import { contextBridge, ipcRenderer } from 'electron'

export interface CaptureSource {
  id: string
  name: string
  thumbnailDataURL: string
}

export type SaveResult =
  | { saved: false }
  | { saved: true; path: string; transcoded: boolean }

export interface PipcastSettings {
  webcamDeviceId?: string
  micDeviceId?: string
  bubbleScale: number
  corner: string
}

const api = {
  getSources: (): Promise<CaptureSource[]> => ipcRenderer.invoke('get-sources'),
  setCaptureSource: (id: string): void => ipcRenderer.send('set-capture-source', id),
  getScreenAccess: (): Promise<'granted' | 'denied' | 'restricted' | 'not-determined' | 'unknown'> =>
    ipcRenderer.invoke('get-screen-access'),
  openScreenSettings: (): Promise<void> => ipcRenderer.invoke('open-screen-settings'),
  saveRecording: (buffer: ArrayBuffer, ext: 'mp4' | 'webm'): Promise<SaveResult> =>
    ipcRenderer.invoke('save-recording', { buffer, ext }),
  loadSettings: (): Promise<PipcastSettings> => ipcRenderer.invoke('load-settings'),
  saveSettings: (settings: PipcastSettings): Promise<void> =>
    ipcRenderer.invoke('save-settings', settings)
}

contextBridge.exposeInMainWorld('pipcast', api)

export type PipcastApi = typeof api
