import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  DragOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  RetweetOutlined,
} from '@ant-design/icons'
import { App, Button, InputNumber, Progress, Segmented, Slider, Switch, Typography } from 'antd'
import { DROI_GAME_TOOL_PROTOCOL, postToolHostMessage, type GameProjectContext } from '../../tools/toolHostBridge'
import { runInBatches } from '../../lib/media-tools/batchRunner'
import { blobToDataUrl, downloadBlob, loadImageFromBlob, makeId, normalizeImageToCanvas } from '../../lib/media-tools/imageLoader'
import { frameFileName, sortFilesNatural } from '../../lib/media-tools/frameOrdering'
import { extractGifFrames } from '../../lib/media-tools/gifFrames'
import { createSpriteFrameManifest } from '../../lib/media-tools/frameManifest'
import { createSpriteSheet } from '../../lib/media-tools/spriteSheet'
import {
  extractFramesFromSpriteSheet,
  fetchBlob,
  fetchDirectFramesFromIndex,
  fetchJson,
  type ExtractedSheetFrame,
  type LegacySpriteSheetIndex,
} from '../../lib/media-tools/spriteSheetImport'
import { createZip } from '../../lib/media-tools/zipExport'
import { previewVideoFrame, runVideoFrameJob, type VideoFrameJobOptions, type VideoFrameJobResult } from '../../lib/media-tools/videoFrameJob'
import FrameImportToolbar from './FrameImportToolbar'
import VideoMattePanel from './VideoMattePanel'
import { useVideoMatteOptions } from './useVideoMatteOptions'
import './CharacterFrameImportPanel.css'

const { Text } = Typography

type PreviewBackground = 'checker' | 'dark' | 'light'

type ImportedFrame = {
  id: string
  name: string
  blob: Blob
  url: string
  source: 'image' | 'gif' | 'video'
}

type FrameSourceInput = {
  blob: Blob
  name: string
  source: ImportedFrame['source']
}

