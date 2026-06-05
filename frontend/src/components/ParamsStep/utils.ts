/** 宸ュ叿鍑芥暟锛氬抚澶勭悊銆佺敾甯冦€佹姞鍥剧瓑 */
import { resizeImageToBlobCanvasLegacy } from './utilsResizeCanvasLegacy'

/** 瑁佸垏鍥剧墖锛氭寜 left/top/right/bottom 瑁佹帀杈圭紭 */
export async function cropImageBlob(
  blob: Blob,
  crop: { left: number; top: number; right: number; bottom: number }
): Promise<Blob> {
  const { left, top, right, bottom } = crop
  if (left === 0 && top === 0 && right === 0 && bottom === 0) return blob
  const img = await (typeof createImageBitmap === 'function'
    ? createImageBitmap(blob)
    : new Promise<HTMLImageElement>((resolve, reject) => {
        const im = new Image()
        const url = URL.createObjectURL(blob)
        im.onload = () => { URL.revokeObjectURL(url); resolve(im) }
        im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('ERR_IMAGE_LOAD')) }
        im.src = url
      }))
  const srcW = img.width
  const srcH = img.height
  const dstW = Math.max(1, srcW - left - right)
  const dstH = Math.max(1, srcH - top - bottom)
  const canvas = document.createElement('canvas')
  canvas.width = dstW
  canvas.height = dstH
  const ctx = canvas.getContext('2d')
  if (!ctx) return blob
  ctx.drawImage(img, left, top, dstW, dstH, 0, 0, dstW, dstH)
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('ERR_TOBLOB'))), 'image/png', 0.95)
  })
}

/** 鍗曞浘缂╂斁锛氭寜姣斾緥缂╂斁鑷崇洰鏍囧昂瀵稿唴锛屽眳涓斁缃€俻ixelated=true 鏃朵娇鐢?PS 椋庢牸鏈€杩戦偦锛堢‖杈圭紭锛夛紱false 鏃跺钩婊戠缉鏀?*/
export async function resizeImageToBlob(
  blob: Blob,
  targetW: number,
  targetH: number,
  keepAspect = true,
  pixelated = false
): Promise<Blob> {
  if (pixelated) {
    return resizeImageToBlobNearestNeighborPS(blob, targetW, targetH, keepAspect)
  }
  return resizeImageToBlobCanvasLegacy(blob, targetW, targetH, keepAspect, false)
}

/**
 * PS 椋庢牸纭缉鏀撅細閫愬儚绱犳渶杩戦偦閲囨牱锛屾ā浠?Photoshop銆岄偦杩戯紙纭竟缂橈級銆嶉噸閲囨牱銆?
 * Canvas drawImage + imageSmoothingEnabled=false 鍦?1024鈫?92 绛夐潪鏁存暟鍊嶇缉灏忔椂浼氭ā绯婏紝
 * 鏈嚱鏁颁娇鐢?ImageData 鎵嬪姩閲囨牱锛屼繚璇佽竟缂橀攼鍒┿€?
 */
