import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent, type WheelEvent as ReactWheelEvent } from 'react'
import {
  BgColorsOutlined,
  BorderOutlined,
  CheckOutlined,
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  DragOutlined,
  EnvironmentOutlined,
  MinusOutlined,
  PlusOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import { App, Button, Select, Slider, Space, Switch, Typography } from 'antd'
import { useLanguage } from '../../i18n/context'
import { DROI_GAME_TOOL_PROTOCOL, postToolHostMessage, type GameProjectContext } from '../../tools/toolHostBridge'
import { removeBackgroundIfNeeded } from '../../lib/media-tools/matteClient'
import {
  cellKey,
  collisionCellKey,
  cellsFromRect,
  makeCollisionCell,
  makeId,
  OBSTACLE_GRID_SIZES,
  removeCell,
  replaceCellsForInstance,
  snapCellFromPixel,
  upsertManualCell,
  type CollisionCell,
  type CollisionBlockMode,
  type CollisionTool,
  type LoadedImage,
  type ObstacleAsset,
  type ObstacleGridSize,
  type ObstacleInstance,
} from './obstacleModel'
import {
  blobToDataUrl,
  buildObstacleJson,
  canvasToBlob,
  downloadBlob,
  imageBlobToZip,
  loadImageFile,
  renderMapWithObstacles,
} from './obstacleExport'

const { Text, Title } = Typography
const MAX_IMAGE_MB = 30
const MIN_ZOOM = 0.08
const MAX_ZOOM = 6
const MIN_OBSTACLE_SIZE = 4
const MAX_OBSTACLE_SCALE_PERCENT = 400
const RANDOM_OBSTACLE_DENSITY = 0.035
const RANDOM_OBSTACLE_MAX_COUNT = 80
const RANDOM_OBSTACLE_ATTEMPTS = 30

function droiTargetMetadata(projectContext: GameProjectContext | null | undefined, operation: string) {
  const selectedTarget = projectContext?.selectedTarget
  return {
    targetItemId: selectedTarget?.itemId,
    targetAssetPath: selectedTarget?.assetPath,
    expectedArtifactType: selectedTarget?.expectedArtifactType,
    operation,
    sourceTool: 'Droi-Game-Tool',
  }
}
const RANDOM_OBSTACLE_MIN_SCALE = 0.4
const RANDOM_OBSTACLE_MAX_SCALE = 1
const RANDOM_OBSTACLE_MAX_SHORT_SIDE_RATIO = 0.18

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function fitAssetToMap(asset: ObstacleAsset, mapImage: LoadedImage): { width: number; height: number; scale: number } {
  const width = Math.max(MIN_OBSTACLE_SIZE, Math.round(asset.width))
  const height = Math.max(MIN_OBSTACLE_SIZE, Math.round(asset.height))
  const scale = Math.min(1, mapImage.width / width, mapImage.height / height)
  if (scale >= 1) return { width, height, scale: 1 }
  return {
    width: Math.max(MIN_OBSTACLE_SIZE, Math.round(width * scale)),
    height: Math.max(MIN_OBSTACLE_SIZE, Math.round(height * scale)),
    scale,
  }
}

function rectsOverlap(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y
  )
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

const obstacleCopy = {
  en: {
    statusProcessed: 'Background removed',
    statusFailed: 'Matte failed, using original',
    statusOriginal: 'Original',
    chooseMap: 'Please choose a map image.',
    tooLarge: 'AI matte supports images up to {size}MB. Larger images are kept as original.',
    skippedLarge: '{name} is over {size}MB, skipped AI matte and kept original.',
    matteFailedUseOriginal: '{name} matte failed, using original: {error}',
    assetsAdded: 'Obstacle assets added.',
    originalsAdded: 'Original images added.',
    processFailed: 'Obstacle processing failed: {error}',
    importMapFirst: 'Import a map first.',
    importMapAndAssetFirst: 'Import a map and choose an obstacle asset first.',
    baseMap: 'Base Map',
    mapTitle: 'Map Image',
    mapCopy: 'Upload an already generated or stitched PNG, JPG, or WebP map.',
    uploadMap: 'Upload Map Image',
    replaceMap: 'Replace Map Image',
    assetsLabel: 'Obstacle Assets',
    assetsTitle: 'Obstacle Art',
    autoMatte: 'Auto background removal',
    uploadObstacle: 'Upload Obstacle Images',
    multiSelect: 'Multi-select',
    selectedAssets: '{count} assets selected',
    randomPlace: 'Random Place',
    randomPlaced: 'Randomly placed {count} obstacles.',
    selectAssetsFirst: 'Select obstacle assets first.',
    addToCenter: 'Add to Map Center',
    gridLabel: 'Collision Grid',
    gridTitle: 'Collision Grid',
    showGrid: 'Show collision grid',
    collisionRuleTitle: 'Collision Rule',
    playerOnlyBoundary: 'Player-only Boundary',
    playerOnlyBoundaryHint: 'Only the player is blocked by these collision cells.',
    allEntityObstacle: 'All Entity Obstacles',
    allEntityObstacleHint: 'All entities are blocked, except enemies tagged ignoreCollisionEnemy.',
    select: 'Select',
    paint: 'Place',
    collisionPaint: 'Draw Collision',
    erase: 'Erase Collision',
    gridCount: '{count} collision cells / {cols} x {rows}',
    zoomLabel: 'Canvas zoom',
    sizeLabel: 'Size',
    exportLabel: 'Export',
    exportTitle: 'Export',
    exportJson: 'Export Collision JSON',
    exportPng: 'Export Map ZIP',
    exportHint: 'ZIP contains the visual PNG and manifest. JSON stores gridSize, map dimensions, obstacle transforms, and collisionCells for AI or runtime collision.',
    emptyTitle: 'Upload a map to start editing',
    emptyHint: 'Obstacle images are automatically matted and shown in the left asset library.',
    obstacleAria: 'Obstacle {name}',
    smaller: 'Smaller',
    larger: 'Larger',
    duplicate: 'Duplicate',
    delete: 'Delete',
    clearObstacles: 'Clear Obstacles',
  },
  zh: {
    statusProcessed: '已去背',
    statusFailed: '去背失败，使用原图',
    statusOriginal: '原图',
    chooseMap: '请选择地图图片。',
    tooLarge: 'AI 去背支持 {size}MB 以内图片，超过后会保留原图。',
    skippedLarge: '{name} 超过 {size}MB，已跳过 AI 去背并保留原图。',
    matteFailedUseOriginal: '{name} 自动去背失败，已使用原图：{error}',
    assetsAdded: '阻挡物已加入素材组。',
    originalsAdded: '原图已加入素材组。',
    processFailed: '阻挡物处理失败：{error}',
    importMapFirst: '请先导入地图。',
    importMapAndAssetFirst: '请先导入地图并选择阻挡物素材。',
    baseMap: 'Base Map',
    mapTitle: '地图底图',
    mapCopy: '上传已经生成或拼接好的地图 PNG / JPG / WebP。',
    uploadMap: '上传地图底图',
    replaceMap: '重新导入底图',
    assetsLabel: 'Obstacle Assets',
    assetsTitle: '阻挡物素材',
    autoMatte: '自动抠图去背',
    uploadObstacle: '上传阻挡物图片',
    addToCenter: '添加到地图中央',
    gridLabel: 'Collision Grid',
    gridTitle: '碰撞网格',
    showGrid: '显示碰撞格',
    select: '选择',
    paint: '画碰撞',
    erase: '擦除',
    gridCount: '{count} 个碰撞格 / {cols} x {rows}',
    zoomLabel: '画布缩放',
    sizeLabel: '尺寸',
    exportLabel: 'Export',
    exportTitle: '导出',
    exportJson: '导出碰撞 JSON',
    exportPng: '导出含阻挡物 ZIP',
    exportHint: 'ZIP 内包含最终 PNG 和 manifest；JSON 会记录 gridSize、地图尺寸、阻挡物坐标与 collisionCells，供 AI 或 runtime 读取。',
    emptyTitle: '上传地图后开始编辑',
    emptyHint: '阻挡物上传后默认自动去背，并展示在左侧素材组里。',
    obstacleAria: '阻挡物 {name}',
    smaller: '缩小',
    larger: '放大',
    duplicate: '复制',
    delete: '删除',
    clearObstacles: '清空障碍物',
  },
  ja: {
    statusProcessed: '背景除去済み',
    statusFailed: '除去失敗、元画像を使用',
    statusOriginal: '元画像',
    chooseMap: 'マップ画像を選択してください。',
    tooLarge: 'AI 背景除去は {size}MB 以下に対応します。大きい画像は元画像のまま追加します。',
    skippedLarge: '{name} は {size}MB を超えたため AI 背景除去をスキップし、元画像のまま追加しました。',
    matteFailedUseOriginal: '{name} の背景除去に失敗したため元画像を使用します: {error}',
    assetsAdded: '障害物素材を追加しました。',
    originalsAdded: '元画像を追加しました。',
    processFailed: '障害物処理に失敗しました: {error}',
    importMapFirst: '先にマップを読み込んでください。',
    importMapAndAssetFirst: 'マップを読み込み、障害物素材を選択してください。',
    baseMap: 'Base Map',
    mapTitle: 'マップ画像',
    mapCopy: '生成済みまたは結合済みの PNG / JPG / WebP マップを読み込みます。',
    uploadMap: 'マップ画像を読み込む',
    replaceMap: 'マップ画像を差し替え',
    assetsLabel: 'Obstacle Assets',
    assetsTitle: '障害物素材',
    autoMatte: '自動背景除去',
    uploadObstacle: '障害物画像を読み込む',
    addToCenter: 'マップ中央へ追加',
    gridLabel: 'Collision Grid',
    gridTitle: '当たり判定グリッド',
    showGrid: 'グリッドを表示',
    select: '選択',
    paint: '描画',
    erase: '消去',
    gridCount: '{count} 個 / {cols} x {rows}',
    zoomLabel: 'キャンバスズーム',
    sizeLabel: 'サイズ',
    exportLabel: 'Export',
    exportTitle: '出力',
    exportJson: '当たり判定 JSON',
    exportPng: '障害物入り ZIP',
    exportHint: 'ZIP には最終 PNG と manifest が含まれます。JSON は gridSize、マップ寸法、障害物座標、collisionCells を保存します。',
    emptyTitle: 'マップを読み込んで編集開始',
    emptyHint: '障害物は自動で背景除去され、左側の素材一覧に表示されます。',
    obstacleAria: '障害物 {name}',
    smaller: '縮小',
    larger: '拡大',
    duplicate: '複製',
    delete: '削除',
    clearObstacles: 'Clear Obstacles',
  },
}

Object.assign(obstacleCopy.zh, {
  baseMap: '地图底图',
  assetsLabel: '障碍物组',
  gridLabel: '网格设置',
  exportLabel: '导出',
})

Object.assign(obstacleCopy.ja, {
  baseMap: 'ベースマップ',
  assetsLabel: '障害物素材',
  gridLabel: 'グリッド設定',
  exportLabel: 'エクスポート',
  clearObstacles: '障害物をクリア',
})

Object.assign(obstacleCopy.zh, {
  multiSelect: '多选',
  selectedAssets: '已选择 {count} 个素材',
  randomPlace: '随机摆放',
  randomPlaced: '已随机摆放 {count} 个阻挡物。',
  selectAssetsFirst: '请先选择阻挡物素材。',
  paint: '放置素材',
  collisionPaint: '绘制碰撞',
  erase: '擦除碰撞',
  collisionRuleTitle: '碰撞规则',
  playerOnlyBoundary: '仅玩家边界',
  playerOnlyBoundaryHint: '只有玩家无法通过这些碰撞格。',
  allEntityObstacle: '全实体阻挡',
  allEntityObstacleHint: '所有实体无法通过，带 ignoreCollisionEnemy 标记的敌人除外。',
})

Object.assign(obstacleCopy.ja, {
  multiSelect: '複数選択',
  selectedAssets: '{count} 個選択中',
  randomPlace: 'ランダム配置',
  randomPlaced: '{count} 個をランダム配置しました。',
  selectAssetsFirst: '障害物素材を選択してください。',
  paint: '素材配置',
  collisionPaint: '衝突を描画',
  erase: '衝突を消去',
  collisionRuleTitle: '衝突ルール',
  playerOnlyBoundary: 'プレイヤーのみ',
  playerOnlyBoundaryHint: 'プレイヤーだけが通過できません。',
  allEntityObstacle: '全エンティティ',
  allEntityObstacleHint: 'ignoreCollisionEnemy タグ付きの敵以外をブロックします。',
})

function formatCopy(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? ''))
}

