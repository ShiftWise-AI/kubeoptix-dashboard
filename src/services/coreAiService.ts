import { CORE_AI_ANALYSIS_PATH, CORE_AI_REQUEST_TIMEOUT_MS } from '../config/api'
import { ApiRequestError, executeRequest, type ApiResult } from './httpClient'

export type PredictiveAnalysisRequest = {
  namespaces: string[]
  enableMl?: boolean
}

function buildPayload(request: PredictiveAnalysisRequest): Record<string, unknown> {
  return {
    namespaces: request.namespaces,
    enable_ml: request.enableMl ?? true,
  }
}

export async function runPredictiveAnalysis(
  request: PredictiveAnalysisRequest,
): Promise<ApiResult> {
  const result = await executeRequest(
    'POST',
    CORE_AI_ANALYSIS_PATH,
    buildPayload(request),
    { timeoutMs: CORE_AI_REQUEST_TIMEOUT_MS },
  )

  if (typeof result.payload !== 'object' || result.payload === null) {
    throw new ApiRequestError(
      'The core-ai API returned an unexpected response.',
      result.statusCode,
      result.payload,
    )
  }

  return result
}
