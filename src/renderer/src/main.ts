import { Recorder } from './recorder'
import type { Corner } from './compositor'

const sourceSelect = document.getElementById('source-select') as HTMLSelectElement
const webcamSelect = document.getElementById('webcam-select') as HTMLSelectElement
const micSelect = document.getElementById('mic-select') as HTMLSelectElement
const micLevel = document.getElementById('mic-level') as HTMLDivElement
const previewCanvas = document.getElementById('preview') as HTMLCanvasElement
const previewPlaceholder = document.getElementById('preview-placeholder') as HTMLSpanElement
const selfView = document.getElementById('self-view') as HTMLVideoElement
const reviewVideo = document.getElementById('review-video') as HTMLVideoElement
const countdownEl = document.getElementById('countdown') as HTMLDivElement
const startBtn = document.getElementById('start-btn') as HTMLButtonElement
const stopBtn = document.getElementById('stop-btn') as HTMLButtonElement
const pauseBtn = document.getElementById('pause-btn') as HTMLButtonElement
const saveBtn = document.getElementById('save-btn') as HTMLButtonElement
const rerecordBtn = document.getElementById('rerecord-btn') as HTMLButtonElement
const discardBtn = document.getElementById('discard-btn') as HTMLButtonElement
const controlsRecord = document.getElementById('controls-record') as HTMLDivElement
const controlsReview = document.getElementById('controls-review') as HTMLDivElement
const timerEl = document.getElementById('timer') as HTMLSpanElement
const statusEl = document.getElementById('status') as HTMLParagraphElement
const screenHint = document.getElementById('screen-hint') as HTMLDivElement
const screenHintText = document.getElementById('screen-hint-text') as HTMLParagraphElement
const openSettingsBtn = document.getElementById('open-settings-btn') as HTMLButtonElement
const retryBtn = document.getElementById('retry-btn') as HTMLButtonElement

const sizeToggle = document.getElementById('size-toggle') as HTMLDivElement
const cornerGrid = document.getElementById('corner-grid') as HTMLDivElement
const bubbleDemo = document.getElementById('bubble-demo') as HTMLDivElement
const bubbleDemoCircle = document.getElementById('bubble-demo-circle') as HTMLDivElement
const bubbleDemoVideo = document.getElementById('bubble-demo-video') as HTMLVideoElement

const SCREEN_PERMISSION_MESSAGE =
  'Screen Recording permission needed. Open System Settings → Privacy & Security → Screen Recording, enable PipCast (or Electron in dev), then quit and relaunch the app. After enabling, click Retry.'
const PADDING_SCALE = 0.03
const COUNTDOWN_FROM = 3

type AppState = 'idle' | 'counting' | 'recording' | 'paused' | 'reviewing'

const recorder = new Recorder()
let appState: AppState = 'idle'
let timerId: number | null = null
let elapsedMs = 0
let segmentStart = 0
let bubbleScale = 0.26
let corner: Corner = 'bottom-left'
let previewStream: MediaStream | null = null
let recordedBlob: Blob | null = null
let recordedExt: 'mp4' | 'webm' = 'webm'
let reviewUrl: string | null = null

// Mic level meter (Web Audio).
let audioCtx: AudioContext | null = null
let analyser: AnalyserNode | null = null
let meterSource: MediaStreamAudioSourceNode | null = null
let meterRaf = 0

function show(el: HTMLElement, visible: boolean): void {
  el.classList.toggle('hidden', !visible)
}

function setStatus(message: string, kind: 'info' | 'error' | 'success' = 'info'): void {
  statusEl.textContent = message
  statusEl.dataset.kind = kind
}

function showScreenHint(message: string): void {
  screenHintText.textContent = message
  screenHint.classList.remove('hidden')
}

function hideScreenHint(): void {
  screenHint.classList.add('hidden')
}

