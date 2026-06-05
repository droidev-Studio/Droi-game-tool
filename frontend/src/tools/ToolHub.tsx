import {
  AppstoreOutlined,
  BgColorsOutlined,
  CodeOutlined,
  EnvironmentOutlined,
  PlayCircleOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { Segmented, Tooltip } from 'antd'
import { gsap } from 'gsap'
import { useGSAP } from '@gsap/react'
import type { FocusEvent, PointerEvent, ReactNode } from 'react'
import { useMemo, useRef } from 'react'
import { useLanguage } from '../i18n/context'
import type { Lang } from '../i18n/locales'
import type { GameToolDefinition, ToolCategory } from './toolTypes'
import './ToolHub.css'

gsap.registerPlugin(useGSAP)

type LocalizedText<T extends string = string> = Record<Lang, Record<T, string>>

const publicToolOrder = [
  'map-studio',
  'obstacle-painter',
  'image-process',
  'character-action',
]

const categoryCopy: Record<ToolCategory, { icon: ReactNode; label: Record<Lang, string> }> = {
  map: { icon: <EnvironmentOutlined />, label: { en: 'Map', zh: '地图', ja: 'マップ' } },
  sprite: { icon: <BgColorsOutlined />, label: { en: 'Asset', zh: '素材', ja: '素材' } },
  image: { icon: <BgColorsOutlined />, label: { en: 'Image', zh: '图片', ja: '画像' } },
  animation: { icon: <PlayCircleOutlined />, label: { en: 'Animation', zh: '动画', ja: 'アニメ' } },
  'game-runtime': { icon: <CodeOutlined />, label: { en: 'Runtime', zh: '运行时', ja: 'ランタイム' } },
  ai: { icon: <ThunderboltOutlined />, label: { en: 'AI', zh: 'AI', ja: 'AI' } },
}

const homeText: LocalizedText<'eyebrow' | 'title' | 'subtitle' | 'entryTitle' | 'restored' | 'embeddable' | 'language'> = {
  en: {
    eyebrow: 'Droi-game-tool',
    title: 'Game Production Tool Hub',
    subtitle: 'Map production, obstacle painting, AI art cleanup, character action packs, and asset processing for generated games.',
    entryTitle: 'Production Tools',
    restored: 'Ready',
    embeddable: 'Droi embed',
    language: 'Language',
  },
  zh: {
    eyebrow: 'Droi-game-tool',
    title: '游戏制作工具集合',
    subtitle: '面向生成游戏的地图制作、障碍物拼贴、AI 美术处理、角色动作包和素材处理工作台。',
    entryTitle: '制作工具入口',
    restored: '可用',
    embeddable: '可嵌入 Droi',
    language: '语言',
  },
  ja: {
    eyebrow: 'Droi-game-tool',
    title: 'ゲーム制作ツール集',
    subtitle: '生成ゲーム向けのマップ制作、障害物配置、AI画像処理、キャラクターアクション、素材処理のワークベンチ。',
    entryTitle: '制作ツール',
    restored: '利用可能',
    embeddable: 'Droi 埋め込み',
    language: '言語',
  },
}

const toolDisplayCopy: Record<string, Record<Lang, { name: string; shortName: string; description: string }>> = {
  'map-studio': {
    en: {
      name: 'Map Studio',
      shortName: 'Map Studio',
      description: 'Stitch a base map, extend it, then continue into grid-based obstacle painting.',
    },
    zh: {
      name: '地图工作台',
      shortName: '地图工作台',
      description: '上传基础地图，完成切块拼接与扩图，再进入网格化障碍物拼贴。',
    },
    ja: {
      name: 'マップスタジオ',
      shortName: 'マップ',
      description: 'ベースマップの結合と拡張を行い、そのままグリッド障害物編集へ進みます。',
    },
  },
  'obstacle-painter': {
    en: {
      name: 'Obstacle Pixel Painter',
      shortName: 'Obstacles',
      description: 'Upload obstacle assets and place them on square map cells like pixel beads.',
    },
    zh: {
      name: '障碍物拼豆编辑',
      shortName: '障碍物',
      description: '上传障碍物素材，按正方形大像素网格点击放置，导出 PNG 与布局 JSON。',
    },
    ja: {
      name: '障害物ピクセルペイント',
      shortName: '障害物',
      description: '障害物素材をアップロードし、正方形グリッドへピクセルビーズのように配置します。',
    },
  },
  'image-process': {
    en: {
      name: 'Game Image Processor',
      shortName: 'Image Process',
      description: 'Crop, resize, remove backgrounds with local or AI matte, add outlines, and export PNG assets.',
    },
    zh: {
      name: '图片素材处理',
      shortName: '素材处理',
      description: '裁剪、缩放、本地或 AI 去背、加描边，并导出游戏可用 PNG。',
    },
    ja: {
      name: '画像素材処理',
      shortName: '画像処理',
      description: '切り抜き、リサイズ、ローカルまたは AI 背景除去、アウトライン追加を行い、PNG素材として出力します。',
    },
  },
  'character-action': {
    en: {
      name: 'Character Action Pack Maker',
      shortName: 'Action Pack',
      description: 'Import video, GIF, or image sequence frames, then build character action packs with weapons, effects, and runtime metadata.',
    },
    zh: {
      name: '角色动作包制作',
      shortName: '动作包',
      description: '整理角色动作帧、武器、特效与运行时元数据，输出可接入游戏的动作资源包。',
    },
    ja: {
      name: 'キャラクターアクションパック',
      shortName: 'アクション',
      description: 'キャラクターのアクションフレーム、武器、エフェクト、実行時メタデータを整えます。',
    },
  },
}

type Props = {
  tools: GameToolDefinition[]
  onOpenTool: (tool: GameToolDefinition, mode?: string) => void
}

export function getToolDisplayCopy(tool: GameToolDefinition, lang: Lang) {
  return toolDisplayCopy[tool.id]?.[lang] ?? {
    name: tool.name,
    shortName: tool.shortName,
    description: tool.description,
  }
}

export function getToolCategoryLabel(category: ToolCategory, lang: Lang) {
  return categoryCopy[category].label[lang]
}

export default function ToolHub({ tools, onOpenTool }: Props) {
  const { lang, setLang } = useLanguage()
  const hubRef = useRef<HTMLElement | null>(null)
  const copy = homeText[lang]
  const publicTools = useMemo(
    () =>
      tools
        .filter((tool) => tool.visibleInHub !== false)
        .sort((a, b) => {
          const aIndex = publicToolOrder.indexOf(a.id)
          const bIndex = publicToolOrder.indexOf(b.id)
          if (aIndex === -1 && bIndex === -1) return 0
          if (aIndex === -1) return 1
          if (bIndex === -1) return -1
          return aIndex - bIndex
        }),
    [tools],
  )
  const { contextSafe } = useGSAP(
    () => {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const targets = [
        '.tool-hub-language',
        '.tool-hub-heading span',
        '.tool-hub-heading h1',
        '.tool-hub-heading p',
        '.tool-hub-entry-head',
        '.tool-hub-card',
      ]

      if (reduceMotion) {
        gsap.set(targets, { autoAlpha: 1, clearProps: 'transform' })
        return
      }

      gsap.set('.tool-hub-card', { transformOrigin: '50% 72%' })
      gsap
        .timeline({ defaults: { ease: 'power3.out' } })
        .from('.tool-hub-language', { autoAlpha: 0, y: -12, duration: 0.42 })
        .from('.tool-hub-heading span', { autoAlpha: 0, y: 10, duration: 0.34 }, 0.04)
        .from('.tool-hub-heading h1', { autoAlpha: 0, y: 24, duration: 0.62 }, 0.1)
        .from('.tool-hub-heading p', { autoAlpha: 0, y: 18, duration: 0.5 }, 0.2)
        .from('.tool-hub-entry-head', { autoAlpha: 0, y: 14, duration: 0.34 }, 0.32)
        .from(
          '.tool-hub-card',
          {
            autoAlpha: 0,
            y: 30,
            scale: 0.965,
            duration: 0.58,
            stagger: { each: 0.07, from: 'start' },
          },
          0.4,
        )
    },
    { scope: hubRef, dependencies: [lang, publicTools.length], revertOnUpdate: true },
  )

  const handleCardEnter = contextSafe((event: PointerEvent<HTMLButtonElement> | FocusEvent<HTMLButtonElement>) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    gsap.to(event.currentTarget, {
      y: -5,
      scale: 1.012,
      duration: 0.22,
      ease: 'power2.out',
      overwrite: 'auto',
    })
  })

  const handleCardLeave = contextSafe((event: PointerEvent<HTMLButtonElement> | FocusEvent<HTMLButtonElement>) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    gsap.to(event.currentTarget, {
      y: 0,
      scale: 1,
      duration: 0.26,
      ease: 'power2.out',
      overwrite: 'auto',
    })
  })

  return (
    <section className="tool-hub" ref={hubRef}>
      <div className="tool-hub-scanline" />

      <div className="tool-hub-inner">
        <div className="tool-hub-language">
          <Tooltip title={copy.language}>
            <AppstoreOutlined />
          </Tooltip>
          <Segmented<Lang>
            size="small"
            value={lang}
            onChange={setLang}
            options={[
              { label: 'EN', value: 'en' },
              { label: '中文', value: 'zh' },
              { label: '日本語', value: 'ja' },
            ]}
          />
        </div>

        <div className="tool-hub-heading">
          <span>{copy.eyebrow}</span>
          <h1>{copy.title}</h1>
          <p>{copy.subtitle}</p>
        </div>

        <section className="tool-hub-entry-section">
          <div className="tool-hub-entry-head">
            <strong>{copy.entryTitle}</strong>
            <small>{publicTools.length}</small>
          </div>
          <div className="tool-hub-entry-row">
            {publicTools.map((tool) => {
              const toolCopy = getToolDisplayCopy(tool, lang)
              const category = categoryCopy[tool.category]
              return (
                <button
                  key={tool.id}
                  type="button"
                  className="tool-hub-card"
                  onClick={() => onOpenTool(tool)}
                  onPointerEnter={handleCardEnter}
                  onPointerLeave={handleCardLeave}
                  onFocus={handleCardEnter}
                  onBlur={handleCardLeave}
                >
                  <span className="tool-hub-card-kicker">
                    <span>{category.icon}</span>
                    {category.label[lang]}
                  </span>
                  <span className="tool-hub-card-label">{toolCopy.shortName}</span>
                  <strong>{toolCopy.name}</strong>
                  <small>{toolCopy.description}</small>
                  <span className="tool-hub-card-meta">
                    {tool.restored && <em>{copy.restored}</em>}
                    {tool.embed && <em>{copy.embeddable}</em>}
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      </div>
    </section>
  )
}
