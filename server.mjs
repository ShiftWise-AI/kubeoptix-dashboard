import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { Readable } from 'node:stream'

const port = 8080
const harvesterApiUrl = new URL(process.env.HARVESTER_API_URL)
const analyzerApiUrl = new URL(process.env.ANALYZER_API_URL)
const reporterApiUrl = new URL(
  process.env.REPORTER_API_URL ?? 'http://reporter-api:8000',
)
const coreAiApiUrl = new URL(
  process.env.CORE_AI_API_URL ?? 'http://core-ai-api:8000',
)
const distDirectory = resolve('dist')

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(payload))
}

async function proxyApi(request, response, prefix, apiUrl) {
  const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
  const upstreamPath = requestUrl.pathname.slice(prefix.length) || '/'
  const upstreamUrl = new URL(`${upstreamPath}${requestUrl.search}`, apiUrl)
  const headers = { ...request.headers }
  const hasRequestBody = request.method !== 'GET' && request.method !== 'HEAD'
  const requestBody = hasRequestBody
    ? Buffer.concat(await Array.fromAsync(request, (chunk) => Buffer.from(chunk)))
    : undefined

  delete headers.host
  delete headers.connection
  delete headers['content-length']

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body: requestBody,
    })

    const responseHeaders = Object.fromEntries(upstreamResponse.headers.entries())
    delete responseHeaders['content-encoding']
    delete responseHeaders['content-length']
    delete responseHeaders.connection

    response.writeHead(upstreamResponse.status, responseHeaders)
    if (upstreamResponse.body) {
      Readable.fromWeb(upstreamResponse.body).pipe(response)
    } else {
      response.end()
    }
  } catch (error) {
    console.error(`API proxy error for ${upstreamUrl}:`, error)
    sendJson(response, 502, { error: 'Upstream API is unavailable.' })
  }
}

function serveStatic(request, response) {
  const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
  const requestedPath = normalize(decodeURIComponent(requestUrl.pathname)).replace(/^(\.\.[/\\])+/, '')
  let filePath = join(distDirectory, requestedPath)

  if (!filePath.startsWith(distDirectory) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(distDirectory, 'index.html')
  }

  response.writeHead(200, {
    'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream',
    'Cache-Control': filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
  })
  createReadStream(filePath).pipe(response)
}

const server = createServer(async (request, response) => {
  if (request.url?.startsWith('/api/harvester')) {
    await proxyApi(request, response, '/api/harvester', harvesterApiUrl)
    return
  }

  if (request.url?.startsWith('/api/analyzer')) {
    await proxyApi(request, response, '/api/analyzer', analyzerApiUrl)
    return
  }

  if (request.url?.startsWith('/api/reporter')) {
    await proxyApi(request, response, '/api/reporter', reporterApiUrl)
    return
  }

  if (request.url?.startsWith('/api/core-ai')) {
    await proxyApi(request, response, '/api/core-ai', coreAiApiUrl)
    return
  }

  if (request.url === '/healthz') {
    sendJson(response, 200, { status: 'ok' })
    return
  }

  serveStatic(request, response)
})

server.listen(port, '0.0.0.0', () => {
  console.log(`KubeOptix Dashboard listening on port ${port}`)
  console.log(`Harvester API target: ${harvesterApiUrl.origin}`)
  console.log(`Analyzer API target: ${analyzerApiUrl.origin}`)
  console.log(`Reporter API target: ${reporterApiUrl.origin}`)
  console.log(`Core AI API target: ${coreAiApiUrl.origin}`)
})

function shutdown(signal) {
  console.log(`Received ${signal}; shutting down.`)
  server.close(() => process.exit(0))
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