/** Toggle which preview layer + controls are visible for the given state. */
function setState(state: AppState): void {
  appState = state
  const hasPreview = !!previewStream
  const capturing = state === 'recording' || state === 'paused'
  show(selfView, state === 'idle' || state === 'counting')
  show(previewCanvas, capturing)
  show(reviewVideo, state === 'reviewing')
  show(countdownEl, state === 'counting')
  show(previewPlaceholder, state === 'idle' && !hasPreview)
  show(controlsRecord, state !== 'reviewing')
  show(controlsReview, state === 'reviewing')
  startBtn.disabled = state !== 'idle'
  stopBtn.disabled = !capturing
  show(pauseBtn, capturing)
  pauseBtn.disabled = !capturing
  pauseBtn.textContent = state === 'paused' ? 'Resume' : 'Pause'
}

/** Mirror the compositor's size + corner placement in the div-based demo. */
function updateBubbleDemo(): void {
  const boxH = bubbleDemo.clientHeight || (bubbleDemo.clientWidth * 9) / 16
  const d = bubbleScale * boxH
  const pad = PADDING_SCALE * boxH
  const c = bubbleDemoCircle.style
  c.width = `${d}px`
  c.height = `${d}px`
  c.left = corner.endsWith('left') ? `${pad}px` : 'auto'
  c.right = corner.endsWith('right') ? `${pad}px` : 'auto'
  c.top = corner.startsWith('top') ? `${pad}px` : 'auto'
  c.bottom = corner.startsWith('bottom') ? `${pad}px` : 'auto'
}

function persist(): void {
  void window.pipcast.saveSettings({
    webcamDeviceId: webcamSelect.value || undefined,
    micDeviceId: micSelect.value || undefined,
    bubbleScale,
    corner
  })
}

function applySize(scale: number): void {
  bubbleScale = scale
  sizeToggle.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
    b.classList.toggle('active', Number(b.dataset.scale) === scale)
  })
}

function applyCorner(c: Corner): void {
  corner = c
  cornerGrid.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
    b.classList.toggle('active', b.dataset.corner === c)
  })
}

sizeToggle.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
  btn.addEventListener('click', () => {
    applySize(Number(btn.dataset.scale))
    updateBubbleDemo()
    persist()
  })
})

cornerGrid.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
  btn.addEventListener('click', () => {
    applyCorner(btn.dataset.corner as Corner)
    updateBubbleDemo()
    persist()
  })
})

window.addEventListener('resize', updateBubbleDemo)

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000)
  const mm = String(Math.floor(total / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

function renderTimer(): void {
  const live = timerId !== null ? performance.now() - segmentStart : 0
  timerEl.textContent = formatElapsed(elapsedMs + live)
}

function timerStart(): void {
  elapsedMs = 0
  segmentStart = performance.now()
  timerEl.textContent = '00:00'
  timerId = window.setInterval(renderTimer, 500)
}

/** Freeze elapsed time while paused. */
function timerPause(): void {
  if (timerId !== null) {
    elapsedMs += performance.now() - segmentStart
    clearInterval(timerId)
    timerId = null
  }
  renderTimer()
}

function timerResume(): void {
  segmentStart = performance.now()
  timerId = window.setInterval(renderTimer, 500)
}

function timerStop(): void {
  if (timerId !== null) {
    clearInterval(timerId)
    timerId = null
  }
  elapsedMs = 0
}

/** (Re)wire the mic level meter to the current stream's audio track. */
function setupMeter(stream: MediaStream): void {
  const track = stream.getAudioTracks()[0]
  if (!track) return
  if (!audioCtx) {
    audioCtx = new AudioContext()
    analyser = audioCtx.createAnalyser()
    analyser.fftSize = 1024
  }
  void audioCtx.resume()
  meterSource?.disconnect()
  // Analyser is not connected to the destination, so the mic is never played back.
  meterSource = audioCtx.createMediaStreamSource(new MediaStream([track]))
  meterSource.connect(analyser!)
  if (!meterRaf) {
    const data = new Uint8Array(analyser!.fftSize)
    const tick = (): void => {
      analyser!.getByteTimeDomainData(data)
      let sum = 0
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128
        sum += v * v
      }
      const rms = Math.sqrt(sum / data.length)
      micLevel.style.width = `${Math.min(100, Math.round(rms * 180))}%`
      meterRaf = requestAnimationFrame(tick)
    }
    meterRaf = requestAnimationFrame(tick)
  }
}

/** Acquire (or swap) the persistent webcam+mic stream that feeds both self-views. */
async function acquireMedia(): Promise<void> {
  previewStream?.getTracks().forEach((t) => t.stop())
  previewStream = null
  const videoId = webcamSelect.value || undefined
  const micId = micSelect.value || undefined
  try {
    previewStream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: videoId ? { exact: videoId } : undefined },
      audio: micId ? { deviceId: { exact: micId } } : true
    })
    selfView.srcObject = previewStream
    bubbleDemoVideo.srcObject = previewStream
    setupMeter(previewStream)
  } catch {
    selfView.srcObject = null
    bubbleDemoVideo.srcObject = null
    micLevel.style.width = '0%'
    previewPlaceholder.textContent = 'Camera/mic unavailable'
    setStatus('Could not open the selected camera or microphone.', 'error')
  }
}

