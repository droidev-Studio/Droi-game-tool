import { useEffect, useRef, useState } from 'react'
import {
  BgColorsOutlined,
  DownloadOutlined,
  InboxOutlined,
  SendOutlined,
} from '@ant-design/icons'
import { App, Button, InputNumber, Progress, Segmented, Spin, Switch, Typography } from 'antd'
import { DROI_GAME_TOOL_PROTOCOL, postToolHostMessage, type GameProjectContext } from '../tools/toolHostBridge'
import { runInBatches } from '../lib/media-tools/batchRunner'
import { blobToDataUrl, downloadBlob, makeId, safeBaseName } from '../lib/media-tools/imageLoader'
import { applyLocalMatte, DEFAULT_LOCAL_MATTE_OPTIONS, pickCornerKeyColor, type LocalMatteMode, type LocalMatteOptions } from '../lib/media-tools/localMatte'
import { removeBackgroundIfNeeded } from '../lib/media-tools/matteClient'
import { createZip } from '../lib/media-tools/zipExport'
import './AssetBackgroundRemovalPanel.css'

const { Text } = Typography

type PreviewBackground = 'checker' | 'dark' | 'light'
type ProcessMode = 'ai' | 'local'

type MatteItem = {
  id: string
  file: File
  sourceUrl: string
  resultUrl?: string
  resultBlob?: Blob
  status: 'queued' | 'processing' | 'transparent' | 'processed' | 'failed' | 'too-large'
  skipped?: boolean
  errorMessage?: string
}

type Props = {
  toolId?: string
  embed?: boolean
  projectContext?: GameProjectContext | null
}

function resultFileName(file: File): string {
  return `${safeBaseName(file.name)}_transparent.png`
}

function errorMessageFromUnknown(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'Background removal failed.'
}

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

