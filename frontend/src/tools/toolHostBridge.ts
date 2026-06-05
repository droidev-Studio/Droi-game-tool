export type GameProjectContext = {
  projectId: string
  templateId?: string
  previewUrl?: string
  assetManifest?: unknown
  gameSpec?: unknown
  selectedTarget?: {
    itemId: string
    type?: 'map' | 'image' | 'character' | 'obstacle' | 'audio' | 'code'
    title?: string
    assetPath?: string
    currentUrl?: string
    expectedArtifactType?: string
    preferredTools?: string[]
  }
  toolHints?: {
    preferredToolId?: string
    mode?: string
    returnTo?: string
  }
  toolIntegration?: unknown
  toolArtifacts?: unknown[]
}

export const DROI_GAME_TOOL_PROTOCOL = 'droi-game-tool/v1'

export type ToolFilePayload = {
  name: string
  mimeType: string
  dataUrl?: string
  url?: string
}

export type GameToolArtifact = {
  toolId: string
  artifactType: 'map' | 'obstacleLayout' | 'spriteSheet' | 'framePack' | 'actionPack' | 'matteAsset' | 'assetPatch'
  files: ToolFilePayload[]
  manifestPatch?: unknown
  specPatch?: unknown
  targetItemId?: string
  metadata?: Record<string, unknown>
}

export type ToolHostMessage =
  | { type: 'droi.tool.ready.v1'; protocol: typeof DROI_GAME_TOOL_PROTOCOL; toolId: string }
  | { type: 'droi.tool.requestContext.v1'; protocol: typeof DROI_GAME_TOOL_PROTOCOL; toolId: string; projectId?: string | null }
  | { type: 'droi.tool.exportArtifact.v1'; protocol: typeof DROI_GAME_TOOL_PROTOCOL; toolId: string; artifact: GameToolArtifact }
  | { type: 'droi.tool.error.v1'; protocol: typeof DROI_GAME_TOOL_PROTOCOL; toolId: string; message: string }

export type HostProjectContextMessage = {
  type: 'droi.host.context.v1' | 'droi.host.projectContext'
  protocol?: typeof DROI_GAME_TOOL_PROTOCOL
  project: GameProjectContext
}

function getHostTargetOrigin(): string {
  if (!document.referrer) return '*'
  try {
    return new URL(document.referrer).origin
  } catch {
    return '*'
  }
}

export function postToolHostMessage(message: ToolHostMessage) {
  if (window.parent === window) return
  window.parent.postMessage(message, getHostTargetOrigin())
}

export function announceToolReady(toolId: string, projectId?: string | null) {
  postToolHostMessage({ type: 'droi.tool.ready.v1', protocol: DROI_GAME_TOOL_PROTOCOL, toolId })
  postToolHostMessage({ type: 'droi.tool.requestContext.v1', protocol: DROI_GAME_TOOL_PROTOCOL, toolId, projectId })
}

export function listenForProjectContext(onContext: (context: GameProjectContext) => void): () => void {
  const onMessage = (event: MessageEvent<HostProjectContextMessage>) => {
    const data = event.data
    const isCurrentProtocol = data?.type === 'droi.host.context.v1' && data.protocol === DROI_GAME_TOOL_PROTOCOL
    const isLegacyProtocol = data?.type === 'droi.host.projectContext'
    if ((!isCurrentProtocol && !isLegacyProtocol) || !data.project) return
    onContext(event.data.project)
  }
  window.addEventListener('message', onMessage)
  return () => window.removeEventListener('message', onMessage)
}