async function loadSources(): Promise<boolean> {
  try {
    const sources = await window.pipcast.getSources()
    sourceSelect.innerHTML = ''
    for (const s of sources) {
      const opt = document.createElement('option')
      opt.value = s.id
      opt.textContent = s.name
      sourceSelect.appendChild(opt)
    }
    hideScreenHint()
    return true
  } catch (err) {
    const msg = (err as Error).message
    if (msg.includes('SCREEN_PERMISSION_REQUIRED')) {
      showScreenHint(SCREEN_PERMISSION_MESSAGE)
      setStatus('Screen Recording permission required.', 'error')
    } else {
      showScreenHint(msg)
      setStatus(`Could not list screens: ${msg}`, 'error')
    }
    return false
  }
}

function selectIfPresent(select: HTMLSelectElement, value?: string): void {
  if (value && Array.from(select.options).some((o) => o.value === value)) {
    select.value = value
  }
}

function fillSelect(select: HTMLSelectElement, devices: MediaDeviceInfo[], fallback: string): void {
  select.innerHTML = ''
  devices.forEach((d, i) => {
    const opt = document.createElement('option')
    opt.value = d.deviceId
    opt.textContent = d.label || `${fallback} ${i + 1}`
    select.appendChild(opt)
  })
}

async function loadDevices(): Promise<void> {
  // Prompt for permission first so device labels are populated.
  try {
    const tmp = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    tmp.getTracks().forEach((t) => t.stop())
  } catch {
    setStatus('Camera/microphone permission is required.', 'error')
  }

  const devices = await navigator.mediaDevices.enumerateDevices()
  fillSelect(webcamSelect, devices.filter((d) => d.kind === 'videoinput'), 'Camera')
  fillSelect(micSelect, devices.filter((d) => d.kind === 'audioinput'), 'Microphone')
}

async function checkScreenAccess(): Promise<boolean> {
  const status = await window.pipcast.getScreenAccess()
  if (status !== 'granted') {
    showScreenHint(SCREEN_PERMISSION_MESSAGE)
    return false
  }
  hideScreenHint()
  return true
}

function runCountdown(): Promise<void> {
  return new Promise((resolve) => {
    let n = COUNTDOWN_FROM
    countdownEl.textContent = String(n)
    const id = window.setInterval(() => {
      n -= 1
      if (n <= 0) {
        clearInterval(id)
        resolve()
      } else {
        countdownEl.textContent = String(n)
      }
    }, 1000)
  })
}

function clearReview(): void {
  if (reviewUrl) {
    URL.revokeObjectURL(reviewUrl)
    reviewUrl = null
  }
  reviewVideo.removeAttribute('src')
  reviewVideo.load()
  recordedBlob = null
}

async function handleStart(): Promise<void> {
  if (!sourceSelect.value) {
    setStatus('Pick a screen or window first.', 'error')
    return
  }
  if (!previewStream) {
    setStatus('No camera available to record.', 'error')
    return
  }
  setState('counting')
  setStatus('Get ready…')
  await runCountdown()
  try {
    await recorder.start({
      sourceId: sourceSelect.value,
      webcamStream: previewStream,
      previewCanvas,
      bubbleScale,
      corner
    })
    setState('recording')
    timerStart()
    setStatus(`Recording (${recorder.mimeExt.toUpperCase()})…`)
  } catch (err) {
    setState('idle')
    setStatus(`Could not start: ${(err as Error).message}`, 'error')
  }
}

