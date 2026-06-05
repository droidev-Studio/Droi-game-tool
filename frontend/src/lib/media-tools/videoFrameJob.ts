import { createJob, getIndexUrl, getJob, getResultUrl, previewJobFrame, type JobParams } from '../../api'

export type VideoFrameJobOptions = {
  fps: number
  startSec?: number
  endSec?: number
  maxFrames: number
  canvasSize: number
  matteMode?: 'ai' | 'none' | 'chroma' | 'luma' | 'ai_luma'
  matteKeyColor?: string
  matteThreshold?: number
  matteSoftness?: number
  matteDespill?: number
  matteHalo?: number
  lumaBlack?: number
  lumaWhite?: number
  lumaGamma?: number
  lumaStrength?: number
  greenToBlack?: boolean
  semitransparentToBlack?: boolean
  semitransparentToOpaque?: boolean
}

export type VideoFrameJobResult = {
  jobId: string
  spriteUrl: string
  indexUrl: string
  zipUrl: string
}

function createVideoFrameJobParams(options: VideoFrameJobOptions): JobParams {
  return {
    fps: options.fps,
    frame_range: { start_sec: options.startSec, end_sec: options.endSec },
    max_frames: options.maxFrames,
    target_size: { w: options.canvasSize, h: options.canvasSize },
    transparent: true,
    bg_color: 'transparent',
    crop_mode: 'safe_bbox',
    matte_mode: options.matteMode ?? 'ai',
    matte_key_color: options.matteKeyColor,
    matte_threshold: options.matteThreshold,
    matte_softness: options.matteSoftness,
    matte_despill: options.matteDespill,
    matte_halo: options.matteHalo,
    luma_black: options.lumaBlack,
    luma_white: options.lumaWhite,
    luma_gamma: options.lumaGamma,
    luma_strength: options.lumaStrength,
    green_to_black: options.greenToBlack,
    semitransparent_to_black: options.semitransparentToBlack,
    semitransparent_to_opaque: options.semitransparentToOpaque,
  }
}

export async function previewVideoFrame(file: File, options: VideoFrameJobOptions): Promise<Blob> {
  return previewJobFrame(file, createVideoFrameJobParams(options))
}

export async function runVideoFrameJob(
  file: File,
  options: VideoFrameJobOptions,
  onProgress?: (progress: number) => void,
): Promise<VideoFrameJobResult> {
  const params = createVideoFrameJobParams(options)
  const { job_id: jobId } = await createJob(file, params)

  for (;;) {
    const job = await getJob(jobId)
    onProgress?.(job.progress ?? 0)
    if (job.status === 'completed') {
      onProgress?.(100)
      return {
        jobId,
        spriteUrl: getResultUrl(jobId, 'png'),
        indexUrl: getIndexUrl(jobId),
        zipUrl: getResultUrl(jobId, 'zip'),
      }
    }
    if (job.status === 'failed' || job.status === 'canceled') {
      throw new Error(job.error?.message || 'Video frame extraction failed')
    }
    await new Promise((resolve) => window.setTimeout(resolve, 900))
  }
}