async function collisionCellsFromVisibleAlpha(
  asset: ObstacleAsset,
  instance: ObstacleInstance,
  gridSize: ObstacleGridSize,
  mapWidth: number,
  mapHeight: number,
): Promise<CollisionCell[]> {
  const rectCells = cellsFromRect(instance, gridSize, mapWidth, mapHeight, instance.id)
  if (!rectCells.length) return []

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(instance.width))
  canvas.height = Math.max(1, Math.round(instance.height))
  const ctx = canvas.getContext('2d')
  if (!ctx) return rectCells
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(asset.image, 0, 0, canvas.width, canvas.height)

  const visibleCells: CollisionCell[] = []
  for (const cell of rectCells) {
    const localX = Math.max(0, Math.floor(cell.x - instance.x))
    const localY = Math.max(0, Math.floor(cell.y - instance.y))
    const localRight = Math.min(canvas.width, Math.ceil(cell.x + cell.width - instance.x))
    const localBottom = Math.min(canvas.height, Math.ceil(cell.y + cell.height - instance.y))
    const w = localRight - localX
    const h = localBottom - localY
    if (w <= 0 || h <= 0) continue
    const data = ctx.getImageData(localX, localY, w, h).data
    let visible = false
    for (let i = 3; i < data.length; i += 4) {
      if ((data[i] ?? 0) > 16) {
        visible = true
        break
      }
    }
    if (visible) visibleCells.push(cell)
  }
  return visibleCells.length ? visibleCells : rectCells
}

