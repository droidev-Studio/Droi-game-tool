import type { ComponentType } from 'react'
import { useEffect, useState } from 'react'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { App as AntdApp, Button, ConfigProvider, Layout, Spin, Typography } from 'antd'
import enUS from 'antd/locale/en_US'
import jaJP from 'antd/locale/ja_JP'
import zhCN from 'antd/locale/zh_CN'
import type { ThemeConfig } from 'antd'
import { useLanguage } from './i18n/context'
import ToolHub, { getToolCategoryLabel, getToolDisplayCopy } from './tools/ToolHub'
import { getToolFromLocation, publicToolRegistry } from './tools/toolRegistry'
import { announceToolReady, listenForProjectContext, type GameProjectContext } from './tools/toolHostBridge'
import type { GameToolDefinition, ToolComponentProps } from './tools/toolTypes'
import './App.css'

const { Content } = Layout
const { Text } = Typography
const antdLocales = { en: enUS, zh: zhCN, ja: jaJP }

const droiTheme: ThemeConfig = {
  token: {
    colorPrimary: '#5fc7e8',
    colorPrimaryHover: '#82d7ef',
    colorPrimaryActive: '#36a9cf',
    colorBgBase: '#060b18',
    colorBgLayout: '#060b18',
    colorBgContainer: '#10162f',
    colorBgElevated: '#111a36',
    colorText: '#ffffff',
    colorTextSecondary: '#aeb4cf',
    colorBorder: 'rgba(116, 229, 255, 0.22)',
    colorBorderSecondary: 'rgba(116, 229, 255, 0.14)',
    colorFillSecondary: 'rgba(116, 229, 255, 0.08)',
    borderRadius: 8,
  },
  components: {
    Button: {
      primaryShadow: '0 14px 34px rgba(95, 199, 232, 0.2)',
    },
    Card: {
      colorBgContainer: 'rgba(16, 22, 47, 0.86)',
      colorBorderSecondary: 'rgba(116, 229, 255, 0.18)',
    },
  },
}

const runnerCopy = {
  en: {
    back: 'Back to tools',
    loading: 'Loading tool...',
    loadFailed: 'Tool failed to load. Please go back and try again.',
  },
  zh: {
    back: '返回工具集合',
    loading: '正在加载工具...',
    loadFailed: '工具加载失败，请返回后重试。',
  },
  ja: {
    back: 'ツール一覧へ戻る',
    loading: 'ツールを読み込み中...',
    loadFailed: 'ツールの読み込みに失敗しました。戻ってもう一度試してください。',
  },
}

function getRouteState() {
  normalizeEmbeddedCapabilityRoute()
  const params = new URLSearchParams(window.location.search)
  return {
    tool: getToolFromLocation(),
    projectId: params.get('projectId'),
    mode: params.get('mode'),
    embed: params.get('embed') === '1' || window.self !== window.top,
  }
}

