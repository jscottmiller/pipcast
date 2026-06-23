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
  startRecording: (ext: 'mp4' | 'webm'): Promise<void> =>
    ipcRenderer.invoke('recording-start', ext),
  writeRecordingChunk: (chunk: ArrayBuffer): Promise<void> =>
    ipcRenderer.invoke('recording-write', chunk),
  stopRecording: (): Promise<void> => ipcRenderer.invoke('recording-stop'),
  discardRecording: (): Promise<void> => ipcRenderer.invoke('recording-discard'),
  saveRecording: (): Promise<SaveResult> => ipcRenderer.invoke('save-recording'),
  loadSettings: (): Promise<PipcastSettings> => ipcRenderer.invoke('load-settings'),
  saveSettings: (settings: PipcastSettings): Promise<void> =>
    ipcRenderer.invoke('save-settings', settings)
}

contextBridge.exposeInMainWorld('pipcast', api)

export type PipcastApi = typeof api
