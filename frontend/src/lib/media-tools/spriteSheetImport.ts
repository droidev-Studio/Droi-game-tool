import { canvasToBlob, loadImageFromBlob } from './imageLoader'
import { runInBatches } from './batchRunner'

export type LegacySpriteSheetIndex = {
  frame_size?: { w?: number; h?: number }
  frames?: Array<{
    i?: number
    x: number
    y: number
    w?: number
    h?: number
    width?: number
    height?: number
    t?: number
    file?: string
    url?: string
  }>
  frame_files?: Array<{
    i?: number
    file?: string
    url?: string
    t?: number
  }>
}

export type ExtractedSheetFrame = {
  blob: Blob
  name: string
  index: number
}

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to fetch ${url}`)
  return response.json() as Promise<T>
}

export async function fetchBlob(url: string): Promise<Blob> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to fetch ${url}`)
  return response.blob()
}

function resolveFrameUrl(jobId: string, frame: { file?: string; url?: string }): string | null {
  if (frame.url) return frame.url
  if (!frame.file) return null
  const fileName = frame.file.split(/[\\/]/).pop()
  return fileName ? `/api/jobs/${jobId}/frames/${encodeURIComponent(fileName)}` : null
}

export async function fetchDirectFramesFromIndex(
  jobId: string,
  index: LegacySpriteSheetIndex,
  options: {
    baseName?: string
    batchSize?: number
    onProgress?: (done: number, total: number) => void
  } = {},
): Promise<ExtractedSheetFrame[]> {
  const directFrames = (index.frame_files?.length ? index.frame_files : index.frames) ?? []
  const urlItems = directFrames
    .map((frame, position) => ({
      index: frame.i ?? position,
      url: resolveFrameUrl(jobId, frame),
      name: `${options.baseName ?? 'video_frame'}_${String(position + 1).padStart(3, '0')}.png`,
    }))
    .filter((item): item is { index: number; url: string; name: string } => Boolean(item.url))
  if (!urlItems.length) return []

  const fetched: ExtractedSheetFrame[] = []
  await runInBatches(
    urlItems,
    async (item, position) => {
      fetched[position] = {
        blob: await fetchBlob(item.url),
        name: item.name,
        index: item.index,
      }
      return true
    },
    {
      batchSize: options.batchSize ?? 3,
      onProgress: ({ done, total }) => options.onProgress?.(done, total),
    },
  )
  return fetched
}

export async function extractFramesFromSpriteSheet(
  sheetBlob: Blob,
  index: LegacySpriteSheetIndex,
  options: {
    baseName?: string
    batchSize?: number
    onProgress?: (done: number, total: number) => void
  } = {},
): Promise<ExtractedSheetFrame[]> {
  const frames = index.frames ?? []
  if (!frames.length) return []
  const loaded = await loadImageFromBlob(sheetBlob, 'sprite_sheet.png')
  try {
    const extracted: ExtractedSheetFrame[] = []
    await runInBatches(
      frames,
      async (frame, position) => {
        const frameWidth = Math.max(1, Math.round(frame.w ?? frame.width ?? index.frame_size?.w ?? 1))
        const frameHeight = Math.max(1, Math.round(frame.h ?? frame.height ?? index.frame_size?.h ?? 1))
        const canvas = document.createElement('canvas')
        canvas.width = frameWidth
        canvas.height = frameHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Sprite sheet import canvas creation failed')
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(
          loaded.image,
          Math.round(frame.x),
          Math.round(frame.y),
          frameWidth,
          frameHeight,
          0,
          0,
          frameWidth,
          frameHeight,
        )
        extracted[position] = {
          blob: await canvasToBlob(canvas),
          name: `${options.baseName ?? 'video_frame'}_${String(position + 1).padStart(3, '0')}.png`,
          index: frame.i ?? position,
        }
        return true
      },
      {
        batchSize: options.batchSize ?? 3,
        onProgress: ({ done, total }) => options.onProgress?.(done, total),
      },
    )
    return extracted
  } finally {
    URL.revokeObjectURL(loaded.url)
  }
}
