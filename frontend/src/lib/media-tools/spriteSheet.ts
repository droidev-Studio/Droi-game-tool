import { canvasToBlob, loadImageFromBlob } from './imageLoader'
import { runInBatches } from './batchRunner'

export type SpriteSheetInputFrame = {
  id: string
  name: string
  blob: Blob
}

export type SpriteSheetExport = {
  blob: Blob
  json: {
    version: 1
    image: string
    frameWidth: number
    frameHeight: number
    columns: number
    rows: number
    frames: Array<{
      id: string
      name: string
      index: number
      file: string
      x: number
      y: number
      width: number
      height: number
    }>
  }
}

export async function createSpriteSheet(
  frames: SpriteSheetInputFrame[],
  frameWidth: number,
  frameHeight: number,
  imageName = 'sprite_sheet.png',
  options: {
    batchSize?: number
    onProgress?: (done: number, total: number) => void
  } = {},
): Promise<SpriteSheetExport> {
  const count = Math.max(1, frames.length)
  const columns = Math.min(8, Math.ceil(Math.sqrt(count)))
  const rows = Math.ceil(count / columns)
  const canvas = document.createElement('canvas')
  canvas.width = columns * frameWidth
  canvas.height = rows * frameHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Sprite sheet canvas creation failed')
  ctx.imageSmoothingEnabled = false

  const sheetFrames: SpriteSheetExport['json']['frames'] = []
  await runInBatches(
    frames,
    async (frame, index) => {
      const loaded = await loadImageFromBlob(frame.blob, frame.name)
      const x = (index % columns) * frameWidth
      const y = Math.floor(index / columns) * frameHeight
      ctx.drawImage(loaded.image, x, y, frameWidth, frameHeight)
      URL.revokeObjectURL(loaded.url)
      sheetFrames[index] = {
        id: frame.id,
        name: frame.name,
        index,
        file: `frames/frame_${String(index + 1).padStart(3, '0')}.png`,
        x,
        y,
        width: frameWidth,
        height: frameHeight,
      }
      return true
    },
    {
      batchSize: options.batchSize ?? 3,
      onProgress: ({ done, total }) => options.onProgress?.(done, total),
    },
  )

  return {
    blob: await canvasToBlob(canvas),
    json: {
      version: 1,
      image: imageName,
      frameWidth,
      frameHeight,
      columns,
      rows,
      frames: sheetFrames,
    },
  }
}
