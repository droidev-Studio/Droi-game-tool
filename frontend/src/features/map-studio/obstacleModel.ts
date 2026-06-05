export const OBSTACLE_GRID_SIZES = [8, 16, 24, 32, 48, 64, 96, 128] as const

export type ObstacleGridSize = typeof OBSTACLE_GRID_SIZES[number]
export type CollisionTool = 'select' | 'paint' | 'collision' | 'erase'
export type CollisionBlockMode = 'playerOnlyBoundary' | 'allEntityObstacle'

export type LoadedImage = {
  file: File
  url: string
  image: HTMLImageElement
  width: number
  height: number
}

export type ObstacleAsset = LoadedImage & {
  id: string
  name: string
  matteStatus: 'processed' | 'original' | 'failed'
}

export type ObstacleInstance = {
  id: string
  assetId: string
  assetName: string
  gridX?: number
  gridY?: number
  x: number
  y: number
  width: number
  height: number
  scale?: number
  rotation: number
  opacity: number
  collisionMode: 'solid'
  collisionType?: 'solid' | 'decoration' | 'damage' | 'none'
  layer?: number
}

export type CollisionCell = {
  gridX: number
  gridY: number
  x: number
  y: number
  width: number
  height: number
  sourceInstanceId?: string
  blockMode?: CollisionBlockMode
}

export type ObstacleExportJson = {
  version: 1
  gridSize: number
  mapWidth: number
  mapHeight: number
  collisionRule: {
    blockMode: CollisionBlockMode
    affects: 'player' | 'allEntities'
    ignoredByTags: string[]
  }
  assets: Array<{
    id: string
    name: string
    width: number
    height: number
  }>
  obstacles: Array<ObstacleInstance & {
    gridX: number
    gridY: number
    collision: {
      type: 'solid' | 'decoration' | 'damage' | 'none'
      x: number
      y: number
      width: number
      height: number
    }
  }>
  collisionCells: CollisionCell[]
}

export function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function cellKey(gridX: number, gridY: number): string {
  return `${gridX},${gridY}`
}

export function collisionCellKey(cell: CollisionCell): string {
  return cell.sourceInstanceId ? `${cell.sourceInstanceId}:${cell.gridX},${cell.gridY}` : cellKey(cell.gridX, cell.gridY)
}

export function snapCellFromPixel(x: number, y: number, gridSize: number): { gridX: number; gridY: number } {
  return {
    gridX: Math.floor(x / gridSize),
    gridY: Math.floor(y / gridSize),
  }
}

export function makeCollisionCell(
  gridX: number,
  gridY: number,
  gridSize: number,
  sourceInstanceId?: string,
): CollisionCell {
  return {
    gridX,
    gridY,
    x: gridX * gridSize,
    y: gridY * gridSize,
    width: gridSize,
    height: gridSize,
    sourceInstanceId,
  }
}

export function cellsFromRect(
  rect: { x: number; y: number; width: number; height: number },
  gridSize: number,
  mapWidth: number,
  mapHeight: number,
  sourceInstanceId?: string,
): CollisionCell[] {
  const minGridX = Math.max(0, Math.floor(rect.x / gridSize))
  const minGridY = Math.max(0, Math.floor(rect.y / gridSize))
  const maxGridX = Math.min(Math.ceil(mapWidth / gridSize) - 1, Math.floor((rect.x + rect.width - 1) / gridSize))
  const maxGridY = Math.min(Math.ceil(mapHeight / gridSize) - 1, Math.floor((rect.y + rect.height - 1) / gridSize))
  const cells: CollisionCell[] = []
  for (let gridY = minGridY; gridY <= maxGridY; gridY += 1) {
    for (let gridX = minGridX; gridX <= maxGridX; gridX += 1) {
      cells.push(makeCollisionCell(gridX, gridY, gridSize, sourceInstanceId))
    }
  }
  return cells
}

export function replaceCellsForInstance(
  cells: CollisionCell[],
  instanceId: string,
  nextCells: CollisionCell[],
  erasedCellKeys: ReadonlySet<string> = new Set(),
): CollisionCell[] {
  const manualCells = cells.filter((cell) => cell.sourceInstanceId !== instanceId)
  const merged = new Map<string, CollisionCell>()
  for (const cell of manualCells) merged.set(collisionCellKey(cell), cell)
  for (const cell of nextCells) {
    const key = cellKey(cell.gridX, cell.gridY)
    if (!erasedCellKeys.has(key)) merged.set(collisionCellKey(cell), cell)
  }
  return Array.from(merged.values()).sort((a, b) => a.gridY - b.gridY || a.gridX - b.gridX)
}

export function upsertManualCell(cells: CollisionCell[], nextCell: CollisionCell): CollisionCell[] {
  const next = new Map(cells.map((cell) => [collisionCellKey(cell), cell]))
  next.set(cellKey(nextCell.gridX, nextCell.gridY), nextCell)
  return Array.from(next.values()).sort((a, b) => a.gridY - b.gridY || a.gridX - b.gridX)
}

export function removeCell(cells: CollisionCell[], gridX: number, gridY: number): CollisionCell[] {
  const key = cellKey(gridX, gridY)
  return cells.filter((cell) => cellKey(cell.gridX, cell.gridY) !== key)
}