function normalizeEmbeddedCapabilityRoute() {
  const match = window.location.pathname.match(/\/tool\/([^/?#]+)/)
  const toolId = decodeURIComponent(match?.[1] ?? '')
  const params = new URLSearchParams(window.location.search)
  const queryTool = params.get('tool')
  let nextPath: string | null = null

  if (
    toolId === 'ai-background-remover'
    || toolId === 'droi-art-matte'
    || queryTool === 'ai-background-remover'
    || queryTool === 'droi-art-matte'
    || queryTool === 'background-remover'
    || queryTool === 'aiBackgroundRemover'
    || queryTool === 'backgroundRemover'
  ) {
    nextPath = '/tool/image-process'
    params.delete('tool')
    params.set('tab', 'ai-matte')
  } else if (
    toolId === 'sprite-frame-lab'
    || queryTool === 'sprite-frame-lab'
    || queryTool === 'frame-lab'
    || queryTool === 'spriteFrameLab'
  ) {
    nextPath = '/tool/character-action'
    params.delete('tool')
    params.set('panel', 'frame-import')
  }

  if (!nextPath) return
  const query = params.toString()
  window.history.replaceState({}, '', `${nextPath}${query ? `?${query}` : ''}`)
}

function pushToolRoute(tool: GameToolDefinition, mode?: string) {
  const params = new URLSearchParams(window.location.search)
  if (mode) params.set('mode', mode)
  else params.delete('mode')
  const query = params.toString()
  window.history.pushState({}, '', `${tool.route}${query ? `?${query}` : ''}`)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function pushHomeRoute() {
  window.history.pushState({}, '', '/')
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function App() {
  const { lang } = useLanguage()
  const [routeState, setRouteState] = useState(getRouteState)
  const [projectContext, setProjectContext] = useState<GameProjectContext | null>(null)
  const [loadedTool, setLoadedTool] = useState<{ toolId: string; Component: ComponentType<ToolComponentProps> } | null>(null)
  const [toolLoadError, setToolLoadError] = useState<string | null>(null)
  const activeToolCopy = routeState.tool ? getToolDisplayCopy(routeState.tool, lang) : null
  const activeCategoryLabel = routeState.tool ? getToolCategoryLabel(routeState.tool.category, lang) : null
  const ActiveTool = routeState.tool && loadedTool?.toolId === routeState.tool.id ? loadedTool.Component : null
  const shellCopy = runnerCopy[lang]

  useEffect(() => {
    const onRouteChange = () => setRouteState(getRouteState())
    window.addEventListener('popstate', onRouteChange)
    return () => window.removeEventListener('popstate', onRouteChange)
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!routeState.tool) {
      return () => {
        cancelled = true
      }
    }

    const toolId = routeState.tool.id
    setToolLoadError(null)
    void routeState.tool
      .lazyComponent()
      .then((mod) => {
        if (!cancelled) setLoadedTool({ toolId, Component: mod.default })
      })
      .catch((error) => {
        if (!cancelled) {
          setToolLoadError(error instanceof Error ? error.message : String(error))
          setLoadedTool(null)
        }
      })

    return () => {
      cancelled = true
    }
  }, [routeState.tool])

  useEffect(() => {
    if (!routeState.tool || !routeState.embed) return
    announceToolReady(routeState.tool.id, routeState.projectId)
  }, [routeState.embed, routeState.projectId, routeState.tool])

  useEffect(() => {
    if (!routeState.embed) return undefined
    return listenForProjectContext(setProjectContext)
  }, [routeState.embed])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!routeState.tool || routeState.embed) return
      if (event.code !== 'Escape' && event.code !== 'KeyB') return
      if (event.ctrlKey || event.metaKey || event.altKey) return

      const activeElement = document.activeElement
      const tag = activeElement?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      if (activeElement instanceof HTMLElement && activeElement.isContentEditable) return

      event.preventDefault()
      pushHomeRoute()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [routeState.embed, routeState.tool])

  return (
    <ConfigProvider locale={antdLocales[lang]} theme={droiTheme}>
      <AntdApp>
        <Layout className={`app-layout app-layout-droi ${routeState.embed ? 'is-embedded-tool' : ''}`}>
          <Content className="app-content app-content-droi">
            {!routeState.tool ? (
              <ToolHub tools={publicToolRegistry} onOpenTool={(tool) => pushToolRoute(tool)} />
            ) : (
              <div className="tool-runner">
                {!routeState.embed && (
                  <header className="tool-runner-header">
                    <Button className="tool-runner-back" icon={<ArrowLeftOutlined />} onClick={pushHomeRoute}>
                      {shellCopy.back}
                    </Button>
                    <div>
                      <Text className="tool-runner-kicker">Droi-game-tool / {activeCategoryLabel}</Text>
                      <h1>{activeToolCopy?.name ?? routeState.tool.name}</h1>
                    </div>
                  </header>
                )}
                {ActiveTool ? (
                  <ActiveTool
                    toolId={routeState.tool.id}
                    onBack={pushHomeRoute}
                    embed={routeState.embed}
                    projectId={projectContext?.projectId ?? routeState.projectId}
                    mode={routeState.mode}
                    projectContext={projectContext}
                  />
                ) : (
                  <div className="tool-runner-loading">
                    {toolLoadError ? null : <Spin />}
                    <Text>{toolLoadError ? shellCopy.loadFailed : shellCopy.loading}</Text>
                  </div>
                )}
              </div>
            )}
          </Content>
        </Layout>
      </AntdApp>
    </ConfigProvider>
  )
}

export default App
