import JSZip from 'jszip'
import type { CollisionBlockMode, CollisionCell, LoadedImage, ObstacleAsset, ObstacleExportJson, ObstacleGridSize, ObstacleInstance } from './obstacleModel'

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Export failed'))), 'image/png')
  })
}

export async function imageBlobToZip(
  imageBlob: Blob,
  imageName: string,
  zipName: string,
  manifest: Record<string, unknown> = {},
) {
  const zip = new JSZip()
  zip.file(imageName, imageBlob)
  zip.file('manifest.json', JSON.stringify({
    version: 1,
    image: imageName,
    exportedAt: new Date().toISOString(),
    ...manifest,
  }, null, 2))
  const zipBlob = await zip.generateAsync({ type: 'blob' })
  downloadBlob(zipBlob, zipName)
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('Blob read failed'))
    reader.readAsDataURL(blob)
  })
}

export function loadImageFile(file: File): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => resolve({ file, url, image, width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Image failed to load'))
    }
    image.src = url
  })
}

export function buildObstacleJson(
  mapImage: LoadedImage,
  gridSize: ObstacleGridSize,
  collisionBlockMode: CollisionBlockMode,
  assets: ObstacleAsset[],
  instances: ObstacleInstance[],
  collisionCells: CollisionCell[],
): ObstacleExportJson {
  const ignoredByTags = collisionBlockMode === 'allEntityObstacle' ? ['ignoreCollisionEnemy'] : []
  return {
    version: 1,
    gridSize,
    mapWidth: mapImage.width,
    mapHeight: mapImage.height,
    collisionRule: {
      blockMode: collisionBlockMode,
      affects: collisionBlockMode === 'playerOnlyBoundary' ? 'player' : 'allEntities',
      ignoredByTags,
    },
    assets: assets.map((asset) => ({
      id: asset.id,
      name: asset.name,
      width: asset.width,
      height: asset.height,
    })),
    obstacles: instances.map((item) => ({
      ...item,
      gridX: item.gridX ?? Math.floor(item.x / gridSize),
      gridY: item.gridY ?? Math.floor(item.y / gridSize),
      collision: {
        type: item.collisionType ?? item.collisionMode,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
      },
    })),
    collisionCells: collisionCells.map((cell) => ({
      ...cell,
      blockMode: cell.blockMode ?? collisionBlockMode,
    })),
  }
}

export async function renderMapWithObstacles(
  mapImage: LoadedImage,
  assets: ObstacleAsset[],
  instances: ObstacleInstance[],
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  canvas.width = mapImage.width
  canvas.height = mapImage.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas creation failed')
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(mapImage.image, 0, 0)
  const assetById = new Map(assets.map((asset) => [asset.id, asset]))
  for (const instance of instances) {
    const asset = assetById.get(instance.assetId)
    if (!asset) continue
    ctx.globalAlpha = instance.opacity
    ctx.drawImage(asset.image, instance.x, instance.y, instance.width, instance.height)
  }
  ctx.globalAlpha = 1
  return canvas
}