export async function resizeImageToBlobNearestNeighborPS(
  blob: Blob,
  targetW: number,
  targetH: number,
  keepAspect: boolean
): Promise<Blob> {
  const img = await (typeof createImageBitmap === 'function'
    ? createImageBitmap(blob)
    : new Promise<HTMLImageElement>((resolve, reject) => {
        const im = new Image()
        const url = URL.createObjectURL(blob)
        im.onload = () => { URL.revokeObjectURL(url); resolve(im) }
        im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('ERR_IMAGE_LOAD')) }
        im.src = url
      }))
  const srcW = img.width
  const srcH = img.height
  const tmp = document.createElement('canvas')
  tmp.width = srcW
  tmp.height = srcH
  const tmpCtx = tmp.getContext('2d')
  if (!tmpCtx) return blob
  tmpCtx.drawImage(img, 0, 0)
  const srcData = tmpCtx.getImageData(0, 0, srcW, srcH).data

  let cw: number, ch: number, cx: number, cy: number
  if (keepAspect) {
    const scale = Math.min(targetW / srcW, targetH / srcH)
    cw = Math.max(1, Math.round(srcW * scale))
    ch = Math.max(1, Math.round(srcH * scale))
    cx = Math.round((targetW - cw) / 2)
    cy = Math.round((targetH - ch) / 2)
  } else {
    cw = targetW
    ch = targetH
    cx = 0
    cy = 0
  }

  const out = document.createElement('canvas')
  out.width = targetW
  out.height = targetH
  const outCtx = out.getContext('2d')
  if (!outCtx) return blob
  const outImg = outCtx.createImageData(targetW, targetH)
  const dst = outImg.data

  for (let dy = 0; dy < targetH; dy++) {
    for (let dx = 0; dx < targetW; dx++) {
      const dstIdx = (dy * targetW + dx) * 4
      if (dx < cx || dx >= cx + cw || dy < cy || dy >= cy + ch) {
        dst[dstIdx] = 0
        dst[dstIdx + 1] = 0
        dst[dstIdx + 2] = 0
        dst[dstIdx + 3] = 0
        continue
      }
      const rx = dx - cx
      const ry = dy - cy
      const sx = Math.min(srcW - 1, Math.max(0, Math.floor((rx + 0.5) * srcW / cw)))
      const sy = Math.min(srcH - 1, Math.max(0, Math.floor((ry + 0.5) * srcH / ch)))
      const srcIdx = (sy * srcW + sx) * 4
      dst[dstIdx] = srcData[srcIdx]
      dst[dstIdx + 1] = srcData[srcIdx + 1]
      dst[dstIdx + 2] = srcData[srcIdx + 2]
      dst[dstIdx + 3] = srcData[srcIdx + 3]
    }
  }
  outCtx.putImageData(outImg, 0, 0)
  return new Promise((resolve, reject) => {
    out.toBlob((b) => (b ? resolve(b) : reject(new Error('ERR_TOBLOB'))), 'image/png', 0.95)
  })
}

/** 鍥剧墖鎸?琛屽垏鍒嗭紝琛岄珮=h/3銆傚皢绗?琛屼笅绉?琛岄珮搴︼紝绗?琛屽鍒跺埌绗?琛屼綅缃苟姘村钩缈昏浆銆傝緭鍑洪珮搴?= h + rowHeight */
export async function extendImageBottom(blob: Blob, _bottomPx: number): Promise<Blob> {
  void _bottomPx
  const img = await (typeof createImageBitmap === 'function'
    ? createImageBitmap(blob)
    : new Promise<HTMLImageElement>((resolve, reject) => {
        const im = new Image()
        const url = URL.createObjectURL(blob)
        im.onload = () => { URL.revokeObjectURL(url); resolve(im) }
        im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('ERR_IMAGE_LOAD')) }
        im.src = url
      }))
  const w = img.width
  const h = img.height
  const rowH = Math.floor(h / 3)
  if (rowH <= 0) return blob
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h + rowH
  const ctx = canvas.getContext('2d')
  if (!ctx) return blob
  ctx.drawImage(img, 0, 0, w, rowH, 0, 0, w, rowH)
  ctx.drawImage(img, 0, rowH, w, rowH, 0, rowH, w, rowH)
  ctx.save()
  ctx.translate(w, 2 * rowH)
  ctx.scale(-1, 1)
  ctx.drawImage(img, 0, rowH, w, rowH, 0, 0, w, rowH)
  ctx.restore()
  ctx.drawImage(img, 0, 2 * rowH, w, rowH, 0, 3 * rowH, w, rowH)
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('ERR_TOBLOB'))), 'image/png', 0.95)
  })
}

export function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function resizeFrameToCanvas(
  img: HTMLImageElement | ImageBitmap,
  targetW: number,
  targetH: number,
  padding: number
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = targetW
  canvas.height = targetH
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  const innerW = targetW - padding * 2
  const innerH = targetH - padding * 2
  const scale = Math.min(innerW / img.width, innerH / img.height, 1)
  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)
  const x = padding + (innerW - w) / 2
  const y = padding + (innerH - h) / 2
  ctx.clearRect(0, 0, targetW, targetH)
  ctx.drawImage(img, x, y, w, h)
  return canvas
}

