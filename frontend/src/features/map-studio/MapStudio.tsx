import { ArrowLeftOutlined } from '@ant-design/icons'
import { Button, Segmented, Typography } from 'antd'
import { useState } from 'react'
import { useLanguage } from '../../i18n/context'
import MapComposer from './MapComposer'
import ObstaclePainter from './ObstaclePainter'
import type { GameProjectContext } from '../../tools/toolHostBridge'
import './MapStudio.css'

const { Text, Title } = Typography
export type MapStudioMode = 'stitch' | 'obstacles'

const mapStudioCopy = {
  en: {
    back: 'Back Home',
    kicker: 'Droi-game-tool Map Tool',
    title: 'Map Studio',
    obstaclesEntryTitle: 'Obstacle Pixel Painter',
    stitchSubtitle: 'Upload a center map and extend it in four directions with softened seams.',
    obstaclesSubtitle: 'Upload obstacle images, remove backgrounds automatically, place them, and export collision PNG / JSON.',
    stitchTab: 'Map Stitch',
    obstaclesTab: 'Obstacle Editor',
  },
  zh: {
    back: '返回首页',
    kicker: 'Droi-game-tool 地图工具',
    title: '地图工作台',
    obstaclesEntryTitle: '障碍物拼豆编辑',
    stitchSubtitle: '上传中心地图，按四个方向扩展拼接，并作为后续障碍物拼贴的底图。',
    obstaclesSubtitle: '上传障碍物素材，按大像素网格点击放置，并导出碰撞 PNG / JSON。',
    stitchTab: '地图拼接',
    obstaclesTab: '障碍物编辑',
  },
  ja: {
    back: 'ホームへ戻る',
    kicker: 'Droi-game-tool マップツール',
    title: 'マップスタジオ',
    obstaclesEntryTitle: '障害物ピクセルペイント',
    stitchSubtitle: '中心マップをアップロードし、四方向に拡張して障害物編集のベースにします。',
    obstaclesSubtitle: '障害物素材をアップロードし、大きなピクセルグリッドに配置して PNG / JSON を出力します。',
    stitchTab: 'マップ結合',
    obstaclesTab: '障害物編集',
  },
}

export default function MapStudio({
  toolId = 'map-studio',
  initialMode = 'stitch',
  onBack,
  showBack = true,
  projectContext,
}: {
  toolId?: string
  initialMode?: MapStudioMode
  onBack?: () => void
  showBack?: boolean
  projectContext?: GameProjectContext | null
}) {
  const { lang } = useLanguage()
  const copy = mapStudioCopy[lang]
  const [mode, setMode] = useState<MapStudioMode>(initialMode)
  const [stitchedMapFile, setStitchedMapFile] = useState<File | null>(null)
  const pageTitle = initialMode === 'obstacles' ? copy.obstaclesEntryTitle : copy.title
  const pageSubtitle = mode === 'stitch' ? copy.stitchSubtitle : copy.obstaclesSubtitle

  return (
    <div className="map-studio-page">
      <div className="map-studio-bg map-studio-bg-far" />
      <div className="map-studio-bg map-studio-bg-mid" />
      <div className="map-studio-bg map-studio-bg-near" />
      <div className="map-studio-scanline" />

      <header className={`map-studio-header ${showBack ? '' : 'map-studio-header-direct'}`}>
        {showBack && (
          <Button className="map-studio-back" icon={<ArrowLeftOutlined />} onClick={onBack}>
            {copy.back}
          </Button>
        )}
        <div className="map-studio-heading">
          <Text className="map-studio-kicker">{copy.kicker}</Text>
          <Title level={2}>{pageTitle}</Title>
          <Text className="map-studio-subtitle">{pageSubtitle}</Text>
        </div>
        <Segmented<MapStudioMode>
          className="map-studio-mode-switch"
          value={mode}
          onChange={setMode}
          options={[
            { label: copy.stitchTab, value: 'stitch' },
            { label: copy.obstaclesTab, value: 'obstacles' },
          ]}
        />
      </header>

      <div className={`map-studio-mode-panel ${mode === 'stitch' ? 'is-active' : ''}`} aria-hidden={mode !== 'stitch'}>
        <MapComposer
          active={mode === 'stitch'}
          onUseStitchedMap={(file) => {
            setStitchedMapFile(file)
            setMode('obstacles')
          }}
        />
      </div>
      <div className={`map-studio-mode-panel ${mode === 'obstacles' ? 'is-active' : ''}`} aria-hidden={mode !== 'obstacles'}>
        <ObstaclePainter toolId={toolId} initialMapFile={stitchedMapFile} projectContext={projectContext} />
      </div>
    </div>
  )
}
