import type { SpriteSheetExport } from './spriteSheet'

export function createSpriteFrameManifest(options: {
  fps: number
  reverse: boolean
  frameWidth: number
  frameHeight: number
  sheet: SpriteSheetExport['json']
}) {
  return {
    version: 1,
    format: 'droi-sprite-frame-pack',
    fps: options.fps,
    reverse: options.reverse,
    frameWidth: options.frameWidth,
    frameHeight: options.frameHeight,
    frames: options.sheet.frames.map((frame) => ({
      index: frame.index,
      file: frame.file,
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
    })),
    spriteSheet: {
      image: 'sheets/sprite_sheet.png',
      json: 'sheets/sprite_sheet.json',
    },
  }
}
