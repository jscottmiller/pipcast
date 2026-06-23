import { app, BrowserWindow, desktopCapturer, dialog, ipcMain, protocol, session, shell, systemPreferences } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { copyFile, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createReadStream, createWriteStream, type WriteStream } from 'node:fs'
import { Readable } from 'node:stream'
import { tmpdir } from 'node:os'
import { transcodeToMp4 } from './transcode.js'
import { DEFAULT_SETTINGS, mergeSettings, type PipcastSettings } from './settings.js'
import { parseRangeHeader } from './range.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** The desktopCapturer source id the renderer selected for this recording. */
let selectedSourceId: string | null = null

/**
 * The recording currently being streamed to disk (or finished and awaiting
 * review/save). Chunks are appended as they arrive so the full recording is
 * never buffered in memory; review plays it back via the pipcast-media://
 * protocol and save moves/transcodes the temp file in place.
 */
interface ActiveRecording {
  stream: WriteStream | null
  dir: string
  path: string
  ext: 'mp4' | 'webm'
  contentType: string
}
let recording: ActiveRecording | null = null

/** Close any open write stream and delete the temp recording directory. */
async function cleanupRecording(): Promise<void> {
  const rec = recording
  recording = null
  if (!rec) return
  rec.stream?.destroy()
  await rm(rec.dir, { recursive: true, force: true }).catch(() => {})
}

// Must run before app is ready: lets the renderer stream the temp recording
// from disk (with range requests for seeking) instead of holding a Blob URL.
protocol.registerSchemesAsPrivileged([
  { scheme: 'pipcast-media', privileges: { secure: true, stream: true, supportFetchAPI: true } }
])

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
      return mergeSettings(await readFile(settingsPath(), 'utf8'))
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

  // Open a fresh temp file and stream incoming chunks into it.
  ipcMain.handle('recording-start', async (_event, ext: 'mp4' | 'webm') => {
    await cleanupRecording()
    const dir = await mkdtemp(join(tmpdir(), 'pipcast-'))
    const path = join(dir, `recording.${ext}`)
    recording = {
      stream: createWriteStream(path),
      dir,
      path,
      ext,
      contentType: ext === 'mp4' ? 'video/mp4' : 'video/webm'
    }
  })

  // Append one MediaRecorder chunk; resolves once it's flushed so the renderer
  // can serialize writes and guarantee the final chunk lands before stop.
  ipcMain.handle('recording-write', (_event, chunk: ArrayBuffer) => {
    const rec = recording
    if (!rec?.stream) return
    return new Promise<void>((resolve, reject) => {
      rec.stream!.write(Buffer.from(chunk), (err) => (err ? reject(err) : resolve()))
    })
  })

  // Close the write stream; the temp file is now ready for review and save.
  ipcMain.handle('recording-stop', async () => {
    const rec = recording
    if (!rec?.stream) return
    const stream = rec.stream
    rec.stream = null
    await new Promise<void>((resolve, reject) => {
      stream.once('error', reject)
      stream.end(() => resolve())
    })
  })

  ipcMain.handle('recording-discard', () => cleanupRecording())

  ipcMain.handle('save-recording', async () => {
    const rec = recording
    if (!rec) return { saved: false as const }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Save recording',
      defaultPath: `pipcast-${stamp}.mp4`,
      filters: [{ name: 'MP4 Video', extensions: ['mp4'] }]
    })

    // Keep the recording on cancel so the user can retry Save.
    if (canceled || !filePath) return { saved: false as const }

    if (rec.ext === 'mp4') {
      await copyFile(rec.path, filePath)
      await cleanupRecording()
      return { saved: true as const, path: filePath, transcoded: false }
    }

    // WebM fallback: transcode the temp file directly to the chosen .mp4.
    await transcodeToMp4(rec.path, filePath)
    await cleanupRecording()
    return { saved: true as const, path: filePath, transcoded: true }
  })
}

/** Stream the active temp recording to the renderer's <video>, with range support. */
function registerMediaProtocol(): void {
  protocol.handle('pipcast-media', async (request) => {
    const rec = recording
    if (!rec) return new Response(null, { status: 404 })

    const fileSize = (await stat(rec.path)).size
    const range = parseRangeHeader(request.headers.get('range'), fileSize)

    if (range) {
      const { start, end } = range
      const body = Readable.toWeb(createReadStream(rec.path, { start, end })) as unknown as ReadableStream
      return new Response(body, {
        status: 206,
        headers: {
          'Content-Type': rec.contentType,
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(end - start + 1)
        }
      })
    }

    const body = Readable.toWeb(createReadStream(rec.path)) as unknown as ReadableStream
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': rec.contentType,
        'Content-Length': String(fileSize),
        'Accept-Ranges': 'bytes'
      }
    })
  })
}

app.whenReady().then(async () => {
  if (process.platform === 'darwin') {
    // Best-effort prompts; ignore rejections (user can grant later in System Settings).
    await systemPreferences.askForMediaAccess('camera').catch(() => false)
    await systemPreferences.askForMediaAccess('microphone').catch(() => false)
  }

  registerDisplayMediaHandler()
  registerMediaProtocol()
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Best-effort: drop any temp recording when quitting.
app.on('before-quit', () => {
  void cleanupRecording()
})