function handlePauseResume(): void {
  if (appState === 'recording') {
    recorder.pause()
    timerPause()
    setState('paused')
    setStatus('Paused.')
  } else if (appState === 'paused') {
    recorder.resume()
    timerResume()
    setState('recording')
    setStatus(`Recording (${recorder.mimeExt.toUpperCase()})…`)
  }
}

async function handleStop(): Promise<void> {
  stopBtn.disabled = true
  pauseBtn.disabled = true
  timerStop()
  setStatus('Processing…')
  try {
    const { blob, ext } = await recorder.stop()
    recordedBlob = blob
    recordedExt = ext
    reviewUrl = URL.createObjectURL(blob)
    reviewVideo.src = reviewUrl
    setState('reviewing')
    setStatus('Review your recording, then Save, Re-record, or Discard.')
  } catch (err) {
    setState('idle')
    setStatus(`Stop failed: ${(err as Error).message}`, 'error')
  }
}

async function handleSave(): Promise<void> {
  if (!recordedBlob) return
  saveBtn.disabled = true
  setStatus('Saving…')
  try {
    const buffer = await recordedBlob.arrayBuffer()
    const result = await window.pipcast.saveRecording(buffer, recordedExt)
    if (result.saved) {
      const note = result.transcoded ? ' (transcoded to MP4)' : ''
      setStatus(`Saved to ${result.path}${note}`, 'success')
      clearReview()
      setState('idle')
    } else {
      setStatus('Save cancelled. Still in review.')
    }
  } catch (err) {
    setStatus(`Save failed: ${(err as Error).message}`, 'error')
  } finally {
    saveBtn.disabled = false
  }
}

function handleDiscard(): void {
  clearReview()
  setState('idle')
  setStatus('Discarded. Ready to record.')
}

function handleRerecord(): void {
  clearReview()
  setState('idle')
  setStatus('Take discarded. Adjust if needed, then Start when ready.')
}

startBtn.addEventListener('click', handleStart)
stopBtn.addEventListener('click', handleStop)
pauseBtn.addEventListener('click', handlePauseResume)
saveBtn.addEventListener('click', handleSave)
discardBtn.addEventListener('click', handleDiscard)
rerecordBtn.addEventListener('click', handleRerecord)
webcamSelect.addEventListener('change', async () => {
  await acquireMedia()
  persist()
})
micSelect.addEventListener('change', async () => {
  await acquireMedia()
  persist()
})
openSettingsBtn.addEventListener('click', () => window.pipcast.openScreenSettings())
retryBtn.addEventListener('click', async () => {
  setStatus('Retrying…')
  const ok = await loadSources()
  if (ok) setStatus('Ready. Pick a screen and webcam, then start.', 'success')
})

async function init(): Promise<void> {
  // Restore persisted size/corner/webcam before anything paints.
  const settings = await window.pipcast.loadSettings()
  applySize(settings.bubbleScale)
  applyCorner(settings.corner as Corner)
  updateBubbleDemo()

  // Each step is independent so a screen-permission failure doesn't block the
  // device pickers (and vice versa).
  await checkScreenAccess().catch(() => false)
  await loadDevices().catch((err) =>
    setStatus(`Device list failed: ${(err as Error).message}`, 'error')
  )

  // Re-select the saved camera + mic if still present, then start the self-view.
  selectIfPresent(webcamSelect, settings.webcamDeviceId)
  selectIfPresent(micSelect, settings.micDeviceId)
  await acquireMedia()

  const sourcesOk = await loadSources()
  setState('idle')
  if (sourcesOk) setStatus('Ready. Pick a screen and webcam, then start.')
}

init().catch((err) => setStatus(`Init failed: ${(err as Error).message}`, 'error'))
