import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { deflateSync } from 'node:zlib'

const zh = {
  hubTitle: '\u6e38\u620f\u5236\u4f5c\u5de5\u5177\u96c6\u5408',
  mapStudio: '\u5730\u56fe\u5de5\u4f5c\u53f0',
  obstaclePainter: '\u969c\u788d\u7269\u62fc\u8c46\u7f16\u8f91',
  imageProcess: '\u56fe\u7247\u7d20\u6750\u5904\u7406',
  characterAction: '\u89d2\u8272\u52a8\u4f5c\u5305\u5236\u4f5c',
}

const legacyBrandPattern = () => new RegExp(`Frame\\s*${'Ronin'}|Frame${'Ronin'}`, 'i')

async function gotoWithLang(page: Page, route: string, lang = 'zh') {
  await page.goto(route)
  await page.evaluate((value) => localStorage.setItem('droi_game_tool_lang_v2', value), lang)
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const typeBytes = Buffer.from(type, 'ascii')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])))
  return Buffer.concat([length, typeBytes, data, crc])
}

function makePng(width: number, height: number, rgba: [number, number, number, number]): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1)
    raw[row] = 0
    for (let x = 0; x < width; x += 1) {
      const offset = row + 1 + x * 4
      raw[offset] = rgba[0]
      raw[offset + 1] = rgba[1]
      raw[offset + 2] = rgba[2]
      raw[offset + 3] = rgba[3]
    }
  }
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

test('tool hub shows four public parent tools and hides legacy branding', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Game Production Tool Hub' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Map Studio/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Obstacle Pixel Painter/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Game Image Processor/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Character Action Pack Maker/ })).toBeVisible()
  await expect(page.locator('.tool-hub-card')).toHaveCount(4)
  await expect(page.locator('body')).not.toContainText(/AI Background Remover|Sprite Frame Lab/i)
  await expect(page.locator('body')).not.toContainText(legacyBrandPattern())
})

test('embedded capability deep links redirect into parent tools', async ({ page }) => {
  await page.goto('/tool/ai-background-remover')
  await expect(page).toHaveURL(/\/tool\/image-process\?tab=ai-matte/)
  await expect(page.getByRole('heading', { name: 'Game Image Processor' }).first()).toBeVisible()

  await page.goto('/tool/droi-art-matte')
  await expect(page).toHaveURL(/\/tool\/image-process\?tab=ai-matte/)
  await expect(page.getByRole('button', { name: /Process All/ })).toBeVisible()

  await page.goto('/tool/sprite-frame-lab')
  await expect(page).toHaveURL(/\/tool\/character-action\?panel=frame-import/)
  await expect(page.getByRole('heading', { name: 'Character Action Pack Maker' }).first()).toBeVisible()
  await expect(page.getByText('Frame Import')).toBeVisible()
})

test('tool route title matches hub entry in Chinese and English', async ({ page }) => {
  await gotoWithLang(page, '/tool/image-process')
  await expect(page.getByRole('heading', { name: zh.imageProcess }).first()).toBeVisible()

  await page.goto('/')
  await page.getByText('EN', { exact: true }).click()
  await page.getByRole('button', { name: /Game Image Processor/ }).click()

  await expect(page).toHaveURL(/\/tool\/image-process/)
  await expect(page.getByRole('heading', { name: 'Game Image Processor' }).first()).toBeVisible()
})

