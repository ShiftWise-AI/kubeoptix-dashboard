export class ApiRequestError extends Error {
  readonly statusCode: number
  readonly payload: unknown

  constructor(message: string, statusCode: number, payload: unknown) {
    super(message)
    this.name = 'ApiRequestError'
    this.statusCode = statusCode
    this.payload = payload
  }
}

export type ApiResult = {
  statusCode: number
  payload: unknown
}

export type RequestOptions = {
  timeoutMs?: number
}

export async function executeRequest(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: Record<string, unknown>,
  options?: RequestOptions,
): Promise<ApiResult> {
  const timeoutMs = options?.timeoutMs
  const controller = timeoutMs ? new AbortController() : undefined
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : undefined

  let response: Response

  try {
    response = await fetch(path, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller?.signal,
    })
  } catch (error) {
    if (controller?.signal.aborted) {
      throw new ApiRequestError(`Request timed out after ${timeoutMs} ms.`, 408, null)
    }

    throw new ApiRequestError(
      error instanceof Error ? error.message : 'Could not reach the API.',
      0,
      null,
    )
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
    }
  }

  const text = await response.text()
  let payload: unknown

  try {
    payload = text ? JSON.parse(text) : { status: response.statusText }
  } catch {
    throw new ApiRequestError('The API returned an invalid response.', response.status, text)
  }

  if (!response.ok) {
    throw new ApiRequestError(
      typeof payload === 'object' && payload !== null && 'error' in payload
        ? String((payload as Record<string, unknown>).error)
        : `Request failed with status ${response.status}`,
      response.status,
      payload,
    )
  }

  return { statusCode: response.status, payload }
}
