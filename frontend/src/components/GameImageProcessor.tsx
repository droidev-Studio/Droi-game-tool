import { useEffect, useRef } from 'react'
import { Button, Typography } from 'antd'
import { useLanguage } from '../i18n/context'
import type { GameProjectContext } from '../tools/toolHostBridge'
import AssetBackgroundRemovalPanel from './AssetBackgroundRemovalPanel'
import ImageResizeStroke from './ImageResizeStroke'
import './GameImageProcessor.css'

const { Text } = Typography

const copy = {
  en: {
    kicker: 'Droi-game-tool / Asset',
    title: 'Game Image Processor',
    subtitle: 'A single image workbench for game assets: upload one or many, choose local or AI background removal, edit, preview, and export.',
    local: 'Current Image Editor',
    localDesc: 'Use this area for the selected image: crop, resize, extend canvas, remove simple flat-color backgrounds, add outlines, and preview PNG output.',
    ai: 'Batch Processing Queue',
    aiDesc: 'Use this area when you upload multiple assets, need AI matte, want local key controls, or need ZIP/artifact export.',
    imageTool: 'Image Processor',
    actionTool: 'Action Pack Maker',
  },
  zh: {
    kicker: 'Droi-game-tool / 素材',
    title: '图片素材处理',
    subtitle: '一个统一的游戏图片工作台：上传单张或多张，选择本地或 AI 去背，编辑、预览并导出。',
    local: '当前图片编辑',
    localDesc: '处理当前选中的单张图片：裁剪、缩放、扩展画布、去简单纯色背景、加描边，并预览 PNG 输出。',
    ai: '批量处理队列',
    aiDesc: '上传多张素材、需要 AI Matte、本地 Key 参数、ZIP 导出或发送 Droi 产物时使用这里。',
    imageTool: '图片素材处理',
    actionTool: '角色动作包制作',
  },
  ja: {
    kicker: 'Droi-game-tool / Asset',
    title: '画像素材処理',
    subtitle: 'ゲーム素材向けの統合画像ワークベンチです。1枚または複数をアップロードし、ローカル/AI 背景削除、編集、プレビュー、出力を行います。',
    local: '現在画像エディタ',
    localDesc: '選択中の1枚をクロップ、リサイズ、キャンバス拡張、単色背景削除、アウトライン追加、PNG プレビューします。',
    ai: 'バッチ処理キュー',
    aiDesc: '複数素材、AI Matte、Local Key 調整、ZIP 出力、Droi 送信が必要な場合に使います。',
    imageTool: '画像素材処理',
    actionTool: 'アクションパック制作',
  },
}
const capabilityNotes = {
  en: [
    ['Upload one or many', 'One image stays in the current-image editor; multiple images can enter the batch queue.'],
    ['Choose local or AI removal', 'Use local color/luma key for simple flat backgrounds, or AI matte for complex backgrounds.'],
    ['Edit the current image', 'Crop, resize, extend canvas, add outlines, and preview a single selected image.'],
    ['Batch transparent assets', 'Process larger asset sets in small batches and track queue progress.'],
    ['Export for games', 'Download one transparent PNG, export a ZIP pack, or send the result to the Droi project.'],
  ],
  zh: [
    ['上传单张或多张', '单张进入当前图片编辑；多张可以进入批量处理队列。'],
    ['选择本地或 AI 去背', '简单纯色背景用本地 Key，复杂背景用 AI Matte。'],
    ['编辑当前图片', '对选中的单张图片做裁剪、缩放、扩展画布、描边和预览。'],
    ['批量生成透明素材', '大量素材会分段处理，并显示队列进度。'],
    ['导出游戏资源', '下载单张透明 PNG、导出 ZIP 包，或发送到 Droi 项目。'],
  ],
  ja: [
    ['1枚または複数をアップロード', '1枚は現在画像エディタへ、複数はバッチキューへ入ります。'],
    ['ローカルまたは AI 背景削除', '単純な単色背景は Local Key、複雑な背景は AI Matte を使います。'],
    ['現在画像を編集', '選択した1枚をクロップ、リサイズ、キャンバス拡張、アウトライン、プレビューします。'],
    ['透明素材を一括生成', '大量素材を小さなバッチで処理し、キュー進捗を表示します。'],
    ['ゲーム用に出力', '単体 PNG、ZIP パック、Droi プロジェクト送信に対応します。'],
  ],
} as const
function CapabilityNotes({ items }: { items: readonly (readonly [string, string])[] }) {
  return (
    <div className="game-image-capability-list">
      {items.map(([title, detail]) => (
        <article key={title} className="game-image-capability-item">
          <strong>{title}</strong>
          <span>{detail}</span>
        </article>
      ))}
    </div>
  )
}

function navigateTool(route: string) {
  window.history.pushState({}, '', route)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export default function GameImageProcessor({
  embed = false,
  projectContext = null,
}: {
  onBack?: () => void
  embed?: boolean
  projectContext?: GameProjectContext | null
}) {
  const { lang } = useLanguage()
  const t = copy[lang]
  const notes = capabilityNotes[lang]
  const aiSectionRef = useRef<HTMLElement | null>(null)
  const openAiSection = new URLSearchParams(window.location.search).get('tab') === 'ai-matte'

  useEffect(() => {
    if (!openAiSection) return
    window.requestAnimationFrame(() => {
      aiSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [openAiSection])

  return (
    <div className="game-image-processor">
      <header className="game-image-processor-header">
        <div className="game-image-processor-heading">
          <Text className="game-image-processor-kicker">{t.kicker}</Text>
          <h1>{t.title}</h1>
          <p>{t.subtitle}</p>
        </div>
        <div className="game-tool-switch">
          <Button className="is-active" onClick={() => navigateTool('/tool/image-process')}>
            {t.imageTool}
          </Button>
          <Button onClick={() => navigateTool('/tool/character-action')}>
            {t.actionTool}
          </Button>
        </div>
      </header>

      <main className="game-image-processor-sections">
        <CapabilityNotes items={notes} />

        <section className="game-image-processor-panel">
          <div className="game-image-processor-panel-copy">
            <strong>{t.local}</strong>
            <span>{t.localDesc}</span>
          </div>
          <ImageResizeStroke />
        </section>

        <section ref={aiSectionRef} className="game-image-processor-panel game-image-processor-ai-panel">
          <div className="game-image-processor-panel-copy">
            <strong>{t.ai}</strong>
            <span>{t.aiDesc}</span>
          </div>
          <AssetBackgroundRemovalPanel toolId="image-process" embed={embed} projectContext={projectContext} />
        </section>
      </main>
    </div>
  )
}
