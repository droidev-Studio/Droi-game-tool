import type { ComponentType } from 'react'
import type { GameToolDefinition, ToolComponentProps } from './toolTypes'

type ModuleWithDefault<P> = { default: ComponentType<P> }

function asTool<P extends object>(
  importer: () => Promise<ModuleWithDefault<P>>,
  mapProps: (props: ToolComponentProps) => P,
): GameToolDefinition['lazyComponent'] {
  return async () => {
    const mod = await importer()
    const Component = mod.default
    return {
      default: (props: ToolComponentProps) => <Component {...mapProps(props)} />,
    }
  }
}

function noProps<P extends object>(importer: () => Promise<ModuleWithDefault<P>>): GameToolDefinition['lazyComponent'] {
  return asTool(importer, () => ({} as P))
}

const commonImageInput = { id: 'image', label: 'Image upload', kind: 'image' as const, multiple: true }
const pngOutput = { id: 'png', label: 'PNG export', kind: 'png' as const }
const zipOutput = { id: 'zip', label: 'ZIP export', kind: 'zip' as const }
const jsonOutput = { id: 'json', label: 'JSON export', kind: 'json' as const }
const projectArtifactOutput = { id: 'artifact', label: 'Droi project artifact', kind: 'project-artifact' as const }

const allToolDefinitions: GameToolDefinition[] = [
  {
    id: 'map-studio',
    name: 'Map Studio',
    shortName: 'Map Studio',
    description: 'Base map stitching plus obstacle pixel-paint editing for generated games.',
    category: 'map',
    route: '/tool/map-studio',
    embed: true,
    restored: true,
    inputs: [{ id: 'map', label: 'Map image', kind: 'image' }, { id: 'obstacles', label: 'Obstacle assets', kind: 'image', multiple: true }],
    outputs: [pngOutput, jsonOutput, projectArtifactOutput],
    lazyComponent: asTool(
      () => import('../features/map-studio/MapStudio'),
      (props) => ({
        toolId: props.toolId ?? 'map-studio',
        initialMode: props.mode === 'obstacles' || props.mode === 'obstacle' ? ('obstacles' as const) : ('stitch' as const),
        onBack: props.onBack,
        showBack: !props.embed,
        projectContext: props.projectContext,
      }),
    ),
  },
  {
    id: 'obstacle-painter',
    name: 'Obstacle Pixel Painter',
    shortName: 'Obstacles',
    description: 'Upload obstacle assets and paint them onto a generated map grid like pixel beads.',
    category: 'map',
    route: '/tool/obstacle-painter',
    embed: true,
    restored: true,
    inputs: [{ id: 'map', label: 'Map image', kind: 'image' }, { id: 'obstacles', label: 'Obstacle assets', kind: 'image', multiple: true }],
    outputs: [pngOutput, jsonOutput, projectArtifactOutput],
    lazyComponent: asTool(
      () => import('../features/map-studio/MapStudio'),
      (props) => ({
        toolId: props.toolId ?? 'obstacle-painter',
        initialMode: 'obstacles' as const,
        onBack: props.onBack,
        showBack: !props.embed,
        projectContext: props.projectContext,
      }),
    ),
  },
  {
    id: 'character-action',
    name: 'Character Action Pack Maker',
    shortName: 'Action Pack',
    description: 'Generate and align character action frames, weapons, effects, and runtime metadata.',
    category: 'animation',
    route: '/tool/character-action',
    embed: true,
    restored: true,
    inputs: [{ id: 'character', label: 'Character image', kind: 'image' }],
    outputs: [
      pngOutput,
      zipOutput,
      jsonOutput,
      { id: 'framePack', label: 'Imported frame pack', kind: 'zip' },
      { id: 'spriteSheet', label: 'Sprite sheet', kind: 'png' },
      projectArtifactOutput,
    ],
    lazyComponent: asTool(() => import('../features/character-action/CharacterActionComposer'), (props) => ({
      toolId: props.toolId ?? 'character-action',
      embed: props.embed,
      projectId: props.projectId,
      projectContext: props.projectContext,
      onBack: props.onBack ?? (() => undefined),
    })),
  },
  {
    id: 'gif-frames',
    name: 'GIF / Frame Converter',
    shortName: 'GIF Frames',
    description: 'Extract GIF frames, compose GIFs, combine images, split grids, and run simple stitches.',
    category: 'sprite',
    route: '/tool/gif-frames',
    embed: false,
    restored: true,
    visibleInHub: false,
    inputs: [{ id: 'gif', label: 'GIF or frame images', kind: 'image', multiple: true }],
    outputs: [pngOutput, zipOutput, { id: 'gif', label: 'GIF export', kind: 'gif' }],
    lazyComponent: noProps(() => import('../components/GifFrameConverter')),
  },
  {
    id: 'sprite-sheet',
    name: 'Sprite Sheet Split / GIF',
    shortName: 'Sprite Sheet',
    description: 'Split sprite sheets by rows and columns, then export frames or GIF rows.',
    category: 'sprite',
    route: '/tool/sprite-sheet',
    embed: false,
    restored: true,
    visibleInHub: false,
    inputs: [commonImageInput],
    outputs: [pngOutput, zipOutput, { id: 'gif', label: 'GIF export', kind: 'gif' }],
    lazyComponent: noProps(() => import('../components/SpriteSheetTool')),
  },
  {
    id: 'sprite-adjust',
    name: 'Sprite Sheet Adjust',
    shortName: 'Sheet Adjust',
    description: 'Split, inspect, align, fix pixels, and recombine sprite sheets.',
    category: 'sprite',
    route: '/tool/sprite-adjust',
    embed: false,
    restored: true,
    visibleInHub: false,
    inputs: [commonImageInput],
    outputs: [pngOutput, zipOutput, { id: 'gif', label: 'GIF export', kind: 'gif' }],
    lazyComponent: noProps(() => import('../components/SpriteSheetAdjust')),
  },
  {
    id: 'image-process',
    name: 'Game Image Processor',
    shortName: 'Image Process',
    description: 'Crop, resize, remove backgrounds with local or AI matte, add outlines, and export PNG assets.',
    category: 'image',
    route: '/tool/image-process',
    embed: true,
    restored: true,
    inputs: [commonImageInput],
    outputs: [pngOutput, zipOutput, projectArtifactOutput],
    lazyComponent: asTool(() => import('../components/GameImageProcessor'), (props) => ({ onBack: props.onBack, embed: props.embed, projectContext: props.projectContext })),
  },
  {
    id: 'image-matte',
    name: 'Local Chroma Matte',
    shortName: 'Local Matte',
    description: 'Browser-side chroma matte and alpha cleanup for simple image backgrounds.',
    category: 'image',
    route: '/tool/image-matte',
    embed: false,
    restored: true,
    visibleInHub: false,
    inputs: [commonImageInput],
    outputs: [pngOutput],
    lazyComponent: noProps(() => import('../components/ImageMatte')),
  },
  {
    id: 'pixelate',
    name: 'Pixel Art Optimizer',
    shortName: 'Pixelate',
    description: 'Convert and tune images into pixel-art style assets.',
    category: 'image',
    route: '/tool/pixelate',
    embed: false,
    restored: true,
    visibleInHub: false,
    inputs: [commonImageInput],
    outputs: [pngOutput],
    lazyComponent: noProps(() => import('../components/ImagePixelate')),
  },
  {
    id: 'expand-shrink',
    name: 'Expand / Shrink Image',
    shortName: 'Expand',
    description: 'Grid-based image expansion and shrinking workflows.',
    category: 'image',
    route: '/tool/expand-shrink',
    embed: false,
    restored: true,
    visibleInHub: false,
    inputs: [commonImageInput],
    outputs: [pngOutput],
    lazyComponent: noProps(() => import('../components/ImageExpandShrink')),
  },
  {
    id: 'gemini-watermark',
    name: 'Gemini Watermark Cleanup',
    shortName: 'Gemini Mark',
    description: 'Remove visible Gemini watermark overlays from image assets.',
    category: 'image',
    route: '/tool/gemini-watermark',
    embed: false,
    restored: true,
    visibleInHub: false,
    inputs: [commonImageInput],
    outputs: [pngOutput],
    lazyComponent: noProps(() => import('../components/ImageGeminiWatermark')),
  },
  {
    id: 'seedance-watermark',
    name: 'Seedance Watermark Cleanup',
    shortName: 'Seedance Mark',
    description: 'Backend-assisted cleanup for Seedance / AI video watermark overlays.',
    category: 'image',
    route: '/tool/seedance-watermark',
    embed: false,
    restored: true,
    visibleInHub: false,
    inputs: [{ id: 'video', label: 'Video upload', kind: 'video' }],
    outputs: [{ id: 'video', label: 'Processed video', kind: 'zip' }],
    lazyComponent: noProps(() => import('../components/SeedanceWatermarkRemover')),
  },
  {
    id: 'legacy-map-stitch',
    name: 'Internal Map Stitch',
    shortName: 'Map Stitch',
    description: 'Internal map expansion templates, overlap blending, PSD, and Godot exports.',
    category: 'map',
    route: '/tool/legacy-map-stitch',
    embed: false,
    restored: true,
    visibleInHub: false,
    inputs: [commonImageInput],
    outputs: [pngOutput, zipOutput],
    lazyComponent: asTool(() => import('../components/MapStitch'), (props) => ({ onBack: props.onBack ?? (() => undefined) })),
  },
  {
    id: 'control-test-topdown',
    name: 'Topdown Control Test',
    shortName: 'Topdown Test',
    description: 'Playable topdown control test scene with sprite, background, BGM, and obstacle editing.',
    category: 'game-runtime',
    route: '/tool/control-test-topdown',
    embed: true,
    restored: true,
    visibleInHub: false,
    inputs: [commonImageInput, { id: 'audio', label: 'BGM', kind: 'audio' }],
    outputs: [jsonOutput],
    lazyComponent: asTool(() => import('../components/ControlTest'), (props) => ({ onBack: props.onBack, variant: 'topdown' as const })),
  },
  {
    id: 'control-test-arcade',
    name: 'Arcade Control Test',
    shortName: 'Arcade Test',
    description: 'Playable arcade control test scene with parallax foreground and background.',
    category: 'game-runtime',
    route: '/tool/control-test-arcade',
    embed: true,
    restored: true,
    visibleInHub: false,
    inputs: [commonImageInput, { id: 'audio', label: 'BGM', kind: 'audio' }],
    outputs: [jsonOutput],
    lazyComponent: asTool(() => import('../components/ControlTest'), (props) => ({ onBack: props.onBack, variant: 'arcade' as const })),
  },
  {
    id: 'ronin-pro',
    name: 'Internal Advanced Sprite Suite',
    shortName: 'Advanced Suite',
    description: 'Advanced sprite slicing, scaling, sheet processing, workflows, audio compression, and Rseprite tools.',
    category: 'sprite',
    route: '/tool/ronin-pro',
    embed: false,
    restored: true,
    visibleInHub: false,
    inputs: [commonImageInput, { id: 'audio', label: 'Audio', kind: 'audio', multiple: true }],
    outputs: [pngOutput, zipOutput, { id: 'gif', label: 'GIF export', kind: 'gif' }],
    lazyComponent: asTool(() => import('../components/RoninPro'), (props) => ({ onBack: props.onBack })),
  },
  {
    id: 'infinite-map',
    name: 'Infinite Map Prototype',
    shortName: 'Infinite Map',
    description: 'Procedural tilemap terrain and perspective scrolling prototype.',
    category: 'map',
    route: '/tool/infinite-map',
    embed: false,
    restored: true,
    visibleInHub: false,
    inputs: [],
    outputs: [jsonOutput],
    lazyComponent: asTool(() => import('../components/InfiniteMapPlaceholder'), (props) => ({ onBack: props.onBack ?? (() => undefined) })),
  },
  {
    id: 'assets-source',
    name: 'Assets and Source Share',
    shortName: 'Assets',
    description: 'Open asset, reference, and source-code resource collection.',
    category: 'game-runtime',
    route: '/tool/assets-source',
    embed: false,
    restored: true,
    visibleInHub: false,
    inputs: [],
    outputs: [],
    lazyComponent: noProps(() => import('../components/AssetsAndSourceShare')),
  },
  {
    id: 'ai-pixel-animals',
    name: 'AI Pixel Animals Hub',
    shortName: 'AI Animals',
    description: 'AI pixel animal prompt and generation entry hub.',
    category: 'ai',
    route: '/tool/ai-pixel-animals',
    embed: false,
    restored: true,
    visibleInHub: false,
    inputs: [],
    outputs: [],
    lazyComponent: asTool(() => import('../components/AiPixelAnimalsHub'), (props) => ({ onBack: props.onBack ?? (() => undefined) })),
  },
  {
    id: 'gem-pixel-potpourri',
    name: 'Gem Pixel Potpourri',
    shortName: 'Gem Hub',
    description: 'Collected Gemini pixel generation presets and references.',
    category: 'ai',
    route: '/tool/gem-pixel-potpourri',
    embed: false,
    restored: true,
    visibleInHub: false,
    inputs: [],
    outputs: [],
    lazyComponent: asTool(() => import('../components/GemPixelPotpourriHub'), (props) => ({ onBack: props.onBack ?? (() => undefined) })),
  },
  {
    id: 'nanobanana-full-char',
    name: 'Nanobanana Full Character',
    shortName: 'Full Char',
    description: 'Full character generation preset helper.',
    category: 'ai',
    route: '/tool/nanobanana-full-char',
    embed: false,
    restored: true,
    visibleInHub: false,
    inputs: [],
    outputs: [],
    lazyComponent: noProps(() => import('../components/NanobananaFullChar')),
  },
  {
    id: 'video-frames',
    name: 'Video to Frames / Sprite Sheet',
    shortName: 'Video Frames',
    description: 'Upload video, extract frames, matte or outline frames, and export sprite assets.',
    category: 'animation',
    route: '/tool/video-frames',
    embed: false,
    restored: true,
    visibleInHub: false,
    inputs: [{ id: 'video', label: 'Video upload', kind: 'video' }],
    outputs: [pngOutput, zipOutput],
    lazyComponent: noProps(() => import('./VideoFrameTool')),
  },
]

