import { canvasToBlob, loadImageFromBlob } from './imageLoader'

export type LocalMatteMode = 'none' | 'chroma' | 'luma'

export type LocalMatteOptions = {
  mode: LocalMatteMode
  keyColor: string
  threshold: number
  softness: number
  despill: number
  halo: number
  lumaBlack: number
  lumaWhite: number
  lumaGamma: number
  lumaStrength: number
  greenToBlack: boolean
  semitransparentToBlack: boolean
}

export const DEFAULT_LOCAL_MATTE_OPTIONS: LocalMatteOptions = {
  mode: 'chroma',
  keyColor: '#00ff00',
  threshold: 72,
  softness: 24,
  despill: 0.85,
  halo: 1,
  lumaBlack: 24,
  lumaWhite: 210,
  lumaGamma: 0.75,
  lumaStrength: 1.25,
  greenToBlack: false,
  semitransparentToBlack: false,
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.trim().replace(/^#/, '')
  const full = normalized.length === 3
    ? normalized.split('').map((part) => part + part).join('')
    : normalized
  const value = Number.parseInt(full || '00ff00', 16)
  if (!Number.isFinite(value)) return { r: 0, g: 255, b: 0 }
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  }
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((value) => clampByte(value).toString(16).padStart(2, '0')).join('')}`
}

function colorDistance(r: number, g: number, b: number, key: { r: number; g: number; b: number }) {
  const dr = r - key.r
  const dg = g - key.g
  const db = b - key.b
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

function erodeAlpha(data: Uint8ClampedArray, width: number, height: number, radius: number) {
  if (radius <= 0) return
  const sourceAlpha = new Uint8ClampedArray(width * height)
  for (let i = 0; i < width * height; i += 1) sourceAlpha[i] = data[i * 4 + 3]
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x
      if (sourceAlpha[idx] === 0) continue
      let minAlpha = sourceAlpha[idx]
      for (let oy = -radius; oy <= radius; oy += 1) {
        for (let ox = -radius; ox <= radius; ox += 1) {
          const nx = x + ox
          const ny = y + oy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            minAlpha = 0
            continue
          }
          minAlpha = Math.min(minAlpha, sourceAlpha[ny * width + nx])
        }
      }
      data[idx * 4 + 3] = minAlpha
    }
  }
}

function applyPostProcess(data: Uint8ClampedArray, options: LocalMatteOptions) {
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3]
    if (options.greenToBlack && alpha > 0 && data[i + 1] > 80 && data[i + 1] > data[i] + 28 && data[i + 1] > data[i + 2] + 28) {
      data[i] = 0
      data[i + 1] = 0
      data[i + 2] = 0
    }
    if (options.semitransparentToBlack && alpha > 0 && alpha < 255) {
      data[i] = 0
      data[i + 1] = 0
      data[i + 2] = 0
    }
  }
}

function applyChroma(data: Uint8ClampedArray, width: number, height: number, options: LocalMatteOptions) {
  const key = hexToRgb(options.keyColor)
  const threshold = Math.max(0, options.threshold)
  const softness = Math.max(0, options.softness)
  const spill = Math.max(0, Math.min(2.5, options.despill))
  const range = Math.max(1, softness)

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const distance = colorDistance(r, g, b, key)
    let alpha = data[i + 3]
    if (distance <= threshold) {
      alpha = 0
    } else if (softness > 0 && distance <= threshold + softness) {
      alpha = clampByte(((distance - threshold) / range) * alpha)
    }
    data[i + 3] = alpha

    if (alpha > 0 && spill > 0) {
      const closeness = clamp01(1 - Math.max(0, distance - threshold) / Math.max(1, threshold + softness))
      const greenDominance = Math.max(0, g - Math.max(r, b))
      const blueDominance = Math.max(0, b - Math.max(r, g))
      if (key.g >= key.r && key.g >= key.b && greenDominance > 0) {
        data[i + 1] = clampByte(g - greenDominance * spill * closeness)
      } else if (key.b >= key.r && key.b >= key.g && blueDominance > 0) {
        data[i + 2] = clampByte(b - blueDominance * spill * closeness)
      }
    }
  }

  erodeAlpha(data, width, height, Math.max(0, Math.round(options.halo)))
}

function applyLuma(data: Uint8ClampedArray, width: number, height: number, options: LocalMatteOptions) {
  const black = Math.max(0, Math.min(254, options.lumaBlack))
  const white = Math.max(black + 1, Math.min(255, options.lumaWhite))
  const gamma = Math.max(0.05, options.lumaGamma)
  const strength = Math.max(0, Math.min(2, options.lumaStrength))
  const range = white - black

  for (let i = 0; i < data.length; i += 4) {
    const luma = (0.2126 * data[i]) + (0.7152 * data[i + 1]) + (0.0722 * data[i + 2])
    const normalized = clamp01((luma - black) / range)
    const alpha = Math.pow(normalized, gamma) * strength
    data[i + 3] = clampByte(data[i + 3] * clamp01(alpha))
  }

  erodeAlpha(data, width, height, Math.max(0, Math.round(options.halo)))
}

export async function applyLocalMatte(blob: Blob, name: string, options: LocalMatteOptions): Promise<Blob> {
  if (options.mode === 'none') return blob
  const loaded = await loadImageFromBlob(blob, name)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = loaded.width
    canvas.height = loaded.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Local matte canvas creation failed')
    ctx.drawImage(loaded.image, 0, 0)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    if (options.mode === 'chroma') {
      applyChroma(imageData.data, canvas.width, canvas.height, options)
    } else if (options.mode === 'luma') {
      applyLuma(imageData.data, canvas.width, canvas.height, options)
    }
    applyPostProcess(imageData.data, options)
    ctx.putImageData(imageData, 0, 0)
    return await canvasToBlob(canvas)
  } finally {
    URL.revokeObjectURL(loaded.url)
  }
}

export async function pickCornerKeyColor(blob: Blob, name: string): Promise<string> {
  const loaded = await loadImageFromBlob(blob, name)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = loaded.width
    canvas.height = loaded.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Key color canvas creation failed')
    ctx.drawImage(loaded.image, 0, 0)
    const samples = [
      ctx.getImageData(0, 0, 1, 1).data,
      ctx.getImageData(Math.max(0, canvas.width - 1), 0, 1, 1).data,
      ctx.getImageData(0, Math.max(0, canvas.height - 1), 1, 1).data,
      ctx.getImageData(Math.max(0, canvas.width - 1), Math.max(0, canvas.height - 1), 1, 1).data,
    ]
    const avg = samples.reduce(
      (acc, sample) => ({
        r: acc.r + sample[0],
        g: acc.g + sample[1],
        b: acc.b + sample[2],
      }),
      { r: 0, g: 0, b: 0 },
    )
    return rgbToHex(avg.r / samples.length, avg.g / samples.length, avg.b / samples.length)
  } finally {
    URL.revokeObjectURL(loaded.url)
  }
}
