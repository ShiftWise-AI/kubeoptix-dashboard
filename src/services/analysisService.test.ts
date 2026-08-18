import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ANALYZER_RUN_PATH, CORE_AI_ANALYSIS_PATH } from '../config/api'
import { runAnalysis } from './analysisService'
import { ApiRequestError } from './httpClient'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('generative mode', () => {
  it('keeps using the analyzer run endpoint with the legacy payload', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'started' }, 202))

    const result = await runAnalysis('generative', ['ns-a', 'ns-b'])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [path, init] = fetchMock.mock.calls[0]
    expect(path).toBe(ANALYZER_RUN_PATH)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ mode: 'llm', namespaces: ['ns-a', 'ns-b'] })
    expect(result.requiresStatusPolling).toBe(true)
    expect(result.statusCode).toBe(202)
  })

  it('never calls the core-ai API', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'started' }))

    await runAnalysis('generative', ['ns-a'])

    expect(fetchMock.mock.calls[0][0]).not.toBe(CORE_AI_ANALYSIS_PATH)
  })
})

describe('predictive mode', () => {
  it('posts to the core-ai analysis endpoint with namespaces and enable_ml', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ analysis: [] }))

    const result = await runAnalysis('predictive', ['example-ns-prd', 'other-ns-prd'])

    const [path, init] = fetchMock.mock.calls[0]
    expect(path).toBe(CORE_AI_ANALYSIS_PATH)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      namespaces: ['example-ns-prd', 'other-ns-prd'],
      enable_ml: true,
    })
    expect(result.requiresStatusPolling).toBe(false)
  })

  it('propagates core-ai HTTP errors', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'model unavailable' }, 503))

    await expect(runAnalysis('predictive', ['ns-a'])).rejects.toMatchObject({
      name: 'ApiRequestError',
      statusCode: 503,
      message: 'model unavailable',
    })
  })

  it('rejects invalid core-ai responses', async () => {
    fetchMock.mockResolvedValue(jsonResponse('not-an-object'))

    await expect(runAnalysis('predictive', ['ns-a'])).rejects.toBeInstanceOf(ApiRequestError)
  })

  it('fails with a timeout error when the request is aborted', async () => {
    fetchMock.mockImplementation((_path: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
    })

    vi.useFakeTimers()
    const pending = runAnalysis('predictive', ['ns-a'])
    const assertion = expect(pending).rejects.toMatchObject({ statusCode: 408 })
    await vi.advanceTimersByTimeAsync(120_000)
    await assertion
  })

  it('reports communication errors', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(runAnalysis('predictive', ['ns-a'])).rejects.toMatchObject({
      statusCode: 0,
      message: 'Failed to fetch',
    })
  })
})
