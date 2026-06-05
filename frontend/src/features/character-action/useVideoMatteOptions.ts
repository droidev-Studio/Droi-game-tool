import { useState } from 'react'
import type { VideoFrameJobOptions } from '../../lib/media-tools/videoFrameJob'

export type VideoMatteMode = 'ai' | 'none' | 'chroma' | 'luma' | 'ai_luma'

export function useVideoMatteOptions() {
  const [videoMatteMode, setVideoMatteMode] = useState<VideoMatteMode>('ai')
  const [videoKeyColor, setVideoKeyColor] = useState('#00ff00')
  const [videoThreshold, setVideoThreshold] = useState(72)
  const [videoSoftness, setVideoSoftness] = useState(24)
  const [videoDespill, setVideoDespill] = useState(0.85)
  const [videoHalo, setVideoHalo] = useState(1)
  const [videoLumaBlack, setVideoLumaBlack] = useState(24)
  const [videoLumaWhite, setVideoLumaWhite] = useState(210)
  const [videoLumaGamma, setVideoLumaGamma] = useState(0.75)
  const [videoLumaStrength, setVideoLumaStrength] = useState(1.25)
  const [videoGreenToBlack, setVideoGreenToBlack] = useState(false)
  const [videoSemiToBlack, setVideoSemiToBlack] = useState(false)
  const [videoSemiToOpaque, setVideoSemiToOpaque] = useState(false)

  const showVideoLumaControls = videoMatteMode === 'luma' || videoMatteMode === 'ai_luma'
  const showVideoPostProcessControls = videoMatteMode === 'chroma' || showVideoLumaControls

  function applyVideoChromaPreset(keyColor: string) {
    setVideoMatteMode('chroma')
    setVideoKeyColor(keyColor)
    setVideoThreshold(keyColor === '#ffffff' || keyColor === '#000000' ? 46 : 76)
    setVideoSoftness(keyColor === '#ffffff' || keyColor === '#000000' ? 18 : 28)
    setVideoDespill(keyColor === '#00ff00' || keyColor === '#0066ff' ? 1.15 : 0)
    setVideoHalo(keyColor === '#00ff00' || keyColor === '#0066ff' ? 1 : 0)
  }

  function applyVideoLumaPreset(kind: 'soft' | 'balanced' | 'glow') {
    setVideoMatteMode('luma')
    const preset = {
      soft: { black: 16, white: 130, gamma: 0.75, strength: 1.15 },
      balanced: { black: 28, white: 92, gamma: 0.58, strength: 1.55 },
      glow: { black: 40, white: 66, gamma: 0.46, strength: 1.9 },
    }[kind]
    setVideoLumaBlack(preset.black)
    setVideoLumaWhite(preset.white)
    setVideoLumaGamma(preset.gamma)
    setVideoLumaStrength(preset.strength)
    setVideoHalo(0)
  }

  function applyVideoAiLumaPreset(kind: 'protect' | 'balanced' | 'glow') {
    setVideoMatteMode('ai_luma')
    const preset = {
      protect: { black: 18, white: 150, gamma: 0.85, strength: 0.85 },
      balanced: { black: 28, white: 92, gamma: 0.58, strength: 1.35 },
      glow: { black: 40, white: 66, gamma: 0.46, strength: 1.75 },
    }[kind]
    setVideoLumaBlack(preset.black)
    setVideoLumaWhite(preset.white)
    setVideoLumaGamma(preset.gamma)
    setVideoLumaStrength(preset.strength)
    setVideoHalo(0)
  }

  function currentVideoMatteOptions(): Partial<VideoFrameJobOptions> {
    return {
      matteMode: videoMatteMode,
      matteKeyColor: videoKeyColor,
      matteThreshold: videoThreshold,
      matteSoftness: videoSoftness,
      matteDespill: videoDespill,
      matteHalo: videoHalo,
      lumaBlack: videoLumaBlack,
      lumaWhite: videoLumaWhite,
      lumaGamma: videoLumaGamma,
      lumaStrength: videoLumaStrength,
      greenToBlack: videoGreenToBlack,
      semitransparentToBlack: videoSemiToBlack,
      semitransparentToOpaque: videoSemiToOpaque,
    }
  }

  return {
    videoMatteMode,
    setVideoMatteMode,
    videoKeyColor,
    setVideoKeyColor,
    videoThreshold,
    setVideoThreshold,
    videoSoftness,
    setVideoSoftness,
    videoDespill,
    setVideoDespill,
    videoHalo,
    setVideoHalo,
    videoLumaBlack,
    setVideoLumaBlack,
    videoLumaWhite,
    setVideoLumaWhite,
    videoLumaGamma,
    setVideoLumaGamma,
    videoLumaStrength,
    setVideoLumaStrength,
    videoGreenToBlack,
    setVideoGreenToBlack,
    videoSemiToBlack,
    setVideoSemiToBlack,
    videoSemiToOpaque,
    setVideoSemiToOpaque,
    showVideoLumaControls,
    showVideoPostProcessControls,
    applyVideoChromaPreset,
    applyVideoLumaPreset,
    applyVideoAiLumaPreset,
    currentVideoMatteOptions,
  }
}
