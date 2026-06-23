import { app, BrowserWindow, desktopCapturer, dialog, ipcMain, session, shell, systemPreferences } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { transcodeToMp4 } from './transcode.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** The desktopCapturer source id the renderer selected for this recording. */
let selectedSourceId: string | null = null

export interface PipcastSettings {
  webcamDeviceId?: string
  micDeviceId?: string
  bubbleScale: number
  corner: string
}

const DEFAULT_SETTINGS: PipcastSettings = { bubbleScale: 0.26, corner: 'bottom-left' }

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 480,
    height: 680,
    resizable: false,
    title: 'PipCast',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/**
 * Route the renderer's getDisplayMedia() request to the source the user picked.
 * Audio is intentionally omitted here — the mic is captured via getUserMedia.
 */
function registerDisplayMediaHandler(): void {
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer
      .getSources({ types: ['screen', 'window'] })
      .then((sources) => {
        const source = sources.find((s) => s.id === selectedSourceId) ?? sources[0]
        if (source) callback({ video: source })
        else callback({})
      })
      .catch(() => callback({}))
  })
}

function registerIpc(): void {
  ipcMain.handle('get-sources', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 180 }
      })
      return sources.map((s) => ({
        id: s.id,
        name: s.name,
        thumbnailDataURL: s.thumbnail.toDataURL()
      }))
    } catch (err) {
      // On macOS this throws "Failed to get sources" until Screen Recording
      // permission is granted. Surface an actionable error to the renderer.
      const status =
        process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus('screen') : 'granted'
      throw new Error(
        status !== 'granted'
          ? 'SCREEN_PERMISSION_REQUIRED'
          : `Failed to list screens: ${(err as Error).message}`
      )
    }
  })

  ipcMain.handle('open-screen-settings', async () => {
    if (process.platform === 'darwin') {
      await shell.openExternal(
        'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
      )
    }
  })

  ipcMain.on('set-capture-source', (_event, id: string) => {
    selectedSourceId = id
  })

  ipcMain.handle('load-settings', async (): Promise<PipcastSettings> => {
    try {
      const raw = await readFile(settingsPath(), 'utf8')
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
    } catch {
      return DEFAULT_SETTINGS
    }
  })

  ipcMain.handle('save-settings', async (_event, settings: PipcastSettings) => {
    await writeFile(settingsPath(), JSON.stringify(settings, null, 2), 'utf8')
  })

  ipcMain.handle('get-screen-access', () => {
    // macOS only; other platforms report 'granted'.
    if (process.platform !== 'darwin') return 'granted'
    return systemPreferences.getMediaAccessStatus('screen')
  })

  ipcMain.handle(
    'save-recording',
    async (_event, payload: { buffer: ArrayBuffer; ext: 'mp4' | 'webm' }) => {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Save recording',
        defaultPath: `pipcast-${stamp}.mp4`,
        filters: [{ name: 'MP4 Video', extensions: ['mp4'] }]
      })

      if (canceled || !filePath) return { saved: false as const }

      const data = Buffer.from(payload.buffer)

      if (payload.ext === 'mp4') {
        await writeFile(filePath, data)
        return { saved: true as const, path: filePath, transcoded: false }
      }

      // WebM fallback: write to a temp file, transcode to the chosen .mp4, clean up.
      const dir = await mkdtemp(join(tmpdir(), 'pipcast-'))
      const tmpWebm = join(dir, 'recording.webm')
      try {
        await writeFile(tmpWebm, data)
        await transcodeToMp4(tmpWebm, filePath)
        return { saved: true as const, path: filePath, transcoded: true }
      } finally {
        await rm(dir, { recursive: true, force: true })
      }
    }
  )
}

app.whenReady().then(async () => {
  if (process.platform === 'darwin') {
    // Best-effort prompts; ignore rejections (user can grant later in System Settings).
    await systemPreferences.askForMediaAccess('camera').catch(() => false)
    await systemPreferences.askForMediaAccess('microphone').catch(() => false)
  }

  registerDisplayMediaHandler()
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