export default function AssetBackgroundRemovalPanel({ toolId = 'image-process', embed = false, projectContext = null }: Props) {
  const { message } = App.useApp()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [items, setItems] = useState<MatteItem[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [processProgress, setProcessProgress] = useState(0)
  const [previewBg, setPreviewBg] = useState<PreviewBackground>('checker')
  const [processMode, setProcessMode] = useState<ProcessMode>('ai')
  const [localOptions, setLocalOptions] = useState<LocalMatteOptions>(DEFAULT_LOCAL_MATTE_OPTIONS)
  const cleanupRef = useRef<MatteItem[]>([])
  const processAbortRef = useRef<AbortController | null>(null)
  cleanupRef.current = items

  useEffect(() => {
    return () => {
      cleanupRef.current.forEach((item) => {
        URL.revokeObjectURL(item.sourceUrl)
        if (item.resultUrl) URL.revokeObjectURL(item.resultUrl)
      })
    }
  }, [])

  const activeItem = items.find((item) => item.id === activeId) ?? items[0] ?? null
  const finishedCount = items.filter((item) => item.resultBlob).length
  const canExport = finishedCount > 0
  const localMatteModeOptions: Array<{ label: string; value: LocalMatteMode }> = [
    { label: 'Chroma', value: 'chroma' },
    { label: 'Luma', value: 'luma' },
    { label: 'None', value: 'none' },
  ]

  const patchLocalOptions = (patch: Partial<LocalMatteOptions>) => {
    setLocalOptions((prev) => ({ ...prev, ...patch }))
  }

  const applyChromaPreset = (keyColor: string) => {
    patchLocalOptions({
      mode: 'chroma',
      keyColor,
      threshold: keyColor === '#ffffff' || keyColor === '#000000' ? 46 : 76,
      softness: keyColor === '#ffffff' || keyColor === '#000000' ? 18 : 28,
      despill: keyColor === '#00ff00' || keyColor === '#0066ff' ? 1.15 : 0,
      halo: keyColor === '#00ff00' || keyColor === '#0066ff' ? 1 : 0,
    })
  }

  const applyLumaPreset = (kind: 'soft' | 'balanced' | 'glow') => {
    const presets: Record<typeof kind, Partial<LocalMatteOptions>> = {
      soft: { mode: 'luma', lumaBlack: 16, lumaWhite: 130, lumaGamma: 0.75, lumaStrength: 1.15, halo: 0 },
      balanced: { mode: 'luma', lumaBlack: 28, lumaWhite: 92, lumaGamma: 0.58, lumaStrength: 1.55, halo: 0 },
      glow: { mode: 'luma', lumaBlack: 40, lumaWhite: 66, lumaGamma: 0.46, lumaStrength: 1.9, halo: 0 },
    }
    patchLocalOptions(presets[kind])
  }

  const addFiles = (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/') && !file.type.includes('gif'))
    if (!imageFiles.length) {
      message.warning('Choose PNG, JPG, or WebP images.')
      return
    }
    const nextItems = imageFiles.map((file): MatteItem => ({
      id: makeId('matte'),
      file,
      sourceUrl: URL.createObjectURL(file),
      status: 'queued',
    }))
    setItems((prev) => [...prev, ...nextItems])
    setActiveId((prev) => prev ?? nextItems[0]?.id ?? null)
  }

  const updateItem = (id: string, patch: Partial<MatteItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  const throwIfAborted = (signal?: AbortSignal) => {
    if (signal?.aborted) throw new DOMException('Background removal canceled.', 'AbortError')
  }

  const processItem = async (item: MatteItem, signal?: AbortSignal) => {
    throwIfAborted(signal)
    updateItem(item.id, { status: 'processing', errorMessage: undefined })
    if (processMode === 'local') {
      const blob = await applyLocalMatte(item.file, item.file.name, localOptions)
      throwIfAborted(signal)
      const resultUrl = URL.createObjectURL(blob)
      if (item.resultUrl) URL.revokeObjectURL(item.resultUrl)
      updateItem(item.id, {
        resultBlob: blob,
        resultUrl,
        status: localOptions.mode === 'none' ? 'transparent' : 'processed',
        skipped: localOptions.mode === 'none',
        errorMessage: undefined,
      })
    } else {
      const result = await removeBackgroundIfNeeded(item.file, { skipTransparent: true, signal })
      if (item.resultUrl) URL.revokeObjectURL(item.resultUrl)
      if (result.status === 'failed' || result.status === 'too-large') {
        updateItem(item.id, {
          resultBlob: undefined,
          resultUrl: undefined,
          status: result.status,
          skipped: result.skipped,
          errorMessage: result.status === 'too-large' ? 'Image exceeds the server matte limit.' : errorMessageFromUnknown(result.error),
        })
        return
      }
      const resultUrl = URL.createObjectURL(result.blob)
      updateItem(item.id, {
        resultBlob: result.blob,
        resultUrl,
        status: result.status,
        skipped: result.skipped,
        errorMessage: undefined,
      })
    }
  }

  const previewActive = async () => {
    if (!activeItem || processing) return
    const controller = new AbortController()
    processAbortRef.current = controller
    setProcessing(true)
    setProcessProgress(0)
    try {
      await processItem(activeItem, controller.signal)
      setProcessProgress(100)
      message.success(processMode === 'local' ? 'Preview updated with local matte settings.' : 'Preview updated with AI matte.')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        message.info('Background removal canceled.')
        return
      }
      updateItem(activeItem.id, { status: 'failed' })
      message.error(error instanceof Error ? error.message : 'Preview failed.')
    } finally {
      setProcessing(false)
      processAbortRef.current = null
      window.setTimeout(() => setProcessProgress(0), 700)
    }
  }

  const pickActiveCornerColor = async () => {
    if (!activeItem) return
    try {
      const keyColor = await pickCornerKeyColor(activeItem.file, activeItem.file.name)
      patchLocalOptions({ keyColor, mode: 'chroma' })
      message.success(`Key color picked: ${keyColor}`)
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Key color pick failed.')
    }
  }

  const processAll = async () => {
    if (!items.length || processing) return
    const pendingItems = items.filter((item) => !item.resultBlob)
    if (!pendingItems.length) return
    const controller = new AbortController()
    processAbortRef.current = controller
    setProcessing(true)
    setProcessProgress(0)
    try {
      await runInBatches(
        pendingItems,
        async (item) => {
          await processItem(item, controller.signal)
          return true
        },
        {
          batchSize: 3,
          onProgress: ({ done, total }) => setProcessProgress(Math.round((done / Math.max(1, total)) * 100)),
        },
      )
      message.success('Background removal finished.')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        message.info('Background removal canceled.')
        return
      }
      message.error(error instanceof Error ? error.message : 'Background removal failed.')
    } finally {
      setProcessing(false)
      processAbortRef.current = null
      window.setTimeout(() => setProcessProgress(0), 700)
    }
  }

  const cancelProcessing = () => {
    processAbortRef.current?.abort()
  }

  const exportZip = async () => {
    const processed = items.filter((item) => item.resultBlob)
    if (!processed.length) return
    const manifest = {
      version: 1,
      format: 'droi-background-removed-pack',
      assets: processed.map((item, index) => ({
        id: item.id,
        index,
        sourceName: item.file.name,
        file: `transparent/${resultFileName(item.file)}`,
        status: item.status,
        skipped: Boolean(item.skipped),
      })),
    }
    const zipBlob = await createZip([
      ...processed.map((item) => ({
        path: `transparent/${resultFileName(item.file)}`,
        blob: item.resultBlob as Blob,
      })),
      { path: 'manifest.json', blob: JSON.stringify(manifest, null, 2) },
    ])
    downloadBlob(zipBlob, 'background_removed_pack.zip')
    if (embed) {
      postToolHostMessage({
        type: 'droi.tool.exportArtifact.v1',
        protocol: DROI_GAME_TOOL_PROTOCOL,
        toolId,
        artifact: {
          toolId,
          artifactType: 'matteAsset',
          files: [
            {
              name: 'background_removed_pack.zip',
              mimeType: 'application/zip',
              dataUrl: await blobToDataUrl(zipBlob),
            },
            {
              name: 'manifest.json',
              mimeType: 'application/json',
              dataUrl: await blobToDataUrl(new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' })),
            },
          ],
          metadata: droiTargetMetadata(projectContext, 'export-matte-asset'),
        },
      })
    }
  }

  return (
    <div className="ai-bg-page is-embedded-panel">
      <main className="ai-bg-layout">
        <aside className="ai-bg-sidebar">
          <section className="ai-bg-panel">
            <Text className="ai-bg-section">Import</Text>
            <input
              ref={inputRef}
              hidden
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => event.target.files && addFiles(event.target.files)}
            />
            <button className="ai-bg-drop" type="button" onClick={() => inputRef.current?.click()}>
              <InboxOutlined />
              <strong>Upload Images</strong>
              <span>PNG, JPG, and WebP. Browser import has no extra size cap; AI matte is bounded by the server upload limit.</span>
            </button>
            <Segmented<ProcessMode>
              value={processMode}
              onChange={setProcessMode}
              options={[
                { label: 'AI Matte', value: 'ai' },
                { label: 'Local Key', value: 'local' },
              ]}
            />
            {processMode === 'local' && (
              <div className="ai-bg-local-settings">
                <label className="ai-bg-field">
                  <span>Mode</span>
                  <Segmented<LocalMatteMode>
                    value={localOptions.mode}
                    onChange={(mode) => patchLocalOptions({ mode })}
                    options={localMatteModeOptions}
                  />
                </label>
                {localOptions.mode === 'chroma' && (
                  <>
                    <div className="ai-bg-preset-row">
                      <Button size="small" onClick={() => applyChromaPreset('#00ff00')}>Green</Button>
                      <Button size="small" onClick={() => applyChromaPreset('#0066ff')}>Blue</Button>
                      <Button size="small" onClick={() => applyChromaPreset('#ffffff')}>White</Button>
                      <Button size="small" onClick={() => applyChromaPreset('#000000')}>Black</Button>
                    </div>
                    <label className="ai-bg-field">
                      <span>Key Color</span>
                      <div className="ai-bg-color-row">
                        <input
                          type="color"
                          value={localOptions.keyColor}
                          onChange={(event) => patchLocalOptions({ keyColor: event.target.value })}
                        />
                        <code>{localOptions.keyColor}</code>
                        <Button size="small" onClick={pickActiveCornerColor} disabled={!activeItem || processing}>Corners</Button>
                      </div>
                    </label>
                    <label className="ai-bg-field">
                      <span>Threshold</span>
                      <InputNumber min={0} max={255} value={localOptions.threshold} onChange={(value) => patchLocalOptions({ threshold: Number(value) || 0 })} />
                    </label>
                    <label className="ai-bg-field">
                      <span>Soft Edge</span>
                      <InputNumber min={0} max={128} value={localOptions.softness} onChange={(value) => patchLocalOptions({ softness: Number(value) || 0 })} />
                    </label>
                    <label className="ai-bg-field">
                      <span>Despill</span>
                      <InputNumber min={0} max={2.5} step={0.05} value={localOptions.despill} onChange={(value) => patchLocalOptions({ despill: Number(value) || 0 })} />
                    </label>
                  </>
                )}
                {localOptions.mode === 'luma' && (
                  <>
                    <div className="ai-bg-preset-row">
                      <Button size="small" onClick={() => applyLumaPreset('soft')}>Soft VFX</Button>
                      <Button size="small" onClick={() => applyLumaPreset('balanced')}>Balanced</Button>
                      <Button size="small" onClick={() => applyLumaPreset('glow')}>Strong Glow</Button>
                    </div>
                    <label className="ai-bg-field">
                      <span>Luma Black</span>
                      <InputNumber min={0} max={254} value={localOptions.lumaBlack} onChange={(value) => patchLocalOptions({ lumaBlack: Number(value) || 0 })} />
                    </label>
                    <label className="ai-bg-field">
                      <span>Luma White</span>
                      <InputNumber min={1} max={255} value={localOptions.lumaWhite} onChange={(value) => patchLocalOptions({ lumaWhite: Number(value) || 1 })} />
                    </label>
                    <label className="ai-bg-field">
                      <span>Luma Gamma</span>
                      <InputNumber min={0.05} max={4} step={0.05} value={localOptions.lumaGamma} onChange={(value) => patchLocalOptions({ lumaGamma: Number(value) || 1 })} />
                    </label>
                    <label className="ai-bg-field">
                      <span>Luma Strength</span>
                      <InputNumber min={0} max={2} step={0.05} value={localOptions.lumaStrength} onChange={(value) => patchLocalOptions({ lumaStrength: Number(value) || 1 })} />
                    </label>
                  </>
                )}
                <label className="ai-bg-field">
                  <span>Halo Shrink</span>
                  <InputNumber min={0} max={8} value={localOptions.halo} onChange={(value) => patchLocalOptions({ halo: Number(value) || 0 })} />
                </label>
                <label className="ai-bg-switch-row">
                  <Switch checked={localOptions.greenToBlack} onChange={(greenToBlack) => patchLocalOptions({ greenToBlack })} />
                  <span>Green edge to black</span>
                </label>
                <label className="ai-bg-switch-row">
                  <Switch checked={localOptions.semitransparentToBlack} onChange={(semitransparentToBlack) => patchLocalOptions({ semitransparentToBlack })} />
                  <span>Transparent RGB to black</span>
                </label>
              </div>
            )}
            <Button block disabled={!activeItem || processing} onClick={previewActive}>
              Preview Active
            </Button>
            <Button
              block
              className="ai-bg-primary"
              icon={<BgColorsOutlined />}
              disabled={!items.length}
              loading={processing}
              onClick={processAll}
            >
              Process All
            </Button>
            <Button block disabled={!processing} onClick={cancelProcessing}>
              Cancel Processing
            </Button>
            <Button block icon={<DownloadOutlined />} disabled={!canExport} onClick={exportZip}>
              Export ZIP
            </Button>
            <Progress
              percent={processing ? processProgress : (items.length ? Math.round((finishedCount / items.length) * 100) : 0)}
              size="small"
              strokeColor="#74e5ff"
              trailColor="rgba(255,255,255,.08)"
            />
          </section>

          <section className="ai-bg-panel ai-bg-list">
            <Text className="ai-bg-section">Queue</Text>
            {items.length ? (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`ai-bg-asset ${activeItem?.id === item.id ? 'is-active' : ''}`}
                  onClick={() => setActiveId(item.id)}
                >
                  <img src={item.resultUrl || item.sourceUrl} alt={item.file.name} />
                  <span>
                    <strong>{item.file.name}</strong>
                    <small>{item.status}</small>
                    {item.errorMessage && <em className="ai-bg-asset-error">{item.errorMessage}</em>}
                  </span>
                </button>
              ))
            ) : (
              <Text className="ai-bg-empty">No images uploaded.</Text>
            )}
          </section>
        </aside>

        <section className="ai-bg-stage">
          <div className="ai-bg-stage-toolbar">
            <Segmented<PreviewBackground>
              value={previewBg}
              onChange={setPreviewBg}
              options={[
                { label: 'Checker', value: 'checker' },
                { label: 'Dark', value: 'dark' },
                { label: 'Light', value: 'light' },
              ]}
            />
            <Button
              icon={<DownloadOutlined />}
              disabled={!activeItem?.resultBlob}
              onClick={() => activeItem?.resultBlob && downloadBlob(activeItem.resultBlob, resultFileName(activeItem.file))}
            >
              Download PNG
            </Button>
            <Button
              icon={<SendOutlined />}
              disabled={!activeItem?.resultBlob || !embed}
              onClick={async () => {
                if (!activeItem?.resultBlob) return
                postToolHostMessage({
                  type: 'droi.tool.exportArtifact.v1',
                  protocol: DROI_GAME_TOOL_PROTOCOL,
                  toolId,
                  artifact: {
                    toolId,
                    artifactType: 'matteAsset',
                    files: [{
                      name: resultFileName(activeItem.file),
                      mimeType: 'image/png',
                      dataUrl: await blobToDataUrl(activeItem.resultBlob),
                    }],
                    metadata: droiTargetMetadata(projectContext, 'send-single-matte-asset'),
                  },
                })
                message.success('Artifact sent to host.')
              }}
            >
              Send Artifact
            </Button>
          </div>

          <div className="ai-bg-preview-grid">
            <article>
              <Text className="ai-bg-section">Source</Text>
              <div className="ai-bg-preview">
                {activeItem ? <img src={activeItem.sourceUrl} alt={activeItem.file.name} /> : <span>Upload images to start.</span>}
              </div>
            </article>
            <article>
              <Text className="ai-bg-section">Transparent Result</Text>
              <div className={`ai-bg-preview is-${previewBg}`}>
                {activeItem?.status === 'processing' ? (
                  <div className="ai-bg-processing">
                    <Spin />
                    <span>Removing background...</span>
                  </div>
                ) : activeItem?.resultUrl ? (
                  <img src={activeItem.resultUrl} alt={`${activeItem.file.name} transparent result`} />
                ) : activeItem?.status === 'failed' ? (
                  <span>{activeItem.errorMessage || 'Background removal failed. Please check the API service and try again.'}</span>
                ) : activeItem?.status === 'too-large' ? (
                  <span>{activeItem.errorMessage || 'Image exceeds the server matte limit.'}</span>
                ) : (
                  <span>Run Process All to generate transparent PNGs.</span>
                )}
              </div>
            </article>
          </div>
        </section>
      </main>
    </div>
  )
}
