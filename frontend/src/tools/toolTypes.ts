import type { ComponentType } from 'react'
import type { GameProjectContext } from './toolHostBridge'

export type ToolCategory = 'map' | 'sprite' | 'image' | 'animation' | 'game-runtime' | 'ai'

export type ToolInputSchema = {
  id: string
  label: string
  kind: 'image' | 'video' | 'audio' | 'folder' | 'project' | 'json'
  multiple?: boolean
}

export type ToolOutputSchema = {
  id: string
  label: string
  kind: 'png' | 'gif' | 'zip' | 'json' | 'project-artifact'
}

export type ToolComponentProps = {
  toolId?: string
  onBack?: () => void
  embed?: boolean
  projectId?: string | null
  mode?: string | null
  projectContext?: GameProjectContext | null
}

export type GameToolDefinition = {
  id: string
  name: string
  shortName: string
  description: string
  category: ToolCategory
  route: string
  embed: boolean
  restored: boolean
  visibleInHub?: boolean
  inputs: ToolInputSchema[]
  outputs: ToolOutputSchema[]
  lazyComponent: () => Promise<{ default: ComponentType<ToolComponentProps> }>
}
