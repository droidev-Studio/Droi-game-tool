import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../../i18n/context'

const MIN_CROP_SIZE = 200
type CropHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | 'move' | null

interface Props {
  imageUrl: string
  imageSize: { w: number; h: number }
  cropRegion: { left: number; top: number; right: number; bottom: number }
  onChange: (r: { left: number; top: number; right: number; bottom: number }) => void
  onPickColor?: (r: number, g: number, b: number) => void
  pickingColor?: boolean
}

type DragStart = {
  x: number
  y: number
  left: number
  top: number
  right: number
  bottom: number
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function cursorForHandle(handle: CropHandle, pickingColor?: boolean) {
  if (pickingColor) return 'crosshair'
  const map: Record<string, string> = {
    move: 'grab',
    n: 'ns-resize',
    s: 'ns-resize',
    e: 'ew-resize',
    w: 'ew-resize',
    ne: 'nesw-resize',
    sw: 'nesw-resize',
    nw: 'nwse-resize',
    se: 'nwse-resize',
  }
  return (handle && map[handle]) || 'default'
}

export default function ImageCropEditor({
  imageUrl,
  imageSize,
  cropRegion,
  onChange,
  onPickColor,
  pickingColor,
}: Props) {
  const { t } = useLanguage()
  const frameRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const [dragging, setDragging] = useState<CropHandle>(null)
  const [dragStart, setDragStart] = useState<DragStart | null>(null)

  const minW = Math.min(MIN_CROP_SIZE, imageSize.w)
  const minH = Math.min(MIN_CROP_SIZE, imageSize.h)
  const cropLeft = cropRegion.left
  const cropTop = cropRegion.top
  const cropWidth = imageSize.w - cropRegion.left - cropRegion.right
  const cropHeight = imageSize.h - cropRegion.top - cropRegion.bottom

  const toImageCoords = (clientX: number, clientY: number) => {
    const rect = frameRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: clamp(Math.round(((clientX - rect.left) / rect.width) * imageSize.w), 0, imageSize.w),
      y: clamp(Math.round(((clientY - rect.top) / rect.height) * imageSize.h), 0, imageSize.h),
    }
  }

  const patchCrop = (handle: CropHandle, point: { x: number; y: number }, start: DragStart) => {
    const dx = point.x - start.x
    const dy = point.y - start.y
    let { left, top, right, bottom } = start

    if (handle === 'move') {
      const width = imageSize.w - start.left - start.right
      const height = imageSize.h - start.top - start.bottom
      left = clamp(start.left + dx, 0, imageSize.w - width)
      top = clamp(start.top + dy, 0, imageSize.h - height)
      right = imageSize.w - left - width
      bottom = imageSize.h - top - height
    } else {
      if (handle?.includes('w')) {
        left = clamp(start.left + dx, 0, imageSize.w - start.right - minW)
      }
      if (handle?.includes('e')) {
        right = clamp(start.right - dx, 0, imageSize.w - start.left - minW)
      }
      if (handle?.includes('n')) {
        top = clamp(start.top + dy, 0, imageSize.h - start.bottom - minH)
      }
      if (handle?.includes('s')) {
        bottom = clamp(start.bottom - dy, 0, imageSize.h - start.top - minH)
      }
    }

    onChange({ left, top, right, bottom })
  }

  const beginDrag = (event: React.PointerEvent, handle: CropHandle) => {
    if (pickingColor) return
    event.preventDefault()
    event.stopPropagation()
    const point = toImageCoords(event.clientX, event.clientY)
    setDragging(handle)
    setDragStart({ x: point.x, y: point.y, ...cropRegion })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const pickColor = (clientX: number, clientY: number) => {
    if (!onPickColor) return
    const point = toImageCoords(clientX, clientY)
    const img = imageRef.current
    if (!img) return
    const canvas = document.createElement('canvas')
    canvas.width = imageSize.w
    canvas.height = imageSize.h
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(img, 0, 0, imageSize.w, imageSize.h)
    const sampleX = clamp(point.x, 0, Math.max(0, imageSize.w - 1))
    const sampleY = clamp(point.y, 0, Math.max(0, imageSize.h - 1))
    const [r, g, b] = ctx.getImageData(sampleX, sampleY, 1, 1).data
    onPickColor(r, g, b)
  }

  const onCropPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (pickingColor) {
      event.preventDefault()
      event.stopPropagation()
      pickColor(event.clientX, event.clientY)
      return
    }
    beginDrag(event, 'move')
  }

  const onFramePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pickingColor) return
    event.preventDefault()
    pickColor(event.clientX, event.clientY)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || !dragStart) return
    event.preventDefault()
    patchCrop(dragging, toImageCoords(event.clientX, event.clientY), dragStart)
  }

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragging) {
      event.currentTarget.releasePointerCapture?.(event.pointerId)
    }
    setDragging(null)
    setDragStart(null)
  }

  useEffect(() => {
    if (!imageSize.w || !imageSize.h) return
    const invalid =
      cropRegion.left < 0 ||
      cropRegion.top < 0 ||
      cropRegion.right < 0 ||
      cropRegion.bottom < 0 ||
      imageSize.w - cropRegion.left - cropRegion.right < minW ||
      imageSize.h - cropRegion.top - cropRegion.bottom < minH
    if (!invalid) return
    onChange({
      left: 0,
      top: 0,
      right: Math.max(0, imageSize.w - minW),
      bottom: Math.max(0, imageSize.h - minH),
    })
  }, [cropRegion, imageSize.h, imageSize.w, minH, minW, onChange])

  if (!imageUrl) return null

  return (
    <div className="image-crop-editor">
      <div
        ref={frameRef}
        className={`image-crop-editor-frame ${pickingColor ? 'is-picking' : ''}`}
        style={{
          aspectRatio: `${imageSize.w} / ${imageSize.h}`,
          maxWidth: `min(100%, ${Math.round((imageSize.w / Math.max(1, imageSize.h)) * 430)}px)`,
        }}
        onPointerDown={onFramePointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <img
          ref={imageRef}
          src={imageUrl}
          alt={t('imgOriginalPreview')}
          draggable={false}
          onError={() => {
            // Keep the editor mounted so numeric crop controls still work.
          }}
        />
        <div className="image-crop-editor-shade" />
        {pickingColor && <div className="image-crop-picker-badge">吸管模式 / Eyedropper</div>}
        <div
          className="image-crop-editor-box"
          style={{
            left: `${(cropLeft / imageSize.w) * 100}%`,
            top: `${(cropTop / imageSize.h) * 100}%`,
            width: `${(cropWidth / imageSize.w) * 100}%`,
            height: `${(cropHeight / imageSize.h) * 100}%`,
            cursor: cursorForHandle(dragging || 'move', pickingColor),
          }}
          onPointerDown={onCropPointerDown}
        >
          <span className="image-crop-editor-size">
            {cropWidth} x {cropHeight}px
          </span>
          {(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const).map((handle) => (
            <button
              key={handle}
              type="button"
              className={`image-crop-handle is-${handle}`}
              aria-label={`Resize crop ${handle}`}
              style={{ cursor: cursorForHandle(handle, pickingColor) }}
              onPointerDown={(event) => beginDrag(event, handle)}
            />
          ))}
        </div>
      </div>
      <div className="image-crop-editor-hint">
        {pickingColor && <strong>吸管已开启：点击图片中的背景颜色进行采样。</strong>}
        <span>拖动裁剪框移动区域，拖动四边或四角调整范围。</span>
        <span>Drag the box to move. Drag edges or corners to resize.</span>
      </div>
    </div>
  )
}