/** 灏嗗抚缂╂斁鑷崇洰鏍囧昂瀵革紙涓?resizeFrameToCanvas 閫昏緫涓€鑷达級锛岀敤浜庢弿杈瑰墠缂╁皬浠ュ姞閫?*/
export async function resizeFrameToBlob(
  blob: Blob,
  targetW: number,
  targetH: number,
  padding: number
): Promise<Blob> {
  const img = await (typeof createImageBitmap === 'function'
    ? createImageBitmap(blob)
    : new Promise<HTMLImageElement>((resolve, reject) => {
        const im = new Image()
        const url = URL.createObjectURL(blob)
        im.onload = () => { URL.revokeObjectURL(url); resolve(im) }
        im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('ERR_IMAGE_LOAD')) }
        im.src = url
      }))
  const canvas = resizeFrameToCanvas(img, targetW, targetH, padding)
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('ERR_TOBLOB'))), 'image/png', 0.95)
  })
}

const YIELD_BATCH = 8000

function yieldToMain(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0))
}

export async function applyInnerStroke(blob: Blob, strokeWidth: number, strokeColor: string): Promise<Blob> {
  if (strokeWidth <= 0) return blob
  const img = await (typeof createImageBitmap === 'function'
    ? createImageBitmap(blob)
    : new Promise<HTMLImageElement>((resolve, reject) => {
        const im = new Image()
        const url = URL.createObjectURL(blob)
        im.onload = () => { URL.revokeObjectURL(url); resolve(im) }
        im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('ERR_IMAGE_LOAD')) }
        im.src = url
      }))
  const w = img.width
  const h = img.height
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return blob
  ctx.drawImage(img, 0, 0)
  const imageData = ctx.getImageData(0, 0, w, h)
  const data = imageData.data

  const alphaTransparent = 5
  const m = strokeColor.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i)
  const sr = m ? parseInt(m[1], 16) : 0
  const sg = m ? parseInt(m[2], 16) : 0
  const sb = m ? parseInt(m[3], 16) : 0

  const INF = 0xffff
  const dist = new Uint16Array(w * h)
  const total = w * h
  for (let i = 0; i < total; i += YIELD_BATCH) {
    const end = Math.min(i + YIELD_BATCH, total)
    for (let j = i; j < end; j++) {
      dist[j] = data[j * 4 + 3]! <= alphaTransparent ? 0 : INF
    }
    if (end < total) await yieldToMain()
  }

  const queue: number[] = []
  for (let i = 0; i < total; i++) {
    if (dist[i] === 0) queue.push(i)
  }
  const dx = [-1, -1, -1, 0, 0, 1, 1, 1]
  const dy = [-1, 0, 1, -1, 1, -1, 0, 1]
  while (queue.length > 0) {
    let processed = 0
    while (queue.length > 0 && processed < YIELD_BATCH) {
      const idx = queue.shift()!
      const d = dist[idx]
      const x = idx % w
      const y = (idx / w) | 0
      for (let k = 0; k < 8; k++) {
        const nx = x + dx[k]!
        const ny = y + dy[k]!
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
        const ni = ny * w + nx
        if (dist[ni] !== INF) continue
        dist[ni] = d + 1
        queue.push(ni)
      }
      processed++
    }
    if (queue.length > 0) await yieldToMain()
  }

  const stroked = new Uint8Array(w * h)
  for (let i = 0; i < total; i += YIELD_BATCH) {
    const end = Math.min(i + YIELD_BATCH, total)
    for (let j = i; j < end; j++) {
      const d = dist[j]
      if (d >= 1 && d <= strokeWidth) {
        data[j * 4] = sr
        data[j * 4 + 1] = sg
        data[j * 4 + 2] = sb
        data[j * 4 + 3] = 255
        stroked[j] = 1
      }
    }
    if (end < total) await yieldToMain()
  }

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const a = data[i * 4 + 3]!
      if (a > 0 && a <= alphaTransparent) {
        for (let k = 0; k < 8; k++) {
          const ni = (y + dy[k]!) * w + (x + dx[k]!)
          if (stroked[ni]) {
            data[i * 4] = sr
            data[i * 4 + 1] = sg
            data[i * 4 + 2] = sb
            data[i * 4 + 3] = 255
            break
          }
        }
      }
    }
    if (y % 32 === 0) await yieldToMain()
  }

  ctx.putImageData(imageData, 0, 0)
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('ERR_TOBLOB'))), 'image/png', 0.95)
  })
}

