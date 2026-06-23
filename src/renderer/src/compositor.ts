export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export interface Compositor {
  stream: MediaStream
  stop: () => void
}

interface CompositorOptions {
  /** Webcam bubble diameter as a fraction of the canvas height (0–1). */
  bubbleScale?: number
  /** Padding from the canvas edges as a fraction of the canvas height (0–1). */
  paddingScale?: number
  /** Which corner the webcam bubble sits in. */
  corner?: Corner
  fps?: number
}

export interface BubbleLayout {
  diameter: number
  radius: number
  padding: number
  /** Bubble center, in canvas pixels. */
  cx: number
  cy: number
}

/** Pure geometry for the webcam bubble: size + center for a given canvas and corner. */
export function computeBubbleLayout(
  width: number,
  height: number,
  bubbleScale: number,
  paddingScale: number,
  corner: Corner
): BubbleLayout {
  const diameter = bubbleScale * height
  const padding = paddingScale * height
  const radius = diameter / 2
  const cx = corner.endsWith('left') ? padding + radius : width - padding - radius
  const cy = corner.startsWith('top') ? padding + radius : height - padding - radius
  return { diameter, radius, padding, cx, cy }
}

/** Cover-fit a source of size vw×vh into a square of side `diameter` (no distortion). */
export function coverFitSquare(
  vw: number,
  vh: number,
  diameter: number
): { dw: number; dh: number } {
  const scale = Math.max(diameter / vw, diameter / vh)
  return { dw: vw * scale, dh: vh * scale }
}

/**
 * Draws the screen video full-frame with the webcam composited as a circular
 * bubble in the bottom-left corner, and exposes the result as a MediaStream.
 */
export function createCompositor(
  screenVideo: HTMLVideoElement,
  webcamVideo: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  options: CompositorOptions = {}
): Compositor {
  const { bubbleScale = 0.26, paddingScale = 0.03, corner = 'bottom-left', fps = 30 } = options

  const width = screenVideo.videoWidth || 1280
  const height = screenVideo.videoHeight || 720
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas context unavailable')

  let rafId = 0
  let running = true

  const { diameter: bubbleDiameter, radius, cx, cy } = computeBubbleLayout(
    width,
    height,
    bubbleScale,
    paddingScale,
    corner
  )

  function drawWebcamBubble(): void {
    const vw = webcamVideo.videoWidth
    const vh = webcamVideo.videoHeight
    if (!vw || !vh) return

    const { dw, dh } = coverFitSquare(vw, vh, bubbleDiameter)
    const dx = cx - dw / 2
    const dy = cy - dh / 2

    ctx!.save()
    ctx!.beginPath()
    ctx!.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx!.closePath()
    ctx!.clip()
    ctx!.drawImage(webcamVideo, dx, dy, dw, dh)
    ctx!.restore()

    // Thin ring around the bubble.
    ctx!.save()
    ctx!.beginPath()
    ctx!.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx!.lineWidth = Math.max(2, bubbleDiameter * 0.022)
    ctx!.strokeStyle = 'rgba(255, 255, 255, 0.9)'
    ctx!.stroke()
    ctx!.restore()
  }

  function frame(): void {
    if (!running) return
    if (screenVideo.videoWidth) {
      ctx!.drawImage(screenVideo, 0, 0, width, height)
    }
    drawWebcamBubble()
    rafId = requestAnimationFrame(frame)
  }

  frame()

  const stream = canvas.captureStream(fps)

  return {
    stream,
    stop: () => {
      running = false
      cancelAnimationFrame(rafId)
      stream.getTracks().forEach((t) => t.stop())
    }
  }
}
