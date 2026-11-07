/** Minimal static server with .html fallback, mirroring the nginx `try_files` behavior. */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
}

/** Start serving `root` on `port`; resolves to the server so callers can close it. */
export async function serve(root, port) {
  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://local').pathname)
    for (const candidate of [pathname, `${pathname}.html`, join(pathname, 'index.html')]) {
      try {
        const body = await readFile(join(root, candidate))
        response.writeHead(200, { 'content-type': TYPES[extname(candidate)] ?? 'application/octet-stream' })
        response.end(body)
        return
      } catch {
        // try the next candidate
      }
    }
    response.writeHead(404)
    response.end('not found')
  })
  await new Promise((resolve) => server.listen(port, resolve))
  return server
}
