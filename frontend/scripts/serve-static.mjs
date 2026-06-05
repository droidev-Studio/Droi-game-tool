import http from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'

const [, , rootArg, portArg = '5180'] = process.argv

if (!rootArg) {
  console.error('Usage: node scripts/serve-static.mjs <root> [port]')
  process.exit(1)
}

const root = resolve(rootArg)
const port = Number(portArg)

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
  ['.gif', 'image/gif'],
  ['.ogg', 'audio/ogg'],
])

function sendFile(response, filePath) {
  response.writeHead(200, {
    'Content-Type': mimeTypes.get(extname(filePath).toLowerCase()) ?? 'application/octet-stream',
  })
  createReadStream(filePath).pipe(response)
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`)
  const decodedPath = decodeURIComponent(url.pathname)
  const candidate = normalize(join(root, decodedPath))
  if (!candidate.startsWith(root)) {
    response.writeHead(403)
    response.end('Forbidden')
    return
  }

  const filePath = existsSync(candidate) && statSync(candidate).isDirectory()
    ? join(candidate, 'index.html')
    : candidate

  if (!existsSync(filePath)) {
    const fallback = join(root, 'index.html')
    if (existsSync(fallback)) {
      sendFile(response, fallback)
      return
    }
    response.writeHead(404)
    response.end('Not found')
    return
  }

  sendFile(response, filePath)
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Static server listening on http://127.0.0.1:${port}`)
})
