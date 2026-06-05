import { decompressFrames, parseGIF } from 'gifuct-js'
import { canvasToBlob } from './imageLoader'
import { runSequentialChunks } from './batchRunner'

export type ExtractedGifFrame = {
  blob: Blob
  delay: number
  name: string
}

export async function extractGifFrames(
  file: File,
  maxFrames = 240,
  options: {
    batchSize?: number
    onProgress?: (done: number, total: number) => void
  } = {},
): Promise<ExtractedGifFrame[]> {
  const buffer = await file.arrayBuffer()
  const gif = parseGIF(buffer)
  const frames = decompressFrames(gif, true).slice(0, maxFrames)
  const width = Number(gif.lsd.width)
  const height = Number(gif.lsd.height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('GIF canvas creation failed')
  const extracted: ExtractedGifFrame[] = []

  await runSequentialChunks(
    frames,
    async (frame, index) => {
      const previousCanvas = frame.disposalType === 3 ? ctx.getImageData(0, 0, width, height) : null
      const imageData = new ImageData(new Uint8ClampedArray(frame.patch), frame.dims.width, frame.dims.height)
      ctx.putImageData(imageData, frame.dims.left, frame.dims.top)
      extracted[index] = {
        blob: await canvasToBlob(canvas),
        delay: Math.max(20, frame.delay || 100),
        name: `${file.name.replace(/\.[^.]+$/, '')}_${String(index + 1).padStart(3, '0')}.png`,
      }
      if (frame.disposalType === 2) {
        ctx.clearRect(frame.dims.left, frame.dims.top, frame.dims.width, frame.dims.height)
      } else if (frame.disposalType === 3 && previousCanvas) {
        ctx.putImageData(previousCanvas, 0, 0)
      }
      return true
    },
    {
      batchSize: options.batchSize ?? 3,
      onProgress: ({ done, total }) => options.onProgress?.(done, total),
    },
  )

  return extracted
}
