export type LoadedImage = {
  image: HTMLImageElement
  url: string
  blob: Blob
  name: string
  width: number
  height: number
}

export function makeId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID()}`
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
}

export function safeBaseName(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_') || 'asset'
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Canvas export failed'))), type, quality)
  })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('Blob read failed'))
    reader.readAsDataURL(blob)
  })
}

export async function loadImageFromBlob(blob: Blob, name = 'image.png'): Promise<LoadedImage> {
  const url = URL.createObjectURL(blob)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error(`${name} failed to load`))
      img.src = url
    })
    return {
      image,
      url,
      blob,
      name,
      width: image.naturalWidth,
      height: image.naturalHeight,
    }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

export async function normalizeImageToCanvas(blob: Blob, name: string, canvasSize: number): Promise<Blob> {
  const loaded = await loadImageFromBlob(blob, name)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = canvasSize
    canvas.height = canvasSize
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Frame canvas creation failed')
    ctx.imageSmoothingEnabled = false

    const scale = Math.min(canvasSize / loaded.width, canvasSize / loaded.height, 1)
    const width = Math.max(1, Math.round(loaded.width * scale))
    const height = Math.max(1, Math.round(loaded.height * scale))
    const x = Math.round((canvasSize - width) / 2)
    const y = Math.round(canvasSize - height)
    ctx.drawImage(loaded.image, x, y, width, height)
    return await canvasToBlob(canvas)
  } finally {
    URL.revokeObjectURL(loaded.url)
  }
}
