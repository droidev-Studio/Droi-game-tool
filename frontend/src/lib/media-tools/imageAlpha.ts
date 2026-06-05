import { loadImageFromBlob } from './imageLoader'

export async function hasUsefulAlpha(blob: Blob): Promise<boolean> {
  const loaded = await loadImageFromBlob(blob)
  try {
    const maxSide = 128
    const scale = Math.min(1, maxSide / Math.max(loaded.width, loaded.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(loaded.width * scale))
    canvas.height = Math.max(1, Math.round(loaded.height * scale))
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return false
    ctx.drawImage(loaded.image, 0, 0, canvas.width, canvas.height)
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    let transparentPixels = 0
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 245) transparentPixels += 1
    }
    return transparentPixels / (data.length / 4) > 0.01
  } finally {
    URL.revokeObjectURL(loaded.url)
  }
}