export function composeSpriteSheetClient(
  frames: { blob: Blob; dataUrl: string }[],
  timestamps: number[],
  targetW: number,
  targetH: number,
  padding: number,
  spacing: number,
  columns: number,
  resizeFn: (img: HTMLImageElement, tw: number, th: number, pad: number) => HTMLCanvasElement
): Promise<{ pngBlob: Blob; index: object }> {
  return new Promise((resolve, reject) => {
    const cols = Math.max(1, columns)
    const rows = Math.ceil(frames.length / cols)
    const sheetW = cols * (targetW + spacing) - spacing
    const sheetH = rows * (targetH + spacing) - spacing
    const sheet = document.createElement('canvas')
    sheet.width = sheetW
    sheet.height = sheetH
    const ctx = sheet.getContext('2d')
    if (!ctx) return reject(new Error('ERR_CANVAS_CREATE'))
    ctx.clearRect(0, 0, sheetW, sheetH)

    const framesIndex: { i: number; x: number; y: number; w: number; h: number; t: number }[] = []
    let loaded = 0

    const processFrame = (i: number) => {
      const img = new Image()
      img.onload = () => {
        const resized = resizeFn(img, targetW, targetH, padding)
        const col = i % cols
        const row = Math.floor(i / cols)
        const x = col * (targetW + spacing)
        const y = row * (targetH + spacing)
        ctx.drawImage(resized, x, y, targetW, targetH)
        framesIndex.push({
          i,
          x,
          y,
          w: targetW,
          h: targetH,
          t: Math.round((timestamps[i] ?? 0) * 1000) / 1000,
        })
        loaded++
        if (loaded === frames.length) {
          sheet.toBlob(
            (blob) => {
              if (blob) {
                resolve({
                  pngBlob: blob,
                  index: {
                    version: '1.0',
                    frame_size: { w: targetW, h: targetH },
                    sheet_size: { w: sheetW, h: sheetH },
                    frames: framesIndex,
                  },
                })
              } else reject(new Error('ERR_EXPORT'))
            },
            'image/png',
            0.95
          )
        }
      }
      img.onerror = () => reject(new Error('ERR_FRAME_LOAD'))
      img.src = frames[i].dataUrl
    }

    for (let i = 0; i < frames.length; i++) processFrame(i)
  })
}

export function applyBrushMask(
  baseDataUrl: string,
  maskDataUrl: string
): Promise<{ blob: Blob; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const baseImg = new Image()
    const maskImg = new Image()
    baseImg.onload = () => {
      maskImg.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = baseImg.width
        canvas.height = baseImg.height
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('ERR_CANVAS_CREATE'))
        ctx.drawImage(baseImg, 0, 0)
        ctx.globalCompositeOperation = 'destination-out'
        ctx.drawImage(maskImg, 0, 0)
        ctx.globalCompositeOperation = 'source-over'
        const dataUrl = canvas.toDataURL('image/png')
        canvas.toBlob(
          (blob) => (blob ? resolve({ blob, dataUrl }) : reject(new Error('ERR_EXPORT'))),
          'image/png',
          0.95
        )
      }
      maskImg.onerror = () => reject(new Error('ERR_MASK_LOAD'))
      maskImg.src = maskDataUrl
    }
    baseImg.onerror = () => reject(new Error('ERR_BASE_LOAD'))
    baseImg.src = baseDataUrl
  })
}

/** 鑾峰彇鍥剧墖宸︿笂瑙掑儚绱犵殑 RGB 棰滆壊 */
export async function getTopLeftPixelColor(blob: Blob): Promise<{ r: number; g: number; b: number }> {
  const img = await (typeof createImageBitmap === 'function'
    ? createImageBitmap(blob)
    : new Promise<HTMLImageElement>((resolve, reject) => {
        const im = new Image()
        const url = URL.createObjectURL(blob)
        im.onload = () => { URL.revokeObjectURL(url); resolve(im) }
        im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('ERR_IMAGE_LOAD')) }
        im.src = url
      }))
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('ERR_CANVAS_CREATE')
  ctx.drawImage(img, 0, 0)
  const d = ctx.getImageData(0, 0, 1, 1).data
  return { r: d[0] ?? 0, g: d[1] ?? 0, b: d[2] ?? 0 }
}