test('image processor exposes AI and local matte workflows inside one parent tool', async ({ page }) => {
  await page.goto('/tool/image-process?tab=ai-matte')

  await expect(page.getByRole('heading', { name: 'Game Image Processor' }).first()).toBeVisible()
  await expect(page.getByText('AI Background Remove').first()).toBeVisible()
  await expect(page.getByText('AI Matte', { exact: true })).toBeVisible()
  await page.getByText('Local Key', { exact: true }).click()
  await expect(page.getByText('Chroma', { exact: true })).toBeVisible()
  await expect(page.getByText('Luma', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Green' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Blue' })).toBeVisible()
  await expect(page.getByText('Threshold')).toBeVisible()
  await page.getByText('Luma', { exact: true }).click()
  await expect(page.getByRole('button', { name: 'Soft VFX' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Strong Glow' })).toBeVisible()
  await expect(page.getByText('Preview Active')).toBeVisible()
  await expect(page.locator('body')).not.toContainText(/AI Background Remover|Sprite Frame Lab/i)
})

test('character action maker exposes internal frame import selection workflow', async ({ page }) => {
  await page.goto('/tool/character-action?panel=frame-import')

  await expect(page.getByRole('heading', { name: 'Character Action Pack Maker' }).first()).toBeVisible()
  await expect(page.getByText('Frame Import')).toBeVisible()
  await expect(page.getByText('Video / GIF / Image Sequence')).toBeVisible()
  await expect(page.getByRole('button', { name: /Upload Frames \/ GIF/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Preview Video Frame/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Extract Video/ })).toBeVisible()
  await expect(page.getByText('Video Matte')).toBeVisible()
  await expect(page.getByText('AI', { exact: true })).toBeVisible()
  await expect(page.getByText('AI + Luma', { exact: true })).toBeVisible()
  await page.getByText('AI + Luma', { exact: true }).click()
  await expect(page.getByRole('button', { name: 'Protect Subject' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Balanced VFX' })).toBeVisible()
  await page.getByText('Chroma', { exact: true }).click()
  await expect(page.getByRole('button', { name: 'Green' })).toBeVisible()
  await page.getByText('Luma', { exact: true }).click()
  await expect(page.getByRole('button', { name: 'Strong Glow' })).toBeVisible()
  await expect(page.getByText('Semi alpha to opaque')).toBeVisible()
  await expect(page.getByRole('button', { name: 'All' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Odd' })).toBeVisible()
  await expect(page.getByText('Reverse preview / export')).toBeVisible()
  await expect(page.getByRole('button', { name: /Download Frame/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export Imported Frame Pack' })).toBeVisible()
  await expect(page.locator('body')).not.toContainText(/AI Background Remover|Sprite Frame Lab/i)
})

test('all public tool routes render matching Chinese titles', async ({ page }) => {
  const routes = [
    ['/tool/map-studio', zh.mapStudio],
    ['/tool/obstacle-painter', zh.obstaclePainter],
    ['/tool/image-process', zh.imageProcess],
    ['/tool/character-action', zh.characterAction],
  ] as const

  for (const [route, title] of routes) {
    await gotoWithLang(page, route)
    await expect(page.getByRole('heading', { name: title }).first()).toBeVisible()
    await expect(page.locator('body')).not.toContainText(legacyBrandPattern())
  }
})

test('map studio stitch preview can be panned by dragging the map', async ({ page }) => {
  await gotoWithLang(page, '/tool/map-studio')

  await page.getByTestId('map-composer-source-input').setInputFiles({
    name: 'center-map.png',
    mimeType: 'image/png',
    buffer: makePng(160, 120, [24, 38, 66, 255]),
  })

  const stage = page.getByTestId('map-composer-stage-wrap')
  await expect(stage).toBeVisible()
  const before = await stage.boundingBox()
  if (!before) throw new Error('Map composer stage is not visible')

  const dragStartX = before.x + before.width / 2 - 54
  const dragStartY = before.y + before.height / 2 + 44
  await page.mouse.move(dragStartX, dragStartY)
  await page.mouse.down()
  await page.mouse.move(dragStartX + 84, dragStartY + 42)
  await page.mouse.up()

  const after = await stage.boundingBox()
  if (!after) throw new Error('Map composer stage disappeared after dragging')
  expect(after.x).toBeGreaterThan(before.x + 50)
  expect(after.y).toBeGreaterThan(before.y + 20)
})

test('map studio rotates uploaded center map by 90 degrees', async ({ page }) => {
  await gotoWithLang(page, '/tool/map-studio')

  await page.getByTestId('map-composer-source-input').setInputFiles({
    name: 'center-map.png',
    mimeType: 'image/png',
    buffer: makePng(160, 120, [24, 38, 66, 255]),
  })

  await expect(page.getByText('160 × 120px')).toBeVisible()
  await page.getByTestId('rotate-center-map').click()
  await expect(page.getByText('120 × 160px')).toBeVisible()
})

test('map studio keeps uploaded tiles when center rotates and rotates each tile', async ({ page }) => {
  await gotoWithLang(page, '/tool/map-studio')

  await page.getByTestId('map-composer-source-input').setInputFiles({
    name: 'center-map.png',
    mimeType: 'image/png',
    buffer: makePng(160, 120, [24, 38, 66, 255]),
  })

  await page.locator('[data-testid^="map-composer-tile-input-"]').first().setInputFiles({
    name: 'tile-map.png',
    mimeType: 'image/png',
    buffer: makePng(80, 60, [90, 180, 220, 255]),
  })

  const tileRotateButton = page.locator('[data-testid^="rotate-map-tile-"]').first()
  await page.locator('.map-composer-tile.has-image').first().click({ position: { x: 12, y: 12 } })
  await expect(tileRotateButton).toBeVisible()
  await page.getByTestId('rotate-center-map').click()
  await page.locator('.map-composer-tile.has-image').first().click({ position: { x: 12, y: 12 } })
  await expect(tileRotateButton).toBeVisible()
  await tileRotateButton.click()
  await expect(page.locator('.map-composer-tile-rotation').first()).toContainText('90')
})

test('obstacle painter places uploaded art at original size and shows scale controls', async ({ page }) => {
  await gotoWithLang(page, '/tool/obstacle-painter')

  await page.getByTestId('obstacle-map-input').setInputFiles({
    name: 'map.png',
    mimeType: 'image/png',
    buffer: makePng(256, 192, [24, 38, 66, 255]),
  })
  await page.getByTestId('obstacle-asset-input').setInputFiles({
    name: 'rock.png',
    mimeType: 'image/png',
    buffer: makePng(48, 36, [190, 220, 255, 192]),
  })

  await expect(page.locator('.map-studio-asset-card')).toHaveCount(1)
  await page.getByTestId('add-obstacle-center').click()

  const obstacle = page.locator('.map-studio-obstacle-instance')
  await expect(obstacle).toHaveCount(1)
  await expect(obstacle).toHaveCSS('width', '48px')
  await expect(obstacle).toHaveCSS('height', '36px')
  await expect(page.locator('.map-studio-obstacle-zoom-tools')).toBeVisible()
  await expect(page.locator('.map-studio-instance-size-control')).toBeVisible()
})

test('obstacle painter pans map by left dragging while select tool is active', async ({ page }) => {
  await gotoWithLang(page, '/tool/obstacle-painter')

  await page.getByTestId('obstacle-map-input').setInputFiles({
    name: 'map.png',
    mimeType: 'image/png',
    buffer: makePng(256, 192, [24, 38, 66, 255]),
  })

  const stage = page.getByTestId('obstacle-stage')
  await expect(stage).toBeVisible()
  const before = await stage.boundingBox()
  if (!before) throw new Error('Obstacle stage is not visible')

  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2)
  await page.mouse.down()
  await page.mouse.move(before.x + before.width / 2 + 90, before.y + before.height / 2 + 44)
  await page.mouse.up()

  const after = await stage.boundingBox()
  if (!after) throw new Error('Obstacle stage disappeared after panning')
  expect(after.x).toBeGreaterThan(before.x + 50)
  expect(after.y).toBeGreaterThan(before.y + 20)
})

test('obstacle painter draws and erases manual collision cells by dragging grid', async ({ page }) => {
  await gotoWithLang(page, '/tool/obstacle-painter')

  await page.getByTestId('obstacle-map-input').setInputFiles({
    name: 'map-with-visual-blockers.png',
    mimeType: 'image/png',
    buffer: makePng(256, 256, [24, 38, 66, 255]),
  })

  const workspace = page.getByTestId('obstacle-workspace')
  await expect(workspace).toBeVisible()
  const box = await workspace.boundingBox()
  if (!box) throw new Error('Obstacle workspace is not visible')
  const startX = box.x + box.width / 2 - 48
  const startY = box.y + box.height / 2
  const endX = startX + 128

  await page.getByText('绘制碰撞', { exact: true }).click()
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(endX, startY, { steps: 12 })
  await page.mouse.up()

  await expect.poll(async () => page.locator('.map-studio-collision-cell').count()).toBeGreaterThan(1)

  await page.getByTestId('collision-rule-playerOnlyBoundary').click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('export-obstacle-json').click()
  const download = await downloadPromise
  const path = await download.path()
  if (!path) throw new Error('Downloaded collision JSON path is missing')
  const payload = JSON.parse(await readFile(path, 'utf8')) as {
    collisionRule: { blockMode: string; affects: string; ignoredByTags: string[] }
    collisionCells: Array<{ blockMode?: string }>
  }
  expect(payload.collisionRule).toEqual({
    blockMode: 'playerOnlyBoundary',
    affects: 'player',
    ignoredByTags: [],
  })
  expect(payload.collisionCells.length).toBeGreaterThan(1)
  expect(payload.collisionCells.every((cell) => cell.blockMode === 'playerOnlyBoundary')).toBe(true)

  await page.getByText('擦除碰撞', { exact: true }).click()
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(endX, startY, { steps: 12 })
  await page.mouse.up()

  await expect(page.locator('.map-studio-collision-cell')).toHaveCount(0)
  await expect(page.locator('.map-studio-obstacle-instance')).toHaveCount(0)
})

test('obstacle painter randomly places only multi-selected assets and exports collision JSON', async ({ page }) => {
  await gotoWithLang(page, '/tool/obstacle-painter')

  await page.getByTestId('obstacle-map-input').setInputFiles({
    name: 'map.png',
    mimeType: 'image/png',
    buffer: makePng(512, 512, [24, 38, 66, 255]),
  })
  await page.getByTestId('obstacle-asset-input').setInputFiles([
    {
      name: 'a-rock.png',
      mimeType: 'image/png',
      buffer: makePng(48, 32, [190, 220, 255, 192]),
    },
    {
      name: 'b-tree.png',
      mimeType: 'image/png',
      buffer: makePng(56, 40, [80, 220, 140, 192]),
    },
    {
      name: 'c-water.png',
      mimeType: 'image/png',
      buffer: makePng(44, 28, [80, 160, 240, 192]),
    },
  ])

  await expect(page.locator('.map-studio-asset-card')).toHaveCount(3)
  await page.getByTestId('asset-multi-select-toggle').click()
  await page.getByTestId('obstacle-asset-card-a-rock.png').click()
  await page.getByTestId('obstacle-asset-card-b-tree.png').click()
  await page.getByTestId('random-place-obstacles').click()

  await expect.poll(async () => page.locator('.map-studio-obstacle-instance').count()).toBeGreaterThan(0)
  await expect.poll(async () => page.locator('.map-studio-collision-cell').count()).toBeGreaterThan(0)

  const firstObstacle = page.locator('.map-studio-obstacle-instance').first()
  const box = await firstObstacle.boundingBox()
  if (!box) throw new Error('Random obstacle is not visible')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 32, box.y + box.height / 2 + 32)
  await page.mouse.up()

  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('export-obstacle-json').click()
  const download = await downloadPromise
  const path = await download.path()
  if (!path) throw new Error('Downloaded collision JSON path is missing')
  const payload = JSON.parse(await readFile(path, 'utf8')) as {
    obstacles: Array<{ assetName: string; scale?: number; width: number; height: number }>
    collisionCells: Array<{ sourceInstanceId?: string }>
  }
  const selectedNames = new Set(['a-rock.png', 'b-tree.png'])

  expect(payload.obstacles.length).toBeGreaterThan(0)
  for (const obstacle of payload.obstacles) {
    expect(selectedNames.has(obstacle.assetName)).toBe(true)
    expect(obstacle.scale ?? 0).toBeGreaterThanOrEqual(0.4)
    expect(obstacle.scale ?? 0).toBeLessThanOrEqual(1)
    expect(Math.max(obstacle.width, obstacle.height)).toBeLessThanOrEqual(Math.ceil(512 * 0.18))
  }
  expect(payload.collisionCells.some((cell) => Boolean(cell.sourceInstanceId))).toBe(true)
})

test('overlapped obstacles keep lower collision cells after moving top obstacle', async ({ page }) => {
  await gotoWithLang(page, '/tool/obstacle-painter')

  await page.getByTestId('obstacle-map-input').setInputFiles({
    name: 'map.png',
    mimeType: 'image/png',
    buffer: makePng(256, 192, [24, 38, 66, 255]),
  })
  await page.getByTestId('obstacle-asset-input').setInputFiles({
    name: 'crate.png',
    mimeType: 'image/png',
    buffer: makePng(48, 36, [230, 180, 80, 220]),
  })

  await expect(page.locator('.map-studio-asset-card')).toHaveCount(1)
  await page.getByTestId('add-obstacle-center').click()
  await page.getByTestId('add-obstacle-center').click()
  await expect(page.locator('.map-studio-obstacle-instance')).toHaveCount(2)
  await expect(page.locator('.map-studio-collision-cell')).toHaveCount(8)

  const topObstacle = page.locator('.map-studio-obstacle-instance').nth(1)
  const box = await topObstacle.boundingBox()
  if (!box) throw new Error('Top obstacle is not visible')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 96, box.y + box.height / 2)
  await page.mouse.up()

  await expect(page.locator('.map-studio-obstacle-instance')).toHaveCount(2)
  await expect(page.locator('.map-studio-collision-cell')).toHaveCount(8)
})

test('Droi landing keeps embedded tool entry hidden by default', async ({ page }) => {
  await page.goto('http://127.0.0.1:5180/?demo=edit-workspace&v=e2e-tool')

  await expect(page.locator('[data-droi-game-tools]')).toHaveCount(0)
  await expect(page.locator('[data-droi-tool-open]')).toHaveCount(0)
  await expect(page.locator('iframe.droi-tool-frame')).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText(legacyBrandPattern())
})
