import { useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { Button, Checkbox, Col, ColorPicker, Divider, InputNumber, message, Row, Slider, Space, Tooltip, Typography, Upload } from 'antd'
import type { UploadFile } from 'antd'
import { DownloadOutlined, EditOutlined, InboxOutlined } from '@ant-design/icons'
import { useLanguage } from '../i18n/context'
import { formatError } from '../i18n/locales'
import { removeGeminiWatermarkFromBlob } from '../lib/geminiWatermark'
import StashableImage from './StashableImage'
import StashDropZone from './StashDropZone'
import ImageCropEditor from './ImageResizeStroke/ImageCropEditor'
import {
  applyChromaKey,
  applyChromaKeyContiguousFromTopLeft,
  applyInnerStroke,
  cropImageBlob,
  extendImageBottom,
  getTopLeftPixelColor,
  resizeImageToBlob,
} from './ParamsStep/utils'

const { Dragger } = Upload
const { Text } = Typography

const IMAGE_ALLOWED = ['.png', '.jpg', '.jpeg', '.webp']
const EMPTY_CROP = { left: 0, top: 0, right: 0, bottom: 0 }
const MIN_LOCAL_CROP_SIZE = 200

export interface ImageResizeStrokeProps {
  onSendToFineProcess?: (blob: Blob, suggestedFilename: string) => void
}

const QUICK_ACTION_COPY = {
  rpgmaker: {
    title: 'RPGMaker 角色图适配',
    subtitle: 'RPGMaker character asset',
    use: '适合单张角色小图，需要快速变成 RPGMaker 可用素材时使用。',
    steps: '去水印 -> 取左上角背景色去背 -> 缩放到 144 x 144 -> 底部扩展 48px。',
    warning: '不适合普通大图，也不会生成动作帧。',
    en: 'For one RPGMaker character asset: remove watermark, key out the top-left background color, resize to 144 x 144, then extend the bottom canvas by 48px.',
  },
  allActions: {
    title: '整图动作图预处理',
    subtitle: 'Full-sheet preprocessing',
    use: '适合已经排好版的动作整图，只想先做基础清理时使用。',
    steps: '保留整张图布局 -> 去水印 -> 缩放到 256 x 256 -> 取左上角背景色去背。',
    warning: '不会切割图片，也不会自动生成动作；动作制作请去“角色动作包制作”。',
    en: 'For a prepared full action sheet: keep the layout, remove watermark, resize to 256 x 256, and key out the top-left background color. It does not split frames or generate actions.',
  },
}

function quickActionHelp(tip: { use: string; steps: string; warning: string; en: string }) {
  return (
    <div className="image-resize-action-tip">
      <strong>用途</strong>
      <span>{tip.use}</span>
      <strong>处理步骤</strong>
      <span>{tip.steps}</span>
      <strong>注意</strong>
      <span>{tip.warning}</span>
      <strong>English</strong>
      <span>{tip.en}</span>
    </div>
  )
}

function objectUrlSetter(setter: Dispatch<SetStateAction<string | null>>) {
  return (blob: Blob) => {
    setter((old) => {
      if (old) URL.revokeObjectURL(old)
      return URL.createObjectURL(blob)
    })
  }
}

function fileToBlob(file: File): Promise<Blob> {
  return file.arrayBuffer().then((buffer) => new Blob([buffer], { type: file.type || 'image/png' }))
}

function EyedropperIcon() {
  return (
    <svg className="image-eyedropper-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M14.7 4.3a2.4 2.4 0 0 1 3.4 0l1.6 1.6a2.4 2.4 0 0 1 0 3.4l-2 2 1 1a1 1 0 0 1 0 1.4l-1 1a1 1 0 0 1-1.4 0l-.7-.7-7.2 7.2H3v-5.4l7.2-7.2-.9-.9a1 1 0 0 1 0-1.4l1-1a1 1 0 0 1 1.4 0l1 1 2-2Z" />
      <path d="m11.7 10.3 2 2" />
      <path d="M5.4 17.1v1.5h1.5l7.3-7.3-1.5-1.5-7.3 7.3Z" />
    </svg>
  )
}

export default function ImageResizeStroke({ onSendToFineProcess }: ImageResizeStrokeProps = {}) {
  const { t } = useLanguage()
  const [file, setFile] = useState<File | null>(null)
  const [originalUrl, setOriginalUrl] = useState<string | null>(null)
  const [originalSize, setOriginalSize] = useState<{ w: number; h: number } | null>(null)
  const [useLocalCrop, setUseLocalCrop] = useState(false)
  const [cropRegion, setCropRegion] = useState(EMPTY_CROP)
  const [bgColor, setBgColor] = useState('#ffffff')
  const [matteTolerance, setMatteTolerance] = useState(40)
  const [matteFeather, setMatteFeather] = useState(5)
  const [enableMatte, setEnableMatte] = useState(false)
  const [pickingColor, setPickingColor] = useState(false)
  const [mattePreviewUrl, setMattePreviewUrl] = useState<string | null>(null)
  const [targetW, setTargetW] = useState(256)
  const [targetH, setTargetH] = useState(256)
  const [keepAspect, setKeepAspect] = useState(true)
  const [pixelated, setPixelated] = useState(true)
  const [strokeWidth, setStrokeWidth] = useState(0)
  const [strokeColor, setStrokeColor] = useState('#000000')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null)
  const [loading, setLoading] = useState(false)
  const [matteLoading, setMatteLoading] = useState(false)
  const [extendLoading, setExtendLoading] = useState(false)
  const [oneClickLoading, setOneClickLoading] = useState(false)
  const [oneClickAllActionsLoading, setOneClickAllActionsLoading] = useState(false)
  const [cropApplyLoading, setCropApplyLoading] = useState(false)

  const setPreviewObjectUrl = useMemo(() => objectUrlSetter(setPreviewUrl), [])
  const setMatteObjectUrl = useMemo(() => objectUrlSetter(setMattePreviewUrl), [])
  const originalPreviewImageRef = useRef<HTMLImageElement>(null)
  const suppressUploadClickRef = useRef(false)
  const urlsRef = useRef({ originalUrl: null as string | null, previewUrl: null as string | null, mattePreviewUrl: null as string | null })
  urlsRef.current = { originalUrl, previewUrl, mattePreviewUrl }

  const activeCropRegion = useLocalCrop ? cropRegion : EMPTY_CROP
  const croppedW = originalSize ? Math.max(1, originalSize.w - activeCropRegion.left - activeCropRegion.right) : 0
  const croppedH = originalSize ? Math.max(1, originalSize.h - activeCropRegion.top - activeCropRegion.bottom) : 0
  const minCropW = originalSize ? Math.min(MIN_LOCAL_CROP_SIZE, originalSize.w) : 1
  const minCropH = originalSize ? Math.min(MIN_LOCAL_CROP_SIZE, originalSize.h) : 1
  const aspectRatio = croppedW > 0 && croppedH > 0 ? croppedH / croppedW : 1
  const hasCrop = useLocalCrop && (cropRegion.left > 0 || cropRegion.top > 0 || cropRegion.right > 0 || cropRegion.bottom > 0)
  const oneClickBusy = oneClickLoading || oneClickAllActionsLoading

  useEffect(
    () => () => {
      if (urlsRef.current.originalUrl) URL.revokeObjectURL(urlsRef.current.originalUrl)
      if (urlsRef.current.previewUrl) URL.revokeObjectURL(urlsRef.current.previewUrl)
      if (urlsRef.current.mattePreviewUrl) URL.revokeObjectURL(urlsRef.current.mattePreviewUrl)
    },
    []
  )

  useEffect(() => {
    if (croppedW > 0 && croppedH > 0) {
      setTargetW(croppedW)
      setTargetH(croppedH)
    }
  }, [croppedW, croppedH])

  const clearResult = () => {
    setMattePreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old)
      return null
    })
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old)
      return null
    })
    setPreviewBlob(null)
  }

  const handleFile = (nextFile: File | null) => {
    if (originalUrl) URL.revokeObjectURL(originalUrl)
    setFile(nextFile)
    setOriginalUrl(null)
    setOriginalSize(null)
    setUseLocalCrop(false)
    setCropRegion(EMPTY_CROP)
    setPickingColor(false)
    clearResult()
    if (!nextFile) return

    const url = URL.createObjectURL(nextFile)
    setOriginalUrl(url)
    const img = new Image()
    img.onload = () => setOriginalSize({ w: img.width, h: img.height })
    img.onerror = () => message.error(formatError(new Error('ERR_IMAGE_LOAD'), t))
    img.src = url
  }

  const replaceCurrentImage = (blob: Blob, name: string, size: { w: number; h: number }) => {
    if (originalUrl) URL.revokeObjectURL(originalUrl)
    const nextFile = new File([blob], name, { type: blob.type || 'image/png' })
    const nextUrl = URL.createObjectURL(blob)
    setFile(nextFile)
    setOriginalUrl(nextUrl)
    setOriginalSize(size)
    setTargetW(size.w)
    setTargetH(size.h)
    setUseLocalCrop(false)
    setCropRegion(EMPTY_CROP)
    setPickingColor(false)
    clearResult()
  }

  const readWorkingBlob = async () => {
    if (!file) throw new Error('ERR_IMAGE_LOAD')
    let blob = await fileToBlob(file)
    if (useLocalCrop) blob = await cropImageBlob(blob, cropRegion)
    return blob
  }

  const dataUrlFromBlob = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('ERR_IMAGE_LOAD'))
      reader.readAsDataURL(blob)
    })

  const applyTopLeftMatte = async (blob: Blob, tolerance = 80, feather = 5) => {
    const { r, g, b } = await getTopLeftPixelColor(blob)
    const dataUrl = await dataUrlFromBlob(blob)
    const { dataUrl: matteDataUrl } = await applyChromaKeyContiguousFromTopLeft(dataUrl, r, g, b, tolerance, feather)
    return fetch(matteDataUrl).then((res) => res.blob())
  }

  const applySelectedMatte = async (blob: Blob) => {
    const match = bgColor.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i)
    if (!match) return blob
    const dataUrl = await dataUrlFromBlob(blob)
    const { dataUrl: matteDataUrl } = await applyChromaKey(
      dataUrl,
      parseInt(match[1], 16),
      parseInt(match[2], 16),
      parseInt(match[3], 16),
      matteTolerance,
      matteFeather
    )
    return fetch(matteDataUrl).then((res) => res.blob())
  }

  const handlePickColor = (r: number, g: number, b: number) => {
    setBgColor(`#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`)
    setEnableMatte(true)
    setPickingColor(false)
    message.success(t('pickedBgColor', { color: [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('') }))
  }

  const pickColorFromOriginalPreview = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pickingColor) return
    event.preventDefault()
    event.stopPropagation()
    suppressUploadClickRef.current = true
    const img = originalPreviewImageRef.current
    if (!img || !originalSize) return
    const rect = img.getBoundingClientRect()
    const x = Math.max(0, Math.min(originalSize.w - 1, Math.floor(((event.clientX - rect.left) / rect.width) * originalSize.w)))
    const y = Math.max(0, Math.min(originalSize.h - 1, Math.floor(((event.clientY - rect.top) / rect.height) * originalSize.h)))
    const canvas = document.createElement('canvas')
    canvas.width = originalSize.w
    canvas.height = originalSize.h
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(img, 0, 0, originalSize.w, originalSize.h)
    const [r, g, b] = ctx.getImageData(x, y, 1, 1).data
    handlePickColor(r, g, b)
  }

  const stopUploadClickWhilePicking = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!pickingColor && !suppressUploadClickRef.current) return
    event.preventDefault()
    event.stopPropagation()
    suppressUploadClickRef.current = false
  }

  const runMattePreview = async () => {
    if (!file || !bgColor) return
    setMatteLoading(true)
    try {
      const blob = await applySelectedMatte(await readWorkingBlob())
      setMatteObjectUrl(blob)
      message.success(t('matteSuccess', { n: 1 }))
    } catch (error) {
      message.error(t('matteFailed') + ': ' + formatError(error, t))
    } finally {
      setMatteLoading(false)
    }
  }

  const applyLocalCropToCurrentImage = async () => {
    if (!file || !hasCrop || !originalSize) {
      message.info('请先调整裁剪框 / Adjust the crop box first')
      return
    }
    setCropApplyLoading(true)
    try {
      const blob = await cropImageBlob(await fileToBlob(file), cropRegion)
      const baseName = file.name?.replace(/\.[^.]+$/, '') || 'image'
      replaceCurrentImage(blob, `${baseName}_crop.png`, { w: croppedW, h: croppedH })
      message.success('已应用局部抠图，当前图片已更新 / Crop applied to current image')
    } catch (error) {
      message.error(t('exportFailed') + ': ' + formatError(error, t))
    } finally {
      setCropApplyLoading(false)
    }
  }

  const handleTargetWChange = (w: number) => {
    setTargetW(w)
    if (keepAspect && aspectRatio > 0) setTargetH(Math.round(w * aspectRatio))
  }

  const handleTargetHChange = (h: number) => {
    setTargetH(h)
    if (keepAspect && aspectRatio > 0) setTargetW(Math.round(h / aspectRatio))
  }

  const applyPreview = async () => {
    if (!file) return
    setLoading(true)
    try {
      let blob = await readWorkingBlob()
      if (enableMatte) blob = await applySelectedMatte(blob)
      blob = await resizeImageToBlob(blob, targetW, targetH, keepAspect, pixelated)
      if (strokeWidth > 0) blob = await applyInnerStroke(blob, strokeWidth, strokeColor)
      setPreviewBlob(blob)
      setPreviewObjectUrl(blob)
      message.success(strokeWidth > 0 ? t('applyStrokeSuccess') : t('imgResizeSuccess'))
    } catch (error) {
      message.error(t('exportFailed') + ': ' + formatError(error, t))
    } finally {
      setLoading(false)
    }
  }

  const download = () => {
    if (!previewBlob) return
    const url = URL.createObjectURL(previewBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = (file?.name?.replace(/\.[^.]+$/, '') || 'output') + '_processed.png'
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    message.success(t('downloadStarted'))
  }

  const handleExtendBottom = async () => {
    if (!previewBlob) return
    setExtendLoading(true)
    try {
      const blob = await extendImageBottom(previewBlob, 48)
      setPreviewBlob(blob)
      setPreviewObjectUrl(blob)
      message.success(t('imgExtendBottomSuccess'))
    } catch (error) {
      message.error(t('exportFailed') + ': ' + formatError(error, t))
    } finally {
      setExtendLoading(false)
    }
  }

  const runQuickAction = async (
    setBusy: (busy: boolean) => void,
    process: (source: Blob) => Promise<Blob>,
    successKey: string
  ) => {
    if (!file) {
      message.info('请先上传图片 / Upload an image first')
      return
    }
    setBusy(true)
    clearResult()
    try {
      const result = await process(await fileToBlob(file))
      setPreviewBlob(result)
      setPreviewObjectUrl(result)
      message.success(t(successKey))
    } catch (error) {
      message.error(t('exportFailed') + ': ' + formatError(error, t))
    } finally {
      setBusy(false)
    }
  }

  const handleOneClickProcess = () =>
    runQuickAction(
      setOneClickLoading,
      async (source) => {
        let blob = await removeGeminiWatermarkFromBlob(source)
        blob = await applyTopLeftMatte(blob, 80, 5)
        blob = await resizeImageToBlob(blob, 144, 144, false, true)
        return extendImageBottom(blob, 48)
      },
      'imgOneClickSuccess'
    )

  const handleOneClickAllActionsProcess = () =>
    runQuickAction(
      setOneClickAllActionsLoading,
      async (source) => {
        let blob = await removeGeminiWatermarkFromBlob(source)
        blob = await resizeImageToBlob(blob, 256, 256, false, true)
        blob = await applyTopLeftMatte(blob, 80, 5)
        return blob
      },
      'imgOneClickAllActionsSuccess'
    )

  return (
    <div className="image-resize-workbench">
      <section className="image-resize-stage">
        <StashDropZone onStashDrop={(nextFile) => handleFile(nextFile)} maxSizeMB={0}>
          <Dragger
            name="file"
            multiple={false}
            accept={IMAGE_ALLOWED.join(',')}
            maxCount={1}
            showUploadList={false}
            openFileDialogOnClick={!pickingColor}
            fileList={file ? [{ uid: '1', name: file.name, size: file.size } as UploadFile] : []}
            beforeUpload={(nextFile) => {
              const ext = '.' + (nextFile.name.split('.').pop() || '').toLowerCase()
              if (!IMAGE_ALLOWED.includes(ext)) {
                message.error(t('imageFormatError'))
                return Upload.LIST_IGNORE
              }
              handleFile(nextFile)
              return false
            }}
            onRemove={() => handleFile(null)}
          >
            {originalUrl ? (
              <div
                className={`image-resize-upload-preview ${hasCrop ? 'has-local-crop' : ''} ${pickingColor ? 'is-picking-color' : ''}`}
                onPointerDown={pickColorFromOriginalPreview}
                onClickCapture={stopUploadClickWhilePicking}
              >
                {hasCrop && originalSize ? (
                  <div
                    className="image-resize-cropped-stage-preview"
                    style={{
                      aspectRatio: `${croppedW} / ${croppedH}`,
                      maxWidth: `min(100%, ${Math.round((croppedW / Math.max(1, croppedH)) * 360)}px)`,
                    }}
                  >
                    <img
                      ref={originalPreviewImageRef}
                      src={originalUrl}
                      alt={file?.name ?? t('imgOriginalPreview')}
                      style={{
                        width: `${(originalSize.w / croppedW) * 100}%`,
                        height: `${(originalSize.h / croppedH) * 100}%`,
                        transform: `translate(-${(cropRegion.left / originalSize.w) * 100}%, -${(cropRegion.top / originalSize.h) * 100}%)`,
                      }}
                    />
                    <span>局部裁剪预览 / Local crop preview</span>
                  </div>
                ) : (
                  <img ref={originalPreviewImageRef} src={originalUrl} alt={file?.name ?? t('imgOriginalPreview')} />
                )}
                {pickingColor && <em>吸管模式：点击要去除的背景色 / Click target background color</em>}
                <strong>{file?.name}</strong>
                <span>
                  {hasCrop
                    ? `当前裁剪尺寸: ${croppedW} × ${croppedH}px / 原图: ${originalSize?.w} × ${originalSize?.h}px`
                    : originalSize
                      ? `${t('imgOriginalSize')}: ${originalSize.w} × ${originalSize.h}`
                      : t('imgOriginalPreview')}
                </span>
              </div>
            ) : (
              <div className="image-resize-empty-upload">
                <InboxOutlined />
                <strong>{t('imageUploadHint')}</strong>
                <span>{t('imageFormats')}</span>
              </div>
            )}
          </Dragger>
        </StashDropZone>

        {(previewUrl || mattePreviewUrl) && (
          <div className="image-resize-result-strip">
            {mattePreviewUrl && (
              <article>
                <Text strong>{t('imgMattePreview')}</Text>
                <div className="image-resize-checker-preview">
                  <img src={mattePreviewUrl} alt={t('imgMattePreview')} />
                </div>
              </article>
            )}
            {previewUrl && (
              <article>
                <Text strong>{t('imgPreview')}</Text>
                <div className="image-resize-checker-preview">
                  <StashableImage src={previewUrl} alt={t('imgPreview')} />
                </div>
                <Space wrap>
                  <Button type="primary" loading={extendLoading} onClick={handleExtendBottom}>
                    {t('imgExtendBottom')}
                  </Button>
                  <Button type="primary" icon={<DownloadOutlined />} onClick={download}>
                    {t('imgDownload')}
                  </Button>
                  {onSendToFineProcess && previewBlob && (
                    <Button
                      icon={<EditOutlined />}
                      onClick={() => {
                        const base = (file?.name?.replace(/\.[^.]+$/, '') || 'output') + '_for_fine.png'
                        onSendToFineProcess(previewBlob, base)
                        message.success(t('imgSendToFineProcessDone'))
                      }}
                    >
                      {t('imgSendToFineProcess')}
                    </Button>
                  )}
                </Space>
              </article>
            )}
          </div>
        )}
      </section>

      <aside className="image-resize-controls">
        {file && originalUrl && originalSize && (
          <>
            <div className="image-resize-control-section">
              <Space wrap align="center">
                <Button
                  type={useLocalCrop ? 'primary' : 'default'}
                  onClick={() => {
                    setUseLocalCrop((enabled) => !enabled)
                    setPickingColor(false)
                  }}
                >
                  局部抠图 / Local crop
                </Button>
                {useLocalCrop && (
                  <Button size="small" onClick={() => setCropRegion(EMPTY_CROP)}>
                    {t('resetCrop')}
                  </Button>
                )}
              </Space>
              {useLocalCrop && (
                <div className="image-resize-crop-panel">
                  <ImageCropEditor
                    imageUrl={originalUrl}
                    imageSize={originalSize}
                    cropRegion={cropRegion}
                    onChange={setCropRegion}
                    onPickColor={handlePickColor}
                    pickingColor={pickingColor}
                  />
                <Space className="image-resize-crop-actions" style={{ marginTop: 8 }} wrap>
                  <Text type="secondary">最小选区: {minCropW} × {minCropH}px</Text>
                  {hasCrop && (
                    <Text type="secondary">
                      {t('cropResultSize')}: {croppedW} × {croppedH}
                    </Text>
                  )}
                  <Text type="secondary">
                    应用后会把当前上传图片替换为裁剪后的图片。 / Applying replaces the current image with the crop.
                  </Text>
                  <Button type="primary" size="small" loading={cropApplyLoading} disabled={!hasCrop} onClick={applyLocalCropToCurrentImage}>
                    应用局部抠图 / Apply crop
                  </Button>
                </Space>
                  <Row gutter={8} style={{ marginTop: 10 }}>
                    <Col span={12}>
                      <InputNumber min={0} max={Math.max(0, originalSize.w - cropRegion.right - minCropW)} value={cropRegion.left} onChange={(value) => setCropRegion((r) => ({ ...r, left: value ?? 0 }))} addonBefore={t('left')} style={{ width: '100%', marginBottom: 8 }} />
                    </Col>
                    <Col span={12}>
                      <InputNumber min={0} max={Math.max(0, originalSize.w - cropRegion.left - minCropW)} value={cropRegion.right} onChange={(value) => setCropRegion((r) => ({ ...r, right: value ?? 0 }))} addonBefore={t('right')} style={{ width: '100%', marginBottom: 8 }} />
                    </Col>
                    <Col span={12}>
                      <InputNumber min={0} max={Math.max(0, originalSize.h - cropRegion.bottom - minCropH)} value={cropRegion.top} onChange={(value) => setCropRegion((r) => ({ ...r, top: value ?? 0 }))} addonBefore={t('top')} style={{ width: '100%', marginBottom: 8 }} />
                    </Col>
                    <Col span={12}>
                      <InputNumber min={0} max={Math.max(0, originalSize.h - cropRegion.top - minCropH)} value={cropRegion.bottom} onChange={(value) => setCropRegion((r) => ({ ...r, bottom: value ?? 0 }))} addonBefore={t('bottom')} style={{ width: '100%', marginBottom: 8 }} />
                    </Col>
                  </Row>
                </div>
              )}
            </div>

            <Divider />
            <div className="image-resize-control-section">
              <Text strong>{t('imgMatteSection')}</Text>
              <Space wrap align="center">
                <Checkbox checked={enableMatte} onChange={(event) => setEnableMatte(event.target.checked)}>
                  {t('imgEnableMatte')}
                </Checkbox>
                <ColorPicker value={bgColor} onChange={(_, hex) => setBgColor(hex || '#ffffff')} showText />
                <Tooltip
                  title={
                    <span>
                      吸管取色：点击按钮后，在上传图或局部抠图预览里点击要去除的背景色，系统会把该像素色号写入抠图颜色。
                      <br />
                      Eyedropper: click this, then click the background color you want to remove.
                    </span>
                  }
                >
                  <Button
                    type={pickingColor ? 'primary' : 'default'}
                    icon={<EyedropperIcon />}
                    className={`image-crop-eyedropper ${pickingColor ? 'is-active' : ''}`}
                    onClick={() => {
                      setEnableMatte(true)
                      setPickingColor((active) => !active)
                    }}
                  >
                    吸管取色 / Pick color
                  </Button>
                </Tooltip>
                {pickingColor && <Text className="image-crop-picking-status">点击图片吸取要去除的颜色 / Click image to sample</Text>}
                <Text type="secondary">{t('tolerance')}:</Text>
                <Slider min={1} max={100} value={matteTolerance} onChange={setMatteTolerance} style={{ width: 100 }} />
                <Text type="secondary">{t('featherEdge')}:</Text>
                <Slider min={0} max={30} value={matteFeather} onChange={setMatteFeather} style={{ width: 100 }} />
                <Button type="primary" loading={matteLoading} onClick={runMattePreview} disabled={!enableMatte}>
                  {t('imgRunMatte')}
                </Button>
              </Space>
            </div>

            <Divider />
            <div className="image-resize-control-section">
              <Text strong>{t('customSize')}</Text>
              <Space wrap>
                <InputNumber min={16} max={4096} value={targetW} onChange={(value) => handleTargetWChange(value ?? 256)} addonBefore={t('width')} style={{ width: 130 }} />
                <InputNumber min={16} max={4096} value={targetH} onChange={(value) => handleTargetHChange(value ?? 256)} addonBefore={t('height')} style={{ width: 130 }} />
                <Button size="small" type={keepAspect ? 'primary' : 'default'} onClick={() => setKeepAspect(true)}>
                  {t('imgKeepAspect')}
                </Button>
                <Button size="small" type={!keepAspect ? 'primary' : 'default'} onClick={() => setKeepAspect(false)}>
                  {t('imgStretch')}
                </Button>
                <Checkbox checked={pixelated} onChange={(event) => setPixelated(event.target.checked)}>
                  {t('imgPixelated')}
                </Checkbox>
              </Space>
            </div>

            <Divider />
            <div className="image-resize-control-section">
              <Text strong>{t('imgStrokeSection')}</Text>
              <Space wrap align="center">
                <Text type="secondary">{t('strokeWidth')}:</Text>
                <Slider min={0} max={20} value={strokeWidth} onChange={setStrokeWidth} style={{ width: 120 }} />
                <Text type="secondary">{strokeWidth}</Text>
                <ColorPicker value={strokeColor} onChange={(_, hex) => setStrokeColor(hex || '#000000')} showText />
                <Button type="primary" icon={<DownloadOutlined />} onClick={applyPreview} loading={loading}>
                  {t('imgApplyPreview')}
                </Button>
              </Space>
            </div>
          </>
        )}
        {!file && (
          <div className="image-resize-control-section image-resize-empty-controls">
            <Text strong>上传图片后开始编辑</Text>
            <Text type="secondary">通用流程会在这里显示：局部裁剪、抠图取色、缩放、画布、描边和 PNG 预览。</Text>
          </div>
        )}
        <Divider />
        <details className="image-resize-advanced-presets">
          <summary>
            <span>高级模板预设</span>
            <small>仅用于 RPGMaker 或固定动作整图模板</small>
          </summary>
          <div className="image-resize-advanced-presets-body">
            <Text type="secondary">
              默认不使用。普通素材请走上方通用流程；这里的预设会固定尺寸和处理步骤。
            </Text>
            <div className="image-resize-quick-grid">
              <Tooltip placement="top" title={quickActionHelp(QUICK_ACTION_COPY.rpgmaker)}>
                <article className="image-resize-quick-card">
                  <span className="image-resize-quick-badge">模板专用</span>
                  <strong>{QUICK_ACTION_COPY.rpgmaker.title}</strong>
                  <small>{QUICK_ACTION_COPY.rpgmaker.subtitle}</small>
                  <p>{QUICK_ACTION_COPY.rpgmaker.use}</p>
                  <ul>
                    <li>{QUICK_ACTION_COPY.rpgmaker.steps}</li>
                    <li>{QUICK_ACTION_COPY.rpgmaker.warning}</li>
                  </ul>
                  <Button type="primary" block loading={oneClickLoading} onClick={handleOneClickProcess} disabled={oneClickBusy && !oneClickLoading}>
                    执行 RPGMaker 适配
                  </Button>
                </article>
              </Tooltip>
              <Tooltip placement="top" title={quickActionHelp(QUICK_ACTION_COPY.allActions)}>
                <article className="image-resize-quick-card">
                  <span className="image-resize-quick-badge">整图预处理</span>
                  <strong>{QUICK_ACTION_COPY.allActions.title}</strong>
                  <small>{QUICK_ACTION_COPY.allActions.subtitle}</small>
                  <p>{QUICK_ACTION_COPY.allActions.use}</p>
                  <ul>
                    <li>{QUICK_ACTION_COPY.allActions.steps}</li>
                    <li>{QUICK_ACTION_COPY.allActions.warning}</li>
                  </ul>
                  <Button type="primary" block loading={oneClickAllActionsLoading} onClick={handleOneClickAllActionsProcess} disabled={oneClickBusy && !oneClickAllActionsLoading}>
                    执行动作图预处理
                  </Button>
                </article>
              </Tooltip>
            </div>
          </div>
        </details>
      </aside>
    </div>
  )
}