export function applyChromaKey(
  dataUrl: string,
  bgR: number,
  bgG: number,
  bgB: number,
  tolerance: number,
  feather: number
): Promise<{ blob: Blob; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('ERR_CANVAS_CREATE'))
      ctx.drawImage(img, 0, 0)
      const id = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const d = id.data
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i]
        const g = d[i + 1]
        const b = d[i + 2]
        const dist = Math.sqrt((r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2)
        if (dist <= tolerance) {
          d[i + 3] = 0
        } else if (feather > 0 && dist < tolerance + feather) {
          const t = (dist - tolerance) / feather
          d[i + 3] = Math.round(255 * Math.min(1, t))
        }
      }
      ctx.putImageData(id, 0, 0)
      const resultDataUrl = canvas.toDataURL('image/png')
      canvas.toBlob(
        (blob) => (blob ? resolve({ blob, dataUrl: resultDataUrl }) : reject(new Error('ERR_EXPORT'))),
        'image/png',
        0.95
      )
    }
    img.onerror = () => reject(new Error('ERR_IMAGE_LOAD'))
    img.src = dataUrl
  })
}

/**
 * ChromaKey 鑹插害閿細杩炵画鍖哄煙锛堜笌宸︿笂瑙掕繛閫氾級鐢?80 瀹瑰樊锛岄潪杩炵画鍖哄煙鐢?30 瀹瑰樊銆?
 * 鍙栬壊浠嶄负宸︿笂瑙掔涓€鍍忕礌銆?
 */
export function applyChromaKeyHybridTolerance(
  dataUrl: string,
  bgR: number,
  bgG: number,
  bgB: number,
  contiguousTolerance: number,
  nonContiguousTolerance: number,
  feather: number
): Promise<{ blob: Blob; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('ERR_CANVAS_CREATE'))
      ctx.drawImage(img, 0, 0)
      const id = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const d = id.data
      const w = canvas.width
      const h = canvas.height

      const idx = (x: number, y: number) => (y * w + x) * 4
      const dist = (i: number) =>
        Math.sqrt(
          (d[i]! - bgR) ** 2 + (d[i + 1]! - bgG) ** 2 + (d[i + 2]! - bgB) ** 2
        )
      const matchContiguous = (i: number) => dist(i) <= contiguousTolerance

      const contiguous = new Set<number>()
      const start = idx(0, 0)
      if (matchContiguous(start)) {
        const stack: [number, number][] = [[0, 0]]
        contiguous.add(start)
        const vis = new Set<number>()
        vis.add(start)
        const dx = [0, 1, 0, -1]
        const dy = [-1, 0, 1, 0]
        while (stack.length > 0) {
          const [x, y] = stack.pop()!
          for (let k = 0; k < 4; k++) {
            const nx = x + dx[k]!
            const ny = y + dy[k]!
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
            const i = idx(nx, ny)
            if (vis.has(i)) continue
            vis.add(i)
            if (matchContiguous(i)) {
              contiguous.add(i)
              stack.push([nx, ny])
            }
          }
        }
      }

      for (let i = 0; i < d.length; i += 4) {
        const dst = Math.sqrt(
          (d[i]! - bgR) ** 2 + (d[i + 1]! - bgG) ** 2 + (d[i + 2]! - bgB) ** 2
        )
        const isContiguous = contiguous.has(i)
        const tol = isContiguous ? contiguousTolerance : nonContiguousTolerance
        if (dst <= tol) {
          d[i + 3] = 0
        } else if (feather > 0 && dst < tol + feather) {
          const t = (dst - tol) / feather
          d[i + 3] = Math.round(255 * Math.min(1, t))
        }
      }
      ctx.putImageData(id, 0, 0)
      const resultDataUrl = canvas.toDataURL('image/png')
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve({ blob, dataUrl: resultDataUrl })
            : reject(new Error('ERR_EXPORT')),
        'image/png',
        0.95
      )
    }
    img.onerror = () => reject(new Error('ERR_IMAGE_LOAD'))
    img.src = dataUrl
  })
}

/**
 * ChromaKey 鑷€傚簲锛氶潪杩炵画鍖哄煙鎶犲浘鏃讹紝鑻ユ煇鍖哄煙鍍忕礌鏁?> 20锛岃鍖哄煙瀹瑰樊 +40銆?
 * 杩炵画鍖哄煙浠嶇敤 80 瀹瑰樊銆?
 */
