import { Button, InputNumber, Segmented, Switch, Typography } from 'antd'
import type { VideoMatteMode, useVideoMatteOptions } from './useVideoMatteOptions'

const { Text } = Typography

type VideoMatteOptions = ReturnType<typeof useVideoMatteOptions>

type Props = {
  matte: VideoMatteOptions
  disabled: boolean
  busy: boolean
}

export default function VideoMattePanel({ matte, disabled, busy }: Props) {
  return (
    <div className="character-frame-import-matte">
      <Text className="character-action-section-label">Video Matte</Text>
      <Segmented<VideoMatteMode>
        value={matte.videoMatteMode}
        onChange={matte.setVideoMatteMode}
        options={[
          { label: 'AI', value: 'ai' },
          { label: 'AI + Luma', value: 'ai_luma' },
          { label: 'None', value: 'none' },
          { label: 'Chroma', value: 'chroma' },
          { label: 'Luma', value: 'luma' },
        ]}
      />
      {matte.videoMatteMode === 'chroma' && (
        <>
          <div className="character-frame-import-preset-row">
            <Button size="small" onClick={() => matte.applyVideoChromaPreset('#00ff00')}>Green</Button>
            <Button size="small" onClick={() => matte.applyVideoChromaPreset('#0066ff')}>Blue</Button>
            <Button size="small" onClick={() => matte.applyVideoChromaPreset('#ffffff')}>White</Button>
            <Button size="small" onClick={() => matte.applyVideoChromaPreset('#000000')}>Black</Button>
          </div>
          <div className="character-frame-import-settings">
            <label>
              Key
              <input type="color" value={matte.videoKeyColor} onChange={(event) => matte.setVideoKeyColor(event.target.value)} disabled={disabled || busy} />
            </label>
            <label>
              Threshold
              <InputNumber disabled={disabled || busy} min={0} max={255} value={matte.videoThreshold} onChange={(value) => matte.setVideoThreshold(Number(value) || 0)} />
            </label>
            <label>
              Soft Edge
              <InputNumber disabled={disabled || busy} min={0} max={128} value={matte.videoSoftness} onChange={(value) => matte.setVideoSoftness(Number(value) || 0)} />
            </label>
            <label>
              Despill
              <InputNumber disabled={disabled || busy} min={0} max={2.5} step={0.05} value={matte.videoDespill} onChange={(value) => matte.setVideoDespill(Number(value) || 0)} />
            </label>
          </div>
        </>
      )}
      {matte.showVideoLumaControls && (
        <>
          <div className="character-frame-import-preset-row">
            {matte.videoMatteMode === 'ai_luma' ? (
              <>
                <Button size="small" onClick={() => matte.applyVideoAiLumaPreset('protect')}>Protect Subject</Button>
                <Button size="small" onClick={() => matte.applyVideoAiLumaPreset('balanced')}>Balanced VFX</Button>
                <Button size="small" onClick={() => matte.applyVideoAiLumaPreset('glow')}>Strong Glow</Button>
              </>
            ) : (
              <>
                <Button size="small" onClick={() => matte.applyVideoLumaPreset('soft')}>Soft VFX</Button>
                <Button size="small" onClick={() => matte.applyVideoLumaPreset('balanced')}>Balanced</Button>
                <Button size="small" onClick={() => matte.applyVideoLumaPreset('glow')}>Strong Glow</Button>
              </>
            )}
          </div>
          <div className="character-frame-import-settings">
            <label>
              Luma Black
              <InputNumber disabled={disabled || busy} min={0} max={254} value={matte.videoLumaBlack} onChange={(value) => matte.setVideoLumaBlack(Number(value) || 0)} />
            </label>
            <label>
              Luma White
              <InputNumber disabled={disabled || busy} min={1} max={255} value={matte.videoLumaWhite} onChange={(value) => matte.setVideoLumaWhite(Number(value) || 1)} />
            </label>
            <label>
              Gamma
              <InputNumber disabled={disabled || busy} min={0.05} max={4} step={0.05} value={matte.videoLumaGamma} onChange={(value) => matte.setVideoLumaGamma(Number(value) || 1)} />
            </label>
            <label>
              Strength
              <InputNumber disabled={disabled || busy} min={0} max={2} step={0.05} value={matte.videoLumaStrength} onChange={(value) => matte.setVideoLumaStrength(Number(value) || 1)} />
            </label>
          </div>
        </>
      )}
      {matte.showVideoPostProcessControls && (
        <div className="character-frame-import-settings">
          <label>
            Halo
            <InputNumber disabled={disabled || busy} min={0} max={8} value={matte.videoHalo} onChange={(value) => matte.setVideoHalo(Number(value) || 0)} />
          </label>
          <label className="character-frame-import-switch">
            <Switch disabled={disabled || busy} checked={matte.videoGreenToBlack} onChange={matte.setVideoGreenToBlack} />
            Green edge to black
          </label>
          <label className="character-frame-import-switch">
            <Switch disabled={disabled || busy} checked={matte.videoSemiToBlack} onChange={matte.setVideoSemiToBlack} />
            Transparent RGB to black
          </label>
          <label className="character-frame-import-switch">
            <Switch disabled={disabled || busy} checked={matte.videoSemiToOpaque} onChange={matte.setVideoSemiToOpaque} />
            Semi alpha to opaque
          </label>
        </div>
      )}
    </div>
  )
}