const publicToolIds = ['map-studio', 'obstacle-painter', 'image-process', 'character-action']
const publicToolIdSet = new Set(publicToolIds)
const allToolById = new Map(allToolDefinitions.map((tool) => [tool.id, tool]))

export const publicToolRegistry = publicToolIds
  .map((id) => allToolById.get(id))
  .filter((tool): tool is GameToolDefinition => Boolean(tool))

export const internalToolRegistry = allToolDefinitions.filter((tool) => !publicToolIdSet.has(tool.id))
export const toolRegistry = [...publicToolRegistry, ...internalToolRegistry]
export const toolById = new Map(toolRegistry.map((tool) => [tool.id, tool]))

const legacyToolAliases = new Map<string, string>([
  ['mapStudio', 'map-studio'],
  ['mapStitch', 'legacy-map-stitch'],
  ['obstacle-editor', 'obstacle-painter'],
  ['obstacles', 'obstacle-painter'],
  ['obstacleEditor', 'obstacle-painter'],
  ['ai-matte', 'image-process'],
  ['aiBackgroundRemover', 'image-process'],
  ['background-remover', 'image-process'],
  ['backgroundRemover', 'image-process'],
  ['matte', 'image-process'],
  ['characterAction', 'character-action'],
  ['spriteFrameLab', 'character-action'],
  ['frame-lab', 'character-action'],
  ['gif', 'gif-frames'],
  ['spritesheet', 'sprite-sheet'],
  ['spriteadjust', 'sprite-adjust'],
  ['image', 'image-process'],
  ['imageProcess', 'image-process'],
  ['imageMatte', 'image-matte'],
  ['pixelate', 'pixelate'],
  ['expandshrink', 'expand-shrink'],
  ['geminiwatermark', 'gemini-watermark'],
  ['seedanceWatermark', 'seedance-watermark'],
  ['controlTest', 'control-test-topdown'],
  ['controlTestArcade', 'control-test-arcade'],
  ['roninPro', 'ronin-pro'],
  ['infiniteMap', 'infinite-map'],
  ['assetsAndSource', 'assets-source'],
  ['aiPixelAnimals', 'ai-pixel-animals'],
  ['gemPixelPotpourri', 'gem-pixel-potpourri'],
  ['nanobananaFullChar', 'nanobanana-full-char'],
  ['video', 'video-frames'],
])

function resolveToolId(id: string | null): string | null {
  if (!id) return null
  const resolved = toolById.has(id) ? id : legacyToolAliases.get(id) ?? null
  return resolved
}

export function getToolFromLocation(location: Location = window.location): GameToolDefinition | null {
  const params = new URLSearchParams(location.search)
  const allowInternal = params.get('internal') === '1'
  const queryTool = resolveToolId(params.get('tool'))
  if (queryTool) {
    const tool = toolById.get(queryTool) ?? null
    if (tool?.visibleInHub === false && !allowInternal) return null
    return tool
  }

  const match = location.pathname.match(/\/tool\/([^/?#]+)/)
  if (!match) return null
  const id = resolveToolId(decodeURIComponent(match[1] ?? ''))
  if (!id) return null
  const tool = toolById.get(id) ?? null
  if (tool?.visibleInHub === false && !allowInternal) return null
  return tool
}