export function applyChromaKeyAdaptiveRegion(
  dataUrl: string,
  bgR: number,
  bgG: number,
  bgB: number,
  contiguousTolerance: number,
  nonContiguousTolerance: number,
  largeRegionThreshold: number,
  largeRegionToleranceBonus: number,
  feather: number
): Promise<{ blob: Blob; dataUrl: string }> {
  void feather
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('ERR_CANVAS_CREATE'))
      ctx.drawImage(img, 0, 0)
      const id = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const d = id.data
      const w = canvas.width
      const h = canvas.height

      const idx = (x: number, y: number) => (y * w + x) * 4
      const dist = (i: number) =>
        Math.sqrt(
          (d[i]! - bgR) ** 2 + (d[i + 1]! - bgG) ** 2 + (d[i + 2]! - bgB) ** 2
        )
      const matchContiguous = (i: number) => dist(i) <= contiguousTolerance

      const contiguous = new Set<number>()
      const start = idx(0, 0)
      if (matchContiguous(start)) {
        const stack: [number, number][] = [[0, 0]]
        contiguous.add(start)
        const vis = new Set<number>()
        vis.add(start)
        const dx = [0, 1, 0, -1]
        const dy = [-1, 0, 1, 0]
        while (stack.length > 0) {
          const [x, y] = stack.pop()!
          for (let k = 0; k < 4; k++) {
            const nx = x + dx[k]!
            const ny = y + dy[k]!
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
            const i = idx(nx, ny)
            if (vis.has(i)) continue
            vis.add(i)
            if (matchContiguous(i)) {
              contiguous.add(i)
              stack.push([nx, ny])
            }
          }
        }
      }

      const nonContiguousCandidates = new Set<number>()
      const groupTolerance = Math.max(
        nonContiguousTolerance + largeRegionToleranceBonus,
        contiguousTolerance
      )
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = idx(x, y)
          if (contiguous.has(i)) continue
          if (dist(i) <= groupTolerance) nonContiguousCandidates.add(i)
        }
      }

      const pixelToRegion = new Map<number, number>()
      const regionSizes: number[] = []
      const vis = new Set<number>()
      const dx = [0, 1, 0, -1]
      const dy = [-1, 0, 1, 0]
      let regionId = 0
      for (const seed of nonContiguousCandidates) {
        if (vis.has(seed)) continue
        const stack = [seed]
        vis.add(seed)
        const members: number[] = []
        while (stack.length > 0) {
          const i = stack.pop()!
          members.push(i)
          const x = (i / 4) % w
          const y = Math.floor(i / 4 / w)
          for (let k = 0; k < 4; k++) {
            const nx = x + dx[k]!
            const ny = y + dy[k]!
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
            const ni = idx(nx, ny)
            if (vis.has(ni) || !nonContiguousCandidates.has(ni)) continue
            vis.add(ni)
            stack.push(ni)
          }
        }
        for (const m of members) pixelToRegion.set(m, regionId)
        regionSizes.push(members.length)
        regionId++
      }

      const effectiveTol = (rId: number) =>
        regionSizes[rId]! > largeRegionThreshold
          ? nonContiguousTolerance + largeRegionToleranceBonus
          : nonContiguousTolerance

      for (let i = 0; i < d.length; i += 4) {
        const dst = Math.sqrt(
          (d[i]! - bgR) ** 2 + (d[i + 1]! - bgG) ** 2 + (d[i + 2]! - bgB) ** 2
        )
        if (contiguous.has(i)) {
          const tol = contiguousTolerance
          if (dst <= tol) d[i + 3] = 0
          else if (feather > 0 && dst < tol + feather) {
            const t = (dst - tol) / feather
            d[i + 3] = Math.round(255 * Math.min(1, t))
          }
        } else {
          const rId = pixelToRegion.get(i)
          const tol =
            rId !== undefined ? effectiveTol(rId) : nonContiguousTolerance
          if (dst <= tol) d[i + 3] = 0
          else if (feather > 0 && dst < tol + feather) {
            const t = (dst - tol) / feather
            d[i + 3] = Math.round(255 * Math.min(1, t))
          }
        }
      }
      ctx.putImageData(id, 0, 0)
      const resultDataUrl = canvas.toDataURL('image/png')
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve({ blob, dataUrl: resultDataUrl })
            : reject(new Error('ERR_EXPORT')),
        'image/png',
        0.95
      )
    }
    img.onerror = () => reject(new Error('ERR_IMAGE_LOAD'))
    img.src = dataUrl
  })
}