type Props = {
  onImportFrames: (files: File[]) => Promise<void> | void
  disabled?: boolean
  toolId?: string
  embed?: boolean
  projectId?: string | null
  projectContext?: GameProjectContext | null
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

async function createImportedFrame(input: FrameSourceInput, canvasSize: number): Promise<ImportedFrame> {
  const normalizedBlob = await normalizeImageToCanvas(input.blob, input.name, canvasSize)
  const loaded = await loadImageFromBlob(normalizedBlob, input.name)
  return {
    id: makeId('import_frame'),
    name: input.name,
    blob: normalizedBlob,
    url: loaded.url,
    source: input.source,
  }
}

function toPngFile(frame: ImportedFrame, index: number): File {
  const safeName = frame.name.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_') || `frame_${index + 1}`
  return new File([frame.blob], `${String(index + 1).padStart(3, '0')}_${safeName}.png`, { type: 'image/png' })
}

function reinsertFrame(frames: ImportedFrame[], fromIndex: number, toIndex: number): ImportedFrame[] {
  const next = [...frames]
  const [item] = next.splice(fromIndex, 1)
  if (!item) return frames
  next.splice(toIndex, 0, item)
  return next
}

export default function CharacterFrameImportPanel({
  onImportFrames,
  disabled = false,
  toolId = 'character-action',
  embed = false,
  projectId,
  projectContext = null,
}: Props) {
  const { message } = App.useApp()
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const videoInputRef = useRef<HTMLInputElement | null>(null)
  const videoPreviewInputRef = useRef<HTMLInputElement | null>(null)
  const cleanupRef = useRef<ImportedFrame[]>([])
  const videoPreviewCleanupRef = useRef<ImportedFrame | null>(null)
  const [frames, setFrames] = useState<ImportedFrame[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedFrameIds, setSelectedFrameIds] = useState<Set<string>>(new Set())
  const [playing, setPlaying] = useState(false)
  const [playIndex, setPlayIndex] = useState(0)
  const [fps, setFps] = useState(12)
  const [canvasSize, setCanvasSize] = useState(512)
  const [importRunning, setImportRunning] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [committing, setCommitting] = useState(false)
  const [exportRunning, setExportRunning] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [videoFps, setVideoFps] = useState(12)
  const [videoStart, setVideoStart] = useState(0)
  const [videoEnd, setVideoEnd] = useState<number | null>(null)
  const [maxFrames, setMaxFrames] = useState(120)
  const [videoProgress, setVideoProgress] = useState(0)
  const [videoRunning, setVideoRunning] = useState(false)
  const [videoResult, setVideoResult] = useState<VideoFrameJobResult | null>(null)
  const [videoPreviewRunning, setVideoPreviewRunning] = useState(false)
  const [videoPreviewFrame, setVideoPreviewFrame] = useState<ImportedFrame | null>(null)
  const [previewBg, setPreviewBg] = useState<PreviewBackground>('checker')
  const [reverseOutput, setReverseOutput] = useState(false)
  const videoMatte = useVideoMatteOptions()

  cleanupRef.current = frames
  videoPreviewCleanupRef.current = videoPreviewFrame

  useEffect(() => {
    return () => {
      cleanupRef.current.forEach((frame) => URL.revokeObjectURL(frame.url))
      if (videoPreviewCleanupRef.current) URL.revokeObjectURL(videoPreviewCleanupRef.current.url)
    }
  }, [])

  const activeFrames = useMemo(
    () => frames.filter((frame) => selectedFrameIds.has(frame.id)),
    [frames, selectedFrameIds],
  )
  const outputFrames = useMemo(
    () => (reverseOutput ? [...activeFrames].reverse() : activeFrames),
    [activeFrames, reverseOutput],
  )
  const playbackFrames = useMemo(
    () => (reverseOutput && outputFrames.length ? outputFrames : frames),
    [frames, outputFrames, reverseOutput],
  )

  useEffect(() => {
    if (!playing || playbackFrames.length === 0) return undefined
    const id = window.setInterval(() => {
      setPlayIndex((index) => (index + 1) % playbackFrames.length)
    }, Math.max(24, 1000 / fps))
    return () => window.clearInterval(id)
  }, [fps, playbackFrames.length, playing])

  const selectedTimelineFrame = useMemo(
    () => frames.find((frame) => frame.id === selectedId) ?? null,
    [frames, selectedId],
  )
  const selectedFrame = useMemo(
    () => (
      playing
        ? playbackFrames[Math.min(playIndex, Math.max(0, playbackFrames.length - 1))] ?? null
        : selectedTimelineFrame ?? playbackFrames[Math.min(playIndex, Math.max(0, playbackFrames.length - 1))] ?? videoPreviewFrame ?? null
    ),
    [playIndex, playbackFrames, playing, selectedTimelineFrame, videoPreviewFrame],
  )
  const busy = importRunning || videoRunning || videoPreviewRunning || committing || exportRunning
  const canMutate = !disabled && !busy

  function appendFrames(nextFrames: ImportedFrame[]) {
    setFrames((prev) => [...prev, ...nextFrames])
    setSelectedFrameIds((prev) => {
      const next = new Set(prev)
      nextFrames.forEach((frame) => next.add(frame.id))
      return next
    })
    setSelectedId((prev) => prev ?? nextFrames[0]?.id ?? null)
  }

  function currentVideoOptions(): VideoFrameJobOptions {
    return {
      fps: videoFps,
      startSec: videoStart,
      endSec: videoEnd ?? undefined,
      maxFrames,
      canvasSize,
      ...videoMatte.currentVideoMatteOptions(),
    }
  }

  async function addImageFiles(files: FileList | File[]) {
    if (!canMutate) return
    const allFiles = Array.from(files)
    if (!allFiles.length) return
    setImportRunning(true)
    setImportProgress(0)
    try {
      const inputs: FrameSourceInput[] = []
      for (const file of sortFilesNatural(allFiles)) {
        const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif')
        if (isGif) {
          const gifFrames = await extractGifFrames(file, 240, {
            batchSize: 3,
            onProgress: (done, total) => setImportProgress(Math.max(1, Math.round((done / Math.max(1, total)) * 30))),
          })
          gifFrames.forEach((gifFrame) => inputs.push({ blob: gifFrame.blob, name: gifFrame.name, source: 'gif' }))
        } else if (file.type.startsWith('image/')) {
          inputs.push({ blob: file, name: file.name, source: 'image' })
        }
      }
      if (!inputs.length) {
        message.warning('Upload PNG, JPG, WebP, or GIF frames.')
        return
      }
      const nextFrames = await runInBatches(
        inputs,
        (input) => createImportedFrame(input, canvasSize),
        {
          batchSize: 3,
          onProgress: ({ done, total }) => setImportProgress(30 + Math.round((done / Math.max(1, total)) * 70)),
        },
      )
      appendFrames(nextFrames)
      message.success(`Imported ${nextFrames.length} frame${nextFrames.length > 1 ? 's' : ''}.`)
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Frame import failed.')
    } finally {
      setImportRunning(false)
      window.setTimeout(() => setImportProgress(0), 700)
      if (imageInputRef.current) imageInputRef.current.value = ''
    }
  }

  async function runVideoImport(file: File | null | undefined) {
    if (!file || !canMutate) return
    setVideoRunning(true)
    setVideoProgress(0)
    setVideoResult(null)
    try {
      const result = await runVideoFrameJob(
        file,
        currentVideoOptions(),
        (progress) => setVideoProgress(Math.round(progress * 0.7)),
      )
      setVideoResult(result)
      const sheetIndex = await fetchJson<LegacySpriteSheetIndex>(result.indexUrl)
      let extractedFrames: ExtractedSheetFrame[] = await fetchDirectFramesFromIndex(result.jobId, sheetIndex, {
        baseName: file.name.replace(/\.[^.]+$/, '') || 'video_frame',
        batchSize: 3,
        onProgress: (done, total) => setVideoProgress(70 + Math.round((done / Math.max(1, total)) * 15)),
      })
      if (!extractedFrames.length) {
        const sheetBlob = await fetchBlob(result.spriteUrl)
        extractedFrames = await extractFramesFromSpriteSheet(sheetBlob, sheetIndex, {
          baseName: file.name.replace(/\.[^.]+$/, '') || 'video_frame',
          batchSize: 3,
          onProgress: (done, total) => setVideoProgress(70 + Math.round((done / Math.max(1, total)) * 15)),
        })
      }
      const importedFrames = await runInBatches(
        extractedFrames.map((frame) => ({ blob: frame.blob, name: frame.name, source: 'video' as const })),
        (input) => createImportedFrame(input, canvasSize),
        {
          batchSize: 3,
          onProgress: ({ done, total }) => setVideoProgress(85 + Math.round((done / Math.max(1, total)) * 15)),
        },
      )
      appendFrames(importedFrames)
      message.success(`Video extraction imported ${importedFrames.length} frame${importedFrames.length > 1 ? 's' : ''}.`)
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Video extraction failed.')
    } finally {
      setVideoRunning(false)
      if (videoInputRef.current) videoInputRef.current.value = ''
    }
  }

  async function runVideoPreview(file: File | null | undefined) {
    if (!file || !canMutate) return
    setVideoPreviewRunning(true)
    try {
      const blob = await previewVideoFrame(file, currentVideoOptions())
      const frame = await createImportedFrame({
        blob,
        name: `${file.name.replace(/\.[^.]+$/, '') || 'video'}_preview.png`,
        source: 'video',
      }, canvasSize)
      if (videoPreviewFrame) URL.revokeObjectURL(videoPreviewFrame.url)
      setVideoPreviewFrame(frame)
      setSelectedId(null)
      setPlayIndex(0)
      setPlaying(false)
      message.success('Video preview frame updated.')
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Video preview failed.')
    } finally {
      setVideoPreviewRunning(false)
      if (videoPreviewInputRef.current) videoPreviewInputRef.current.value = ''
    }
  }

  function deleteSelected() {
    if (!canMutate) return
    if (!selectedTimelineFrame) return
    URL.revokeObjectURL(selectedTimelineFrame.url)
    setFrames((prev) => prev.filter((frame) => frame.id !== selectedTimelineFrame.id))
    setSelectedFrameIds((prev) => {
      const next = new Set(prev)
      next.delete(selectedTimelineFrame.id)
      return next
    })
    setSelectedId(null)
    setPlayIndex(0)
  }

  function duplicateSelected() {
    if (!canMutate) return
    if (!selectedTimelineFrame) return
    const clone: ImportedFrame = {
      ...selectedTimelineFrame,
      id: makeId('import_frame'),
      name: `${selectedTimelineFrame.name.replace(/\.[^.]+$/, '')}_copy.png`,
      url: URL.createObjectURL(selectedTimelineFrame.blob),
    }
    const index = frames.findIndex((frame) => frame.id === selectedTimelineFrame.id)
    setFrames((prev) => {
      const next = [...prev]
      next.splice(index + 1, 0, clone)
      return next
    })
    setSelectedFrameIds((prev) => {
      const next = new Set(prev)
      next.add(clone.id)
      return next
    })
    setSelectedId(clone.id)
    setPlayIndex(Math.max(0, index + 1))
  }

  function reverseFrames() {
    if (!canMutate) return
    setFrames((prev) => [...prev].reverse())
    setPlayIndex(0)
    setPlaying(false)
  }

  function clearFrames() {
    if (!canMutate) return
    setFrames((prev) => {
      prev.forEach((frame) => URL.revokeObjectURL(frame.url))
      return []
    })
    setSelectedFrameIds(new Set())
    setSelectedId(null)
    setPlayIndex(0)
    setPlaying(false)
  }

  async function commitFrames() {
    if (!outputFrames.length || disabled || busy) return
    setCommitting(true)
    try {
      await onImportFrames(outputFrames.map(toPngFile))
      message.success(`Added ${outputFrames.length} imported frame${outputFrames.length > 1 ? 's' : ''} to the action pack.`)
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to add imported frames.')
    } finally {
      setCommitting(false)
    }
  }

  async function exportFramePack() {
    if (!outputFrames.length || disabled || busy) return
    setExportRunning(true)
    setExportProgress(0)
    try {
      const sheet = await createSpriteSheet(outputFrames, canvasSize, canvasSize, 'sprite_sheet.png', {
        batchSize: 3,
        onProgress: (done, total) => setExportProgress(Math.round((done / Math.max(1, total)) * 55)),
      })
      const manifest = createSpriteFrameManifest({
        fps,
        reverse: reverseOutput,
        frameWidth: canvasSize,
        frameHeight: canvasSize,
        sheet: sheet.json,
      })
      const manifestJson = JSON.stringify(manifest, null, 2)
      const sheetJson = JSON.stringify(sheet.json, null, 2)
      const manifestBlob = new Blob([manifestJson], { type: 'application/json' })
      const sheetJsonBlob = new Blob([sheetJson], { type: 'application/json' })
      setExportProgress(70)
      const zipBlob = await createZip([
        ...outputFrames.map((frame, index) => ({ path: `frames/${frameFileName(index)}`, blob: frame.blob })),
        { path: 'sheets/sprite_sheet.png', blob: sheet.blob },
        { path: 'sheets/sprite_sheet.json', blob: sheetJson },
        { path: 'manifest.json', blob: manifestJson },
      ])
      setExportProgress(88)
      downloadBlob(zipBlob, 'character_frame_import_pack.zip')
      if (embed) {
        postToolHostMessage({
          type: 'droi.tool.exportArtifact.v1',
          protocol: DROI_GAME_TOOL_PROTOCOL,
          toolId,
          artifact: {
            toolId,
            artifactType: 'framePack',
            files: [
              { name: 'character_frame_import_pack.zip', mimeType: 'application/zip', dataUrl: await blobToDataUrl(zipBlob) },
              { name: 'sprite_sheet.png', mimeType: 'image/png', dataUrl: await blobToDataUrl(sheet.blob) },
              { name: 'sprite_sheet.json', mimeType: 'application/json', dataUrl: await blobToDataUrl(sheetJsonBlob) },
              { name: 'manifest.json', mimeType: 'application/json', dataUrl: await blobToDataUrl(manifestBlob) },
            ],
            metadata: droiTargetMetadata(projectContext, 'export-character-frame-pack'),
            manifestPatch: {
              characterFrameImport: {
                projectId,
                pack: 'character_frame_import_pack.zip',
                manifest: 'manifest.json',
                spriteSheet: 'sprite_sheet.png',
                frameCount: outputFrames.length,
              },
            },
          },
        })
      }
      setExportProgress(100)
      message.success('Imported frame pack exported.')
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Frame pack export failed.')
    } finally {
      setExportRunning(false)
      window.setTimeout(() => setExportProgress(0), 700)
    }
  }

  function toggleFrameSelection(frameId: string) {
    if (!canMutate) return
    setSelectedFrameIds((prev) => {
      const next = new Set(prev)
      if (next.has(frameId)) next.delete(frameId)
      else next.add(frameId)
      return next
    })
  }

  function selectAllFrames() {
    setSelectedFrameIds(new Set(frames.map((frame) => frame.id)))
  }

  function selectNoFrames() {
    setSelectedFrameIds(new Set())
  }

  function selectOddFrames() {
    setSelectedFrameIds(new Set(frames.filter((_, index) => (index + 1) % 2 === 1).map((frame) => frame.id)))
  }

  function selectEvenFrames() {
    setSelectedFrameIds(new Set(frames.filter((_, index) => (index + 1) % 2 === 0).map((frame) => frame.id)))
  }

  function invertSelection() {
    setSelectedFrameIds((prev) => new Set(frames.filter((frame) => !prev.has(frame.id)).map((frame) => frame.id)))
  }

  function deleteSelectedFrames() {
    if (!canMutate || selectedFrameIds.size === 0) return
    setFrames((prev) => {
      prev.forEach((frame) => {
        if (selectedFrameIds.has(frame.id)) URL.revokeObjectURL(frame.url)
      })
      return prev.filter((frame) => !selectedFrameIds.has(frame.id))
    })
    setSelectedFrameIds(new Set())
    setSelectedId(null)
    setPlayIndex(0)
    setPlaying(false)
  }

  return (
    <div className="character-frame-import">
      <div className="character-frame-import-head">
        <div>
          <Text className="character-action-section-label">Frame Import</Text>
          <strong>Video / GIF / Image Sequence</strong>
        </div>
        <span>{activeFrames.length} / {frames.length} frames selected</span>
      </div>

      <input
        ref={imageInputRef}
        hidden
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={(event) => event.target.files && void addImageFiles(event.target.files)}
      />
      <input
        ref={videoInputRef}
        hidden
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        onChange={(event) => void runVideoImport(event.target.files?.[0])}
      />
      <input
        ref={videoPreviewInputRef}
        hidden
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        onChange={(event) => void runVideoPreview(event.target.files?.[0])}
      />

      <FrameImportToolbar
        canMutate={canMutate}
        importRunning={importRunning}
        videoPreviewRunning={videoPreviewRunning}
        videoRunning={videoRunning}
        onUploadFrames={() => imageInputRef.current?.click()}
        onPreviewVideo={() => videoPreviewInputRef.current?.click()}
        onExtractVideo={() => videoInputRef.current?.click()}
      />

      {(importRunning || importProgress > 0) && <Progress percent={importProgress} size="small" strokeColor="#74e5ff" />}

      <div className="character-frame-import-settings">
        <label>
          FPS
          <InputNumber disabled={disabled || busy} min={1} max={60} value={fps} onChange={(value) => setFps(Number(value) || 12)} />
        </label>
        <label>
          Canvas
          <InputNumber disabled={disabled || busy} min={64} max={1024} step={64} value={canvasSize} onChange={(value) => setCanvasSize(Number(value) || 512)} />
        </label>
        <label>
          Video FPS
          <InputNumber disabled={disabled || busy} min={1} max={60} value={videoFps} onChange={(value) => setVideoFps(Number(value) || 12)} />
        </label>
        <label>
          Start sec
          <InputNumber disabled={disabled || busy} min={0} value={videoStart} onChange={(value) => setVideoStart(Number(value) || 0)} />
        </label>
        <label>
          End sec
          <InputNumber
            disabled={disabled || busy}
            min={0}
            value={videoEnd ?? undefined}
            onChange={(value) => setVideoEnd(value == null ? null : Number(value))}
          />
        </label>
        <label>
          Max
          <InputNumber disabled={disabled || busy} min={1} max={2000} value={maxFrames} onChange={(value) => setMaxFrames(Number(value) || 120)} />
        </label>
      </div>

      <VideoMattePanel matte={videoMatte} disabled={disabled} busy={busy} />

      {(videoRunning || videoProgress > 0 || videoResult) && (
        <div className="character-frame-import-video">
          {(videoRunning || videoProgress > 0) && <Progress percent={videoProgress} size="small" strokeColor="#74e5ff" />}
          {videoResult && (
            <Button icon={<DownloadOutlined />} href={videoResult.zipUrl} target="_blank" rel="noreferrer">
              Download Sprite Sheet ZIP
            </Button>
          )}
        </div>
      )}

      <div className="character-frame-import-preview-tools">
        <Segmented<PreviewBackground>
          value={previewBg}
          onChange={setPreviewBg}
          options={[
            { label: 'Checker', value: 'checker' },
            { label: 'Dark', value: 'dark' },
            { label: 'Light', value: 'light' },
          ]}
        />
        <label>
          <Switch checked={reverseOutput} disabled={!frames.length} onChange={setReverseOutput} />
          <span>Reverse preview / export</span>
        </label>
        <Button
          size="small"
          icon={<DownloadOutlined />}
          disabled={!selectedFrame}
          onClick={() => selectedFrame && downloadBlob(selectedFrame.blob, selectedFrame.name)}
        >
          Download Frame
        </Button>
      </div>

      <div className={`character-frame-import-preview is-${previewBg}`}>
        {selectedFrame ? <img src={selectedFrame.url} alt={selectedFrame.name} /> : <span>Import frames to preview and add them into the action pack.</span>}
      </div>

      <div className="character-frame-import-controls">
        <Button
          aria-label={playing ? 'Pause imported frame preview' : 'Play imported frame preview'}
          icon={playing ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
          disabled={!frames.length}
          onClick={() => setPlaying((prev) => !prev)}
        />
        <Button aria-label="Reverse imported frames" icon={<RetweetOutlined />} disabled={!frames.length || !canMutate} onClick={reverseFrames} />
        <Button aria-label="Duplicate selected imported frame" icon={<CopyOutlined />} disabled={!selectedTimelineFrame || !canMutate} onClick={duplicateSelected} />
        <Button aria-label="Delete selected imported frame" icon={<DeleteOutlined />} disabled={!selectedTimelineFrame || !canMutate} onClick={deleteSelected} />
        <Button danger disabled={!frames.length || !canMutate} onClick={clearFrames}>
          Clear
        </Button>
      </div>

      <div className="character-frame-import-selectors">
        <Button size="small" disabled={!frames.length || !canMutate} onClick={selectAllFrames}>All</Button>
        <Button size="small" disabled={!frames.length || !canMutate} onClick={selectNoFrames}>None</Button>
        <Button size="small" disabled={!frames.length || !canMutate} onClick={selectOddFrames}>Odd</Button>
        <Button size="small" disabled={!frames.length || !canMutate} onClick={selectEvenFrames}>Even</Button>
        <Button size="small" disabled={!frames.length || !canMutate} onClick={invertSelection}>Invert</Button>
        <Button size="small" danger disabled={!selectedFrameIds.size || !canMutate} onClick={deleteSelectedFrames}>Delete Selected</Button>
      </div>
      <Slider
        min={0}
        max={Math.max(0, playbackFrames.length - 1)}
        value={Math.min(playIndex, Math.max(0, playbackFrames.length - 1))}
        onChange={(value) => {
          setPlayIndex(value)
          setSelectedId(playbackFrames[value]?.id ?? null)
          setPlaying(false)
        }}
        disabled={!playbackFrames.length}
      />

      <div className="character-frame-import-strip">
        {frames.map((frame, index) => (
          <button
            key={frame.id}
            type="button"
            draggable={canMutate}
            className={selectedFrame?.id === frame.id ? 'is-active' : ''}
            onClick={() => {
              setSelectedId(frame.id)
              setPlayIndex(index)
              setPlaying(false)
            }}
            onDoubleClick={() => toggleFrameSelection(frame.id)}
            onDragStart={(event) => event.dataTransfer.setData('text/plain', String(index))}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              if (!canMutate) return
              const fromIndex = Number(event.dataTransfer.getData('text/plain'))
              if (!Number.isFinite(fromIndex) || fromIndex === index) return
              setFrames((prev) => reinsertFrame(prev, fromIndex, index))
              setPlayIndex(index)
              setPlaying(false)
            }}
          >
            <em aria-hidden="true"><DragOutlined /></em>
            <input
              type="checkbox"
              checked={selectedFrameIds.has(frame.id)}
              aria-label={`Select frame ${index + 1}`}
              onClick={(event) => event.stopPropagation()}
              onChange={() => toggleFrameSelection(frame.id)}
            />
            <img src={frame.url} alt={frame.name} />
            <small>{index + 1}</small>
          </button>
        ))}
      </div>

      {(exportRunning || exportProgress > 0) && <Progress percent={exportProgress} size="small" strokeColor="#74e5ff" />}

      <Button
        block
        icon={<DownloadOutlined />}
        disabled={!outputFrames.length || disabled || (busy && !exportRunning)}
        loading={exportRunning}
        onClick={() => void exportFramePack()}
      >
        Export Imported Frame Pack
      </Button>

      <Button
        block
        className="character-action-primary"
        disabled={!outputFrames.length || disabled || (busy && !committing)}
        loading={committing}
        onClick={() => void commitFrames()}
      >
        Add Frames to Action Pack
      </Button>
    </div>
  )
}