export default function ObstaclePainter({
  toolId = 'map-studio',
  initialMapFile = null,
  projectContext = null,
}: {
  toolId?: string
  initialMapFile?: File | null
  projectContext?: GameProjectContext | null
}) {
  const { lang } = useLanguage()
  const copy = obstacleCopy[lang] as typeof obstacleCopy.en
  const uploadFolderLabel = lang === 'en' ? 'Upload Folder' : '上传文件夹'
  const statusLabel = useCallback((status: ObstacleAsset['matteStatus']) => {
    if (status === 'processed') return copy.statusProcessed
    if (status === 'failed') return copy.statusFailed
    return copy.statusOriginal
  }, [copy])

  const { message } = App.useApp()
  const [mapImage, setMapImage] = useState<LoadedImage | null>(null)
  const [assets, setAssets] = useState<ObstacleAsset[]>([])
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const [assetMultiSelectEnabled, setAssetMultiSelectEnabled] = useState(false)
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(() => new Set())
  const [instances, setInstances] = useState<ObstacleInstance[]>([])
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null)
  const [collisionCells, setCollisionCells] = useState<CollisionCell[]>([])
  const [erasedCellKeys, setErasedCellKeys] = useState<Set<string>>(() => new Set())
  const [gridSize, setGridSize] = useState<ObstacleGridSize>(32)
  const [collisionBlockMode, setCollisionBlockMode] = useState<CollisionBlockMode>('allEntityObstacle')
  const [gridVisible, setGridVisible] = useState(true)
  const [tool, setTool] = useState<CollisionTool>('select')
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [spaceDown, setSpaceDown] = useState(false)
  const [autoMatteEnabled, setAutoMatteEnabled] = useState(true)
  const [isProcessingMatte, setIsProcessingMatte] = useState(false)
  const [draggedAssetId, setDraggedAssetId] = useState<string | null>(null)
  const [dragState, setDragState] = useState<{
    type: 'instance' | 'pan'
    instanceId?: string
    startMapX?: number
    startMapY?: number
    startClientX: number
    startClientY: number
    startX?: number
    startY?: number
    startPan?: { x: number; y: number }
  } | null>(null)
  const workspaceRef = useRef<HTMLDivElement | null>(null)
  const mapInputRef = useRef<HTMLInputElement | null>(null)
  const obstacleInputRef = useRef<HTMLInputElement | null>(null)
  const obstacleFolderInputRef = useRef<HTMLInputElement | null>(null)
  const initialMapKeyRef = useRef<string | null>(null)
  const cleanupRef = useRef({ mapImage, assets })
  cleanupRef.current = { mapImage, assets }

  const selectedAsset = useMemo(() => assets.find((asset) => asset.id === selectedAssetId) ?? null, [assets, selectedAssetId])
  const randomSelectedAssets = useMemo(
    () => assets.filter((asset) => selectedAssetIds.has(asset.id)),
    [assets, selectedAssetIds],
  )
  const selectedInstance = useMemo(() => instances.find((instance) => instance.id === selectedInstanceId) ?? null, [instances, selectedInstanceId])
  const selectedInstanceAsset = useMemo(
    () => selectedInstance ? assets.find((asset) => asset.id === selectedInstance.assetId) ?? null : null,
    [assets, selectedInstance],
  )
  const selectedInstanceScalePercent = selectedInstance && selectedInstanceAsset
    ? Math.round((selectedInstance.width / Math.max(1, selectedInstanceAsset.width)) * 100)
    : 100
  const zoomPercent = Math.round(zoom * 100)

  const deleteSelectedInstance = useCallback(() => {
    if (!selectedInstanceId) return
    setInstances((prev) => prev.filter((item) => item.id !== selectedInstanceId))
    setCollisionCells((prev) => prev.filter((cell) => cell.sourceInstanceId !== selectedInstanceId))
    setSelectedInstanceId(null)
  }, [selectedInstanceId])

  const clearObstacleLayer = useCallback(() => {
    setInstances([])
    setSelectedInstanceId(null)
    setCollisionCells((prev) => prev.filter((cell) => !cell.sourceInstanceId))
    setErasedCellKeys(new Set())
  }, [])

  const applyGeneratedCellsForInstance = useCallback((
    instanceId: string,
    cells: CollisionCell[],
    erasedKeys = erasedCellKeys,
  ) => {
    setCollisionCells((prev) => replaceCellsForInstance(prev, instanceId, cells, erasedKeys))
  }, [erasedCellKeys])

  const deleteAsset = useCallback((assetId: string) => {
    const asset = assets.find((item) => item.id === assetId)
    if (!asset) return
    const removedInstanceIds = new Set(instances.filter((item) => item.assetId === assetId).map((item) => item.id))
    const nextAssets = assets.filter((item) => item.id !== assetId)
    URL.revokeObjectURL(asset.url)
    setAssets(nextAssets)
    setInstances((prev) => prev.filter((item) => item.assetId !== assetId))
    setCollisionCells((prev) => prev.filter((cell) => !cell.sourceInstanceId || !removedInstanceIds.has(cell.sourceInstanceId)))
    if (selectedAssetId === assetId) setSelectedAssetId(nextAssets[0]?.id ?? null)
    setSelectedAssetIds((prev) => {
      const next = new Set(prev)
      next.delete(assetId)
      return next
    })
    if (selectedInstanceId && removedInstanceIds.has(selectedInstanceId)) setSelectedInstanceId(null)
  }, [assets, instances, selectedAssetId, selectedInstanceId])

  useEffect(() => {
    return () => {
      const current = cleanupRef.current
      if (current.mapImage) URL.revokeObjectURL(current.mapImage.url)
      current.assets.forEach((asset) => URL.revokeObjectURL(asset.url))
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        event.preventDefault()
        setSpaceDown(true)
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedInstanceId) {
        event.preventDefault()
        deleteSelectedInstance()
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpaceDown(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [deleteSelectedInstance, selectedInstanceId])

  const pointerToMap = useCallback((clientX: number, clientY: number) => {
    if (!workspaceRef.current || !mapImage) return null
    const rect = workspaceRef.current.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2 + pan.x
    const centerY = rect.top + rect.height / 2 + pan.y
    return {
      x: (clientX - centerX) / zoom + mapImage.width / 2,
      y: (clientY - centerY) / zoom + mapImage.height / 2,
    }
  }, [mapImage, pan.x, pan.y, zoom])

  const recomputeInstanceCells = useCallback(async (instance: ObstacleInstance, nextGridSize = gridSize) => {
    if (!mapImage) return []
    const asset = assets.find((item) => item.id === instance.assetId)
    if (!asset) return cellsFromRect(instance, nextGridSize, mapImage.width, mapImage.height, instance.id)
    return collisionCellsFromVisibleAlpha(asset, instance, nextGridSize, mapImage.width, mapImage.height)
  }, [assets, gridSize, mapImage])

  const rebuildAllCollisionCells = useCallback(async (
    nextGridSize: ObstacleGridSize,
    nextInstances = instances,
    nextErasedCellKeys = erasedCellKeys,
  ) => {
    if (!mapImage) {
      setCollisionCells([])
      return
    }
    const chunks = await Promise.all(nextInstances.map((instance) => recomputeInstanceCells(instance, nextGridSize)))
    setCollisionCells(chunks.flat().filter((cell) => !nextErasedCellKeys.has(cellKey(cell.gridX, cell.gridY))))
  }, [erasedCellKeys, instances, mapImage, recomputeInstanceCells])

  const selectMap = useCallback(async (file: File | null) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      message.error(copy.chooseMap)
      return
    }
    try {
      const loaded = await loadImageFile(file)
      setMapImage((prev) => {
        if (prev) URL.revokeObjectURL(prev.url)
        return loaded
      })
      setInstances([])
      setCollisionCells([])
      setErasedCellKeys(new Set())
      setSelectedInstanceId(null)
      setZoom(1)
      setPan({ x: 0, y: 0 })
    } catch (error) {
      message.error(String(error))
    }
  }, [copy, message])

  useEffect(() => {
    if (!initialMapFile) return
    const key = `${initialMapFile.name}:${initialMapFile.size}:${initialMapFile.lastModified}`
    if (initialMapKeyRef.current === key) return
    initialMapKeyRef.current = key
    void selectMap(initialMapFile)
  }, [initialMapFile, selectMap])

  const selectObstacleFiles = useCallback(async (files: FileList | File[]) => {
    const imageFiles = Array.from(files)
      .filter((file) => file.type.startsWith('image/'))
      .sort((a, b) => {
        const left = ('webkitRelativePath' in a && a.webkitRelativePath) ? a.webkitRelativePath : a.name
        const right = ('webkitRelativePath' in b && b.webkitRelativePath) ? b.webkitRelativePath : b.name
        return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
      })
    if (!imageFiles.length) return
    setIsProcessingMatte(autoMatteEnabled)
    const loadedAssets: ObstacleAsset[] = []
    try {
      for (const file of imageFiles) {
        let nextFile = file
        let matteStatus: ObstacleAsset['matteStatus'] = 'original'
        if (autoMatteEnabled) {
          const result = await removeBackgroundIfNeeded(file, { skipTransparent: true, maxImageMb: MAX_IMAGE_MB })
          if (result.status === 'too-large') {
            message.warning(formatCopy(copy.skippedLarge, { name: file.name, size: MAX_IMAGE_MB }))
          } else if (result.status === 'processed') {
            nextFile = new File([result.blob], file.name.replace(/\.[^.]+$/, '') + '_matte.png', { type: 'image/png' })
            matteStatus = 'processed'
          } else if (result.status === 'failed') {
            matteStatus = 'failed'
            message.warning(formatCopy(copy.matteFailedUseOriginal, { name: file.name, error: String(result.error ?? 'unknown error') }))
          }
        }
        const loaded = await loadImageFile(nextFile)
        loadedAssets.push({ ...loaded, id: makeId('asset'), name: nextFile.name, matteStatus })
      }
      setAssets((prev) => [...prev, ...loadedAssets])
      setSelectedAssetId((prev) => prev ?? loadedAssets[0]?.id ?? null)
      if (loadedAssets.length) message.success(autoMatteEnabled ? copy.assetsAdded : copy.originalsAdded)
    } catch (error) {
      message.error(formatCopy(copy.processFailed, { error: String(error) }))
    } finally {
      setIsProcessingMatte(false)
    }
  }, [autoMatteEnabled, copy, message])

  const setZoomWithFocalPoint = useCallback((nextZoomValue: number, clientX?: number, clientY?: number) => {
    const nextZoom = clamp(nextZoomValue, MIN_ZOOM, MAX_ZOOM)
    if (!workspaceRef.current || !mapImage) {
      setZoom(nextZoom)
      return
    }
    const rect = workspaceRef.current.getBoundingClientRect()
    const focalX = clientX ?? rect.left + rect.width / 2
    const focalY = clientY ?? rect.top + rect.height / 2
    const mapX = (focalX - (rect.left + rect.width / 2 + pan.x)) / zoom + mapImage.width / 2
    const mapY = (focalY - (rect.top + rect.height / 2 + pan.y)) / zoom + mapImage.height / 2
    setZoom(nextZoom)
    setPan({
      x: focalX - rect.left - rect.width / 2 - (mapX - mapImage.width / 2) * nextZoom,
      y: focalY - rect.top - rect.height / 2 - (mapY - mapImage.height / 2) * nextZoom,
    })
  }, [mapImage, pan.x, pan.y, zoom])

  const placeAssetAt = useCallback(async (asset: ObstacleAsset, mapX: number, mapY: number, anchor: 'cell' | 'center' = 'cell') => {
    if (!mapImage) {
      message.warning(copy.importMapFirst)
      return
    }
    const fitted = fitAssetToMap(asset, mapImage)
    const anchorX = anchor === 'center' ? mapX - fitted.width / 2 : mapX
    const anchorY = anchor === 'center' ? mapY - fitted.height / 2 : mapY
    const { gridX, gridY } = snapCellFromPixel(anchorX, anchorY, gridSize)
    const width = fitted.width
    const height = fitted.height
    const x = clamp(gridX * gridSize, 0, Math.max(0, mapImage.width - width))
    const y = clamp(gridY * gridSize, 0, Math.max(0, mapImage.height - height))
    const instance: ObstacleInstance = {
      id: makeId('obs'),
      assetId: asset.id,
      assetName: asset.name,
      gridX,
      gridY,
      x,
      y,
      width,
      height,
      scale: fitted.scale,
      rotation: 0,
      opacity: 1,
      collisionMode: 'solid',
      collisionType: 'solid',
      layer: 0,
    }
    setInstances((prev) => [...prev, instance])
    setSelectedInstanceId(instance.id)
    const cells = await collisionCellsFromVisibleAlpha(asset, instance, gridSize, mapImage.width, mapImage.height)
    setErasedCellKeys((prev) => {
      const next = new Set(prev)
      cells.forEach((cell) => next.delete(cellKey(cell.gridX, cell.gridY)))
      return next
    })
    const nextErasedCellKeys = new Set([...erasedCellKeys].filter((key) => !cells.some((cell) => cellKey(cell.gridX, cell.gridY) === key)))
    applyGeneratedCellsForInstance(instance.id, cells, nextErasedCellKeys)
  }, [applyGeneratedCellsForInstance, copy, erasedCellKeys, gridSize, mapImage, message])

  const placeSelectedAsset = useCallback(async () => {
    if (!selectedAsset || !mapImage) {
      message.warning(copy.importMapAndAssetFirst)
      return
    }
    await placeAssetAt(selectedAsset, mapImage.width / 2, mapImage.height / 2, 'center')
  }, [copy, mapImage, message, placeAssetAt, selectedAsset])

  const toggleAssetMultiSelect = useCallback((assetId: string) => {
    setSelectedAssetIds((prev) => {
      const next = new Set(prev)
      if (next.has(assetId)) {
        next.delete(assetId)
      } else {
        next.add(assetId)
      }
      return next
    })
  }, [])

  const randomPlaceSelectedAssets = useCallback(async () => {
    if (!mapImage) {
      message.warning(copy.importMapFirst)
      return
    }
    if (!randomSelectedAssets.length) {
      message.warning(copy.selectAssetsFirst)
      return
    }

    const mapArea = mapImage.width * mapImage.height
    const targetCount = Math.min(
      RANDOM_OBSTACLE_MAX_COUNT,
      Math.max(randomSelectedAssets.length, Math.round((mapArea / (gridSize * gridSize)) * RANDOM_OBSTACLE_DENSITY)),
    )
    const mapShortSide = Math.min(mapImage.width, mapImage.height)
    const maxRandomSide = Math.max(MIN_OBSTACLE_SIZE, mapShortSide * RANDOM_OBSTACLE_MAX_SHORT_SIDE_RATIO)
    const occupiedRects: Array<{ x: number; y: number; width: number; height: number }> = instances.map((instance) => ({
      x: instance.x,
      y: instance.y,
      width: instance.width,
      height: instance.height,
    }))
    const nextInstances: ObstacleInstance[] = []

    for (let index = 0; index < targetCount; index += 1) {
      const asset = index < randomSelectedAssets.length
        ? randomSelectedAssets[index]
        : randomSelectedAssets[Math.floor(Math.random() * randomSelectedAssets.length)]
      const scaleCap = Math.min(
        RANDOM_OBSTACLE_MAX_SCALE,
        mapImage.width / Math.max(1, asset.width),
        mapImage.height / Math.max(1, asset.height),
        maxRandomSide / Math.max(1, asset.width),
        maxRandomSide / Math.max(1, asset.height),
      )
      const scale = Math.max(0.01, Math.min(randomBetween(RANDOM_OBSTACLE_MIN_SCALE, RANDOM_OBSTACLE_MAX_SCALE), scaleCap))
      const width = clamp(Math.round(asset.width * scale), MIN_OBSTACLE_SIZE, mapImage.width)
      const height = clamp(Math.round(asset.height * scale), MIN_OBSTACLE_SIZE, mapImage.height)
      const maxGridX = Math.max(0, Math.floor((mapImage.width - width) / gridSize))
      const maxGridY = Math.max(0, Math.floor((mapImage.height - height) / gridSize))

      let placed: ObstacleInstance | null = null
      for (let attempt = 0; attempt < RANDOM_OBSTACLE_ATTEMPTS; attempt += 1) {
        const gridX = Math.floor(Math.random() * (maxGridX + 1))
        const gridY = Math.floor(Math.random() * (maxGridY + 1))
        const x = clamp(gridX * gridSize, 0, Math.max(0, mapImage.width - width))
        const y = clamp(gridY * gridSize, 0, Math.max(0, mapImage.height - height))
        const candidate = { x, y, width, height }
        if (occupiedRects.some((rect) => rectsOverlap(candidate, rect))) continue

        placed = {
          id: makeId('obs'),
          assetId: asset.id,
          assetName: asset.name,
          gridX,
          gridY,
          x,
          y,
          width,
          height,
          scale,
          rotation: 0,
          opacity: 1,
          collisionMode: 'solid',
          collisionType: 'solid',
          layer: 0,
        }
        break
      }

      if (placed) {
        nextInstances.push(placed)
        occupiedRects.push({ x: placed.x, y: placed.y, width: placed.width, height: placed.height })
      }
    }

    if (!nextInstances.length) {
      message.warning(formatCopy(copy.randomPlaced, { count: 0 }))
      return
    }

    const cellChunks = await Promise.all(nextInstances.map(async (instance) => {
      const asset = randomSelectedAssets.find((item) => item.id === instance.assetId)
      return {
        instance,
        cells: asset
          ? await collisionCellsFromVisibleAlpha(asset, instance, gridSize, mapImage.width, mapImage.height)
          : cellsFromRect(instance, gridSize, mapImage.width, mapImage.height, instance.id),
      }
    }))
    const placedCellKeys = new Set(cellChunks.flatMap((chunk) => chunk.cells.map((cell) => cellKey(cell.gridX, cell.gridY))))
    const nextErasedCellKeys = new Set([...erasedCellKeys].filter((key) => !placedCellKeys.has(key)))

    setInstances((prev) => [...prev, ...nextInstances])
    setSelectedInstanceId(nextInstances[nextInstances.length - 1]?.id ?? null)
    setErasedCellKeys(nextErasedCellKeys)
    setCollisionCells((prev) => cellChunks.reduce(
      (cells, chunk) => replaceCellsForInstance(cells, chunk.instance.id, chunk.cells, nextErasedCellKeys),
      prev,
    ))
    message.success(formatCopy(copy.randomPlaced, { count: nextInstances.length }))
  }, [copy, erasedCellKeys, gridSize, instances, mapImage, message, randomSelectedAssets])

  const updateInstance = useCallback(async (instanceId: string, updater: (instance: ObstacleInstance) => ObstacleInstance, recompute = false) => {
    let nextInstance: ObstacleInstance | null = null
    setInstances((prev) => prev.map((item) => {
      if (item.id !== instanceId) return item
      nextInstance = updater(item)
      return nextInstance
    }))
    if (recompute && nextInstance) {
      const cells = await recomputeInstanceCells(nextInstance)
      applyGeneratedCellsForInstance(instanceId, cells)
    }
  }, [applyGeneratedCellsForInstance, recomputeInstanceCells])

  const duplicateSelectedInstance = useCallback(async () => {
    if (!selectedInstance || !mapImage) return
    const next: ObstacleInstance = {
      ...selectedInstance,
      id: makeId('obs'),
      gridX: (selectedInstance.gridX ?? Math.floor(selectedInstance.x / gridSize)) + 1,
      gridY: selectedInstance.gridY ?? Math.floor(selectedInstance.y / gridSize),
      x: clamp(selectedInstance.x + gridSize, 0, Math.max(0, mapImage.width - selectedInstance.width)),
      y: clamp(selectedInstance.y, 0, Math.max(0, mapImage.height - selectedInstance.height)),
    }
    setInstances((prev) => [...prev, next])
    setSelectedInstanceId(next.id)
    const cells = await recomputeInstanceCells(next)
    applyGeneratedCellsForInstance(next.id, cells)
  }, [applyGeneratedCellsForInstance, gridSize, mapImage, recomputeInstanceCells, selectedInstance])

  const resizeInstance = useCallback(async (instanceId: string, ratio: number) => {
    if (!mapImage) return
    await updateInstance(instanceId, (item) => {
      const width = clamp(Math.round(item.width * ratio), 8, mapImage.width)
      const height = clamp(Math.round(item.height * ratio), 8, mapImage.height)
      const asset = assets.find((candidate) => candidate.id === item.assetId)
      return {
        ...item,
        width,
        height,
        scale: asset ? width / Math.max(1, asset.width) : item.scale,
        x: clamp(item.x, 0, Math.max(0, mapImage.width - width)),
        y: clamp(item.y, 0, Math.max(0, mapImage.height - height)),
      }
    }, true)
  }, [assets, mapImage, updateInstance])

  const resizeSelectedInstance = useCallback(async (ratio: number) => {
    if (!selectedInstanceId) return
    await resizeInstance(selectedInstanceId, ratio)
  }, [resizeInstance, selectedInstanceId])

  const resizeSelectedInstanceToScale = useCallback(async (scalePercent: number) => {
    if (!selectedInstanceId || !mapImage) return
    const instance = instances.find((item) => item.id === selectedInstanceId)
    if (!instance) return
    const asset = assets.find((item) => item.id === instance.assetId)
    if (!asset) return
    const scale = clamp(scalePercent, 1, MAX_OBSTACLE_SCALE_PERCENT) / 100
    await updateInstance(selectedInstanceId, (item) => {
      const width = clamp(Math.round(asset.width * scale), MIN_OBSTACLE_SIZE, mapImage.width)
      const height = clamp(Math.round(asset.height * scale), MIN_OBSTACLE_SIZE, mapImage.height)
      return {
        ...item,
        width,
        height,
        scale,
        x: clamp(item.x, 0, Math.max(0, mapImage.width - width)),
        y: clamp(item.y, 0, Math.max(0, mapImage.height - height)),
      }
    }, true)
  }, [assets, instances, mapImage, selectedInstanceId, updateInstance])

  const resizeSelectedInstanceByWheel = useCallback(async (deltaY: number) => {
    await resizeSelectedInstance(Math.exp(-deltaY * 0.0015))
  }, [resizeSelectedInstance])

  const onInstanceMouseDown = (event: ReactMouseEvent, instance: ObstacleInstance) => {
    if (tool !== 'select') return
    event.preventDefault()
    event.stopPropagation()
    const mapPoint = pointerToMap(event.clientX, event.clientY)
    if (!mapPoint) return
    setSelectedInstanceId(instance.id)
    setDragState({
      type: 'instance',
      instanceId: instance.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startMapX: mapPoint.x,
      startMapY: mapPoint.y,
      startX: instance.x,
      startY: instance.y,
    })
  }

  const onInstanceWheel = (event: ReactWheelEvent, instance: ObstacleInstance) => {
    if (tool !== 'select') return
    event.preventDefault()
    event.stopPropagation()
    setSelectedInstanceId(instance.id)
    void resizeInstance(instance.id, Math.exp(-event.deltaY * 0.0015))
  }

  const applyCollisionTool = useCallback((clientX: number, clientY: number) => {
    if (!mapImage) return
    const point = pointerToMap(clientX, clientY)
    if (!point) return
    if (point.x < 0 || point.y < 0 || point.x >= mapImage.width || point.y >= mapImage.height) return
    const { gridX, gridY } = snapCellFromPixel(point.x, point.y, gridSize)
    if (tool === 'paint') {
      if (selectedAsset) {
        void placeAssetAt(selectedAsset, gridX * gridSize, gridY * gridSize)
      }
      return
    }
    if (tool === 'collision') {
      const paintedKey = cellKey(gridX, gridY)
      setErasedCellKeys((prev) => {
        const next = new Set(prev)
        next.delete(paintedKey)
        return next
      })
      setCollisionCells((prev) => upsertManualCell(prev, makeCollisionCell(gridX, gridY, gridSize)))
    } else if (tool === 'erase') {
      const erasedKey = cellKey(gridX, gridY)
      setErasedCellKeys((prev) => {
        const next = new Set(prev)
        next.add(erasedKey)
        return next
      })
      setCollisionCells((prev) => removeCell(prev, gridX, gridY))
    }
  }, [gridSize, mapImage, placeAssetAt, pointerToMap, selectedAsset, tool])

  const onWorkspaceMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!mapImage) return
    if (event.button === 2 || spaceDown || (event.button === 0 && tool === 'select')) {
      event.preventDefault()
      if (tool === 'select') setSelectedInstanceId(null)
      setDragState({
        type: 'pan',
        startClientX: event.clientX,
        startClientY: event.clientY,
        startPan: { ...pan },
      })
      return
    }
    if (tool === 'paint' || tool === 'collision' || tool === 'erase') {
      event.preventDefault()
      applyCollisionTool(event.clientX, event.clientY)
      return
    }
    setSelectedInstanceId(null)
  }

  const onWorkspaceMouseMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    if ((tool === 'collision' || tool === 'erase') && event.buttons === 1) applyCollisionTool(event.clientX, event.clientY)
    if (!dragState || !mapImage) return
    if (dragState.type === 'pan') {
      setPan({
        x: (dragState.startPan?.x ?? 0) + event.clientX - dragState.startClientX,
        y: (dragState.startPan?.y ?? 0) + event.clientY - dragState.startClientY,
      })
      return
    }
    if (dragState.type === 'instance' && dragState.instanceId) {
      const point = pointerToMap(event.clientX, event.clientY)
      const startMapX = dragState.startMapX
      const startMapY = dragState.startMapY
      if (!point || startMapX === undefined || startMapY === undefined) return
      setInstances((prev) => prev.map((item) => {
        if (item.id !== dragState.instanceId) return item
        const x = Math.round(clamp((dragState.startX ?? item.x) + point.x - startMapX, 0, Math.max(0, mapImage.width - item.width)))
        const y = Math.round(clamp((dragState.startY ?? item.y) + point.y - startMapY, 0, Math.max(0, mapImage.height - item.height)))
        const snapped = snapCellFromPixel(x, y, gridSize)
        return {
          ...item,
          gridX: snapped.gridX,
          gridY: snapped.gridY,
          x,
          y,
        }
      }))
    }
  }

  const stopDrag = useCallback(async () => {
    if (dragState?.type === 'instance' && dragState.instanceId) {
      const instance = instances.find((item) => item.id === dragState.instanceId)
      if (instance) {
        const cells = await recomputeInstanceCells(instance)
        applyGeneratedCellsForInstance(instance.id, cells)
      }
    }
    setDragState(null)
  }, [applyGeneratedCellsForInstance, dragState, instances, recomputeInstanceCells])

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (!workspaceRef.current || !mapImage) return
    event.preventDefault()
    const target = event.target as HTMLElement
    if (selectedInstanceId && target.closest('.map-studio-instance-size-control')) {
      void resizeSelectedInstanceByWheel(event.deltaY)
      return
    }
    setZoomWithFocalPoint(zoom * Math.exp(-event.deltaY * 0.0015), event.clientX, event.clientY)
  }

  const onAssetDragStart = (event: ReactDragEvent<HTMLElement>, assetId: string) => {
    setDraggedAssetId(assetId)
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData('text/plain', assetId)
  }

  const onAssetDragEnd = () => {
    setDraggedAssetId(null)
  }

  const onWorkspaceDragOver = (event: ReactDragEvent<HTMLElement>) => {
    if (!mapImage) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  const onWorkspaceDrop = async (event: ReactDragEvent<HTMLElement>) => {
    event.preventDefault()
    if (!mapImage) return
    const assetId = event.dataTransfer.getData('text/plain') || draggedAssetId
    const asset = assets.find((item) => item.id === assetId)
    const point = pointerToMap(event.clientX, event.clientY)
    if (!asset || !point) return
    await placeAssetAt(asset, point.x, point.y)
    setSelectedAssetId(asset.id)
    setDraggedAssetId(null)
  }

  const exportObstacleJson = useCallback(() => {
    if (!mapImage) return
    const payload = buildObstacleJson(mapImage, gridSize, collisionBlockMode, assets, instances, collisionCells)
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    downloadBlob(blob, 'map_collision.json')
    void blobToDataUrl(blob).then((dataUrl) => {
      postToolHostMessage({
        type: 'droi.tool.exportArtifact.v1',
        protocol: DROI_GAME_TOOL_PROTOCOL,
        toolId,
        artifact: {
          toolId,
          artifactType: 'obstacleLayout',
          files: [{ name: 'map_collision.json', mimeType: 'application/json', dataUrl }],
          metadata: droiTargetMetadata(projectContext, 'export-obstacle-layout'),
          manifestPatch: {
            obstacleLayout: 'artifacts/map_collision.json',
            collisionRule: payload.collisionRule,
          },
        },
      })
    })
  }, [assets, collisionBlockMode, collisionCells, gridSize, instances, mapImage, projectContext, toolId])

  const exportPng = useCallback(async () => {
    if (!mapImage) return
    try {
      const canvas = await renderMapWithObstacles(mapImage, assets, instances)
      const blob = await canvasToBlob(canvas)
      await imageBlobToZip(blob, 'map_with_obstacles.png', 'map_with_obstacles.zip', {
        type: 'mapWithObstacles',
        mapWidth: mapImage.width,
        mapHeight: mapImage.height,
        gridSize,
        collisionRule: {
          blockMode: collisionBlockMode,
          affects: collisionBlockMode === 'playerOnlyBoundary' ? 'player' : 'allEntities',
          ignoredByTags: collisionBlockMode === 'allEntityObstacle' ? ['ignoreCollisionEnemy'] : [],
        },
        obstacleCount: instances.length,
      })
      postToolHostMessage({
        type: 'droi.tool.exportArtifact.v1',
        protocol: DROI_GAME_TOOL_PROTOCOL,
        toolId,
        artifact: {
          toolId,
          artifactType: 'map',
          files: [{ name: 'map_with_obstacles.png', mimeType: 'image/png', dataUrl: await blobToDataUrl(blob) }],
          metadata: droiTargetMetadata(projectContext, 'export-map-with-obstacles'),
          manifestPatch: { map: 'artifacts/map_with_obstacles.png' },
        },
      })
    } catch (error) {
      message.error(String(error))
    }
  }, [assets, collisionBlockMode, gridSize, instances, mapImage, message, projectContext, toolId])

  const changeGridSize = async (next: ObstacleGridSize) => {
    const realignedInstances = instances.map((instance) => {
      const gridX = instance.gridX ?? Math.floor(instance.x / gridSize)
      const gridY = instance.gridY ?? Math.floor(instance.y / gridSize)
      return {
        ...instance,
        gridX,
        gridY,
        x: clamp(gridX * next, 0, Math.max(0, mapImage ? mapImage.width - instance.width : gridX * next)),
        y: clamp(gridY * next, 0, Math.max(0, mapImage ? mapImage.height - instance.height : gridY * next)),
        width: instance.width,
        height: instance.height,
      }
    })
    const clearedErases = new Set<string>()
    setGridSize(next)
    setInstances(realignedInstances)
    setErasedCellKeys(clearedErases)
    await rebuildAllCollisionCells(next, realignedInstances, clearedErases)
  }

  const gridColumns = mapImage ? Math.ceil(mapImage.width / gridSize) : 0
  const gridRows = mapImage ? Math.ceil(mapImage.height / gridSize) : 0

  return (
    <div className="map-studio-shell">
      <aside className="map-studio-sidebar">
        <section className="map-studio-panel-section">
          <Text className="map-studio-section-label">{copy.baseMap}</Text>
          <Text className="map-studio-section-title">{copy.mapTitle}</Text>
          <Text className="map-studio-section-copy">{copy.mapCopy}</Text>
          <input data-testid="obstacle-map-input" ref={mapInputRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void selectMap(event.target.files?.[0] ?? null)} />
          <Button className="map-studio-primary-btn" block icon={<EnvironmentOutlined />} onClick={() => mapInputRef.current?.click()}>
            {mapImage ? copy.replaceMap : copy.uploadMap}
          </Button>
          {mapImage && <Text className="map-studio-meta">{mapImage.width} × {mapImage.height}px</Text>}
        </section>

        <section className="map-studio-panel-section">
          <Text className="map-studio-section-label">{copy.assetsLabel}</Text>
          <Text className="map-studio-section-title">{copy.assetsTitle}</Text>
          <label className="map-studio-inline-toggle">
            <Switch checked={autoMatteEnabled} onChange={setAutoMatteEnabled} />
            <span>{copy.autoMatte}</span>
          </label>
          <input
            data-testid="obstacle-asset-input"
            ref={obstacleInputRef}
            hidden
            multiple
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => {
              void selectObstacleFiles(event.target.files ?? [])
              event.currentTarget.value = ''
            }}
          />
          <input
            ref={obstacleFolderInputRef}
            hidden
            multiple
            type="file"
            accept="image/png,image/jpeg,image/webp"
            {...{ webkitdirectory: '', directory: '' }}
            onChange={(event) => {
              void selectObstacleFiles(event.target.files ?? [])
              event.currentTarget.value = ''
            }}
          />
          <Button className="map-studio-primary-btn" block icon={autoMatteEnabled ? <BgColorsOutlined /> : <UploadOutlined />} loading={isProcessingMatte} onClick={() => obstacleInputRef.current?.click()}>
            {copy.uploadObstacle}
          </Button>
          <Button className="map-studio-primary-btn" block icon={<UploadOutlined />} loading={isProcessingMatte} onClick={() => obstacleFolderInputRef.current?.click()}>
            {uploadFolderLabel}
          </Button>
          <label className="map-studio-inline-toggle">
            <Switch data-testid="asset-multi-select-toggle" checked={assetMultiSelectEnabled} onChange={setAssetMultiSelectEnabled} />
            <span>{copy.multiSelect}</span>
          </label>
          <Text className="map-studio-meta">
            {formatCopy(copy.selectedAssets, { count: assetMultiSelectEnabled ? randomSelectedAssets.length : selectedAsset ? 1 : 0 })}
          </Text>
          <div className="map-studio-asset-grid">
            {assets.map((asset) => (
              <div
                key={asset.id}
                data-testid={`obstacle-asset-card-${asset.name}`}
                role="button"
                tabIndex={0}
                draggable
                className={`map-studio-asset-card ${
                  (assetMultiSelectEnabled ? selectedAssetIds.has(asset.id) : selectedAssetId === asset.id) ? 'selected' : ''
                } ${assetMultiSelectEnabled && selectedAssetIds.has(asset.id) ? 'multi-selected' : ''}`}
                onClick={() => {
                  setSelectedAssetId(asset.id)
                  if (assetMultiSelectEnabled) toggleAssetMultiSelect(asset.id)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setSelectedAssetId(asset.id)
                    if (assetMultiSelectEnabled) toggleAssetMultiSelect(asset.id)
                  }
                }}
                onDragStart={(event) => onAssetDragStart(event, asset.id)}
                onDragEnd={onAssetDragEnd}
              >
                {assetMultiSelectEnabled && (
                  <span className="map-studio-asset-check" aria-hidden="true">
                    <CheckOutlined />
                  </span>
                )}
                <button
                  type="button"
                  className="map-studio-asset-delete"
                  aria-label={`${copy.delete} ${asset.name}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    deleteAsset(asset.id)
                  }}
                  onMouseDown={(event) => event.stopPropagation()}
                >
                  <DeleteOutlined />
                </button>
                <img src={asset.url} alt={asset.name} draggable={false} />
                <span>{asset.name}</span>
                <em>{asset.width} × {asset.height}px</em>
                <small data-status={asset.matteStatus}>{statusLabel(asset.matteStatus)}</small>
              </div>
            ))}
          </div>
          <Button
            data-testid="random-place-obstacles"
            className="map-studio-primary-btn"
            block
            icon={<DragOutlined />}
            disabled={!assetMultiSelectEnabled || !mapImage || !randomSelectedAssets.length}
            onClick={() => void randomPlaceSelectedAssets()}
          >
            {copy.randomPlace}
          </Button>
          <Button data-testid="add-obstacle-center" className="map-studio-primary-btn" block icon={<DragOutlined />} disabled={!selectedAsset || !mapImage} onClick={() => void placeSelectedAsset()}>
            {copy.addToCenter}
          </Button>
        </section>

        <section className="map-studio-panel-section">
          <Text className="map-studio-section-label">{copy.gridLabel}</Text>
          <Text className="map-studio-section-title">{copy.gridTitle}</Text>
          <Space orientation="vertical" style={{ width: '100%' }}>
            <Select<ObstacleGridSize>
              value={gridSize}
              onChange={(value) => void changeGridSize(value)}
              options={OBSTACLE_GRID_SIZES.map((value) => ({ value, label: `${value}px` }))}
            />
            <label className="map-studio-inline-toggle">
              <Switch checked={gridVisible} onChange={setGridVisible} />
              <span>{copy.showGrid}</span>
            </label>
            <Text className="map-studio-section-title">{copy.collisionRuleTitle}</Text>
            <div className="map-studio-collision-rule-grid" role="group" aria-label={copy.collisionRuleTitle}>
              {([
                ['playerOnlyBoundary', copy.playerOnlyBoundary, copy.playerOnlyBoundaryHint],
                ['allEntityObstacle', copy.allEntityObstacle, copy.allEntityObstacleHint],
              ] as Array<[CollisionBlockMode, string, string]>).map(([value, label, hint]) => (
                <button
                  key={value}
                  type="button"
                  data-testid={`collision-rule-${value}`}
                  className={`map-studio-collision-rule ${collisionBlockMode === value ? 'is-active' : ''}`}
                  onClick={() => setCollisionBlockMode(value)}
                >
                  <span>{label}</span>
                  <small>{hint}</small>
                </button>
              ))}
            </div>
            <div className="map-studio-tool-grid" role="group" aria-label={copy.gridTitle}>
              {([
                ['select', copy.select],
                ['paint', copy.paint],
                ['collision', copy.collisionPaint],
                ['erase', copy.erase],
              ] as Array<[CollisionTool, string]>).map(([value, label]) => (
                <Button
                  key={value}
                  className={`map-studio-tool-button ${tool === value ? 'is-active' : ''}`}
                  type={tool === value ? 'primary' : 'default'}
                  onClick={() => setTool(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <Button block danger icon={<DeleteOutlined />} disabled={!instances.length && !collisionCells.length} onClick={clearObstacleLayer}>
              {copy.clearObstacles}
            </Button>
            <Text className="map-studio-meta">{formatCopy(copy.gridCount, { count: collisionCells.length, cols: gridColumns, rows: gridRows })}</Text>
          </Space>
        </section>

        <section className="map-studio-panel-section">
          <Text className="map-studio-section-label">{copy.exportLabel}</Text>
          <Text className="map-studio-section-title">{copy.exportTitle}</Text>
          <Space orientation="vertical" style={{ width: '100%' }}>
            <Button data-testid="export-obstacle-json" block icon={<DownloadOutlined />} disabled={!mapImage} onClick={exportObstacleJson}>{copy.exportJson}</Button>
            <Button block icon={<DownloadOutlined />} disabled={!mapImage} onClick={() => void exportPng()}>{copy.exportPng}</Button>
            <Text className="map-studio-meta">{copy.exportHint}</Text>
          </Space>
        </section>
      </aside>

      <main
        ref={workspaceRef}
        data-testid="obstacle-workspace"
        className={`map-studio-obstacle-workspace ${spaceDown || dragState?.type === 'pan' ? 'is-panning' : ''}`}
        onContextMenu={(event) => event.preventDefault()}
        onMouseDown={onWorkspaceMouseDown}
        onMouseMove={onWorkspaceMouseMove}
        onMouseUp={() => void stopDrag()}
        onMouseLeave={() => void stopDrag()}
        onWheel={onWheel}
        onDragOver={onWorkspaceDragOver}
        onDrop={(event) => void onWorkspaceDrop(event)}
      >
        {mapImage && (
          <div className="map-studio-obstacle-zoom-tools" onWheel={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}>
            <Text>{copy.zoomLabel}</Text>
            <Button
              size="small"
              icon={<PlusOutlined />}
              aria-label={copy.larger}
              onClick={() => setZoomWithFocalPoint(zoom * 1.15)}
            />
            <Slider
              vertical
              min={Math.round(MIN_ZOOM * 100)}
              max={Math.round(MAX_ZOOM * 100)}
              value={zoomPercent}
              onChange={(value) => setZoomWithFocalPoint(value / 100)}
            />
            <Button
              size="small"
              icon={<MinusOutlined />}
              aria-label={copy.smaller}
              onClick={() => setZoomWithFocalPoint(zoom / 1.15)}
            />
            <Text>{zoomPercent}%</Text>
          </div>
        )}
        {!mapImage ? (
          <div className="map-studio-empty-state">
            <EnvironmentOutlined />
            <Title level={3}>{copy.emptyTitle}</Title>
            <Text>{copy.emptyHint}</Text>
          </div>
        ) : (
          <div
            data-testid="obstacle-stage"
            className="map-studio-obstacle-stage"
            style={{
              width: mapImage.width,
              height: mapImage.height,
              transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})`,
            }}
          >
            <img className="map-studio-map-image" src={mapImage.url} alt={copy.mapTitle} draggable={false} />
            {instances.map((instance) => {
              const asset = assets.find((item) => item.id === instance.assetId)
              if (!asset) return null
              return (
                <button
                  key={instance.id}
                  type="button"
                  className={`map-studio-obstacle-instance ${selectedInstanceId === instance.id ? 'selected' : ''}`}
                  style={{ left: instance.x, top: instance.y, width: instance.width, height: instance.height, opacity: instance.opacity }}
                  onMouseDown={(event) => onInstanceMouseDown(event, instance)}
                  onWheel={(event) => onInstanceWheel(event, instance)}
                  onClick={(event) => {
                    event.stopPropagation()
                    if (tool === 'select') setSelectedInstanceId(instance.id)
                  }}
                  aria-label={formatCopy(copy.obstacleAria, { name: instance.assetName })}
                >
                  <img src={asset.url} alt="" draggable={false} />
                </button>
              )
            })}
            {selectedInstance && (
              <div className="map-studio-floating-tools">
                <Text>{selectedInstance.assetName}</Text>
                <Button size="small" icon={<MinusOutlined />} onClick={() => void resizeSelectedInstance(0.9)}>{copy.smaller}</Button>
                <Button size="small" icon={<PlusOutlined />} onClick={() => void resizeSelectedInstance(1.1)}>{copy.larger}</Button>
                <Button size="small" icon={<CopyOutlined />} onClick={() => void duplicateSelectedInstance()}>{copy.duplicate}</Button>
                <Button size="small" danger icon={<DeleteOutlined />} onClick={deleteSelectedInstance}>{copy.delete}</Button>
              </div>
            )}
            {selectedInstance && selectedInstanceAsset && (
              <div
                className="map-studio-instance-size-control"
                style={{
                  left: clamp(selectedInstance.x, 0, Math.max(0, mapImage.width - 292)),
                  top: selectedInstance.y + selectedInstance.height + 12 <= mapImage.height - 58
                    ? selectedInstance.y + selectedInstance.height + 12
                    : Math.max(0, selectedInstance.y - 58),
                }}
              >
                <Text className="map-studio-size-label">{copy.sizeLabel}</Text>
                <Button
                  size="small"
                  icon={<MinusOutlined />}
                  aria-label={copy.smaller}
                  onClick={() => void resizeSelectedInstance(0.9)}
                />
                <Slider
                  className="map-studio-instance-size-slider"
                  min={1}
                  max={MAX_OBSTACLE_SCALE_PERCENT}
                  value={clamp(selectedInstanceScalePercent, 1, MAX_OBSTACLE_SCALE_PERCENT)}
                  onChange={(value) => void resizeSelectedInstanceToScale(value)}
                />
                <Button
                  size="small"
                  icon={<PlusOutlined />}
                  aria-label={copy.larger}
                  onClick={() => void resizeSelectedInstance(1.1)}
                />
                <Text>{selectedInstanceScalePercent}%</Text>
                <Text>{selectedInstance.width} x {selectedInstance.height}px</Text>
              </div>
            )}
            {gridVisible && (
              <div className="map-studio-collision-layer" style={{ backgroundSize: `${gridSize}px ${gridSize}px` }}>
                  {collisionCells.map((cell) => (
                  <span key={collisionCellKey(cell)} className="map-studio-collision-cell" style={{ left: cell.x, top: cell.y, width: cell.width, height: cell.height }} />
                ))}
              </div>
            )}
            <BorderOutlined className="map-studio-stage-corner" />
          </div>
        )}
      </main>
    </div>
  )
}