/**
 * 鍩轰簬宸︿笂瑙?0,0)鍍忕礌鐨勮繛閫氬煙鍘昏儗锛氫粎绉婚櫎涓庣涓€琛岀涓€鍍忕礌杩為€氱殑鍚岃壊鍖哄煙锛?
 * 涓嶄細绉婚櫎鍥惧儚涓棿瀛ょ珛鐨勫悓鑹插儚绱犮€?
 */
export function applyChromaKeyContiguousFromTopLeft(
  dataUrl: string,
  bgR: number,
  bgG: number,
  bgB: number,
  tolerance: number,
  feather: number
): Promise<{ blob: Blob; dataUrl: string }> {
  void feather // 淇濈暀鍙傛暟涓?applyChromaKey 涓€鑷?
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('ERR_CANVAS_CREATE'))
      ctx.drawImage(img, 0, 0)
      const id = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const d = id.data
      const w = canvas.width
      const h = canvas.height

      const idx = (x: number, y: number) => (y * w + x) * 4
      const dist = (i: number) =>
        Math.sqrt(
          (d[i]! - bgR) ** 2 + (d[i + 1]! - bgG) ** 2 + (d[i + 2]! - bgB) ** 2
        )
      const match = (i: number) => dist(i) <= tolerance

      const toRemove = new Set<number>()
      const start = idx(0, 0)
      if (!match(start)) {
        ctx.putImageData(id, 0, 0)
        canvas.toBlob(
          (blob) =>
            blob
              ? resolve({ blob, dataUrl: canvas.toDataURL('image/png') })
              : reject(new Error('ERR_EXPORT')),
          'image/png',
          0.95
        )
        return
      }

      const stack: [number, number][] = [[0, 0]]
      toRemove.add(idx(0, 0))
      const vis = new Set<number>()
      vis.add(idx(0, 0))
      const dx = [0, 1, 0, -1]
      const dy = [-1, 0, 1, 0]
      while (stack.length > 0) {
        const [x, y] = stack.pop()!
        for (let k = 0; k < 4; k++) {
          const nx = x + dx[k]!
          const ny = y + dy[k]!
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
          const i = idx(nx, ny)
          if (vis.has(i)) continue
          vis.add(i)
          if (match(i)) {
            toRemove.add(i)
            stack.push([nx, ny])
          }
        }
      }

      for (const i of toRemove) {
        d[i + 3] = 0
      }
      ctx.putImageData(id, 0, 0)
      const resultDataUrl = canvas.toDataURL('image/png')
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve({ blob, dataUrl: resultDataUrl })
            : reject(new Error('ERR_EXPORT')),
        'image/png',
        0.95
      )
    }
    img.onerror = () => reject(new Error('ERR_IMAGE_LOAD'))
    img.src = dataUrl
  })
}

export function imageFingerprint(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      const ctx = c.getContext('2d')
      if (!ctx) return reject(new Error('ERR_CANVAS_CREATE'))
      ctx.drawImage(img, 0, 0)
      const d = ctx.getImageData(0, 0, c.width, c.height).data
      let h1 = 0
      let h2 = 0
      for (let i = 0; i < d.length; i += 16) {
        h1 = ((h1 << 5) - h1 + d[i]! + d[i + 1]! + d[i + 2]! + d[i + 3]!) | 0
        h2 = ((h2 << 3) + h2 + d[i + 4]! + d[i + 5]! + d[i + 6]! + d[i + 7]!) | 0
      }
      resolve(`${h1}_${h2}`)
    }
    img.onerror = () => reject(new Error('ERR_IMAGE_LOAD'))
    img.src = dataUrl
  })
}

export async function analyzeDuplicateFrames(
  frames: { dataUrl: string }[]
): Promise<Map<number, { groupId: number; totalInGroup: number }>> {
  const hashes: string[] = []
  for (let i = 0; i < frames.length; i++) {
    hashes[i] = await imageFingerprint(frames[i]!.dataUrl)
  }
  const hashToIndices = new Map<string, number[]>()
  hashes.forEach((hash, i) => {
    const list = hashToIndices.get(hash) || []
    list.push(i)
    hashToIndices.set(hash, list)
  })
  const result = new Map<number, { groupId: number; totalInGroup: number }>()
  let groupId = 0
  hashToIndices.forEach((indices) => {
    if (indices.length > 1) {
      indices.forEach((i) => result.set(i, { groupId, totalInGroup: indices.length }))
      groupId++
    }
  })
  return result
}
