import { CORE_AI_REPORTS_PATH, CORE_AI_REQUEST_TIMEOUT_MS } from '../config/api'
import { ApiRequestError, executeRequest, type ApiResult } from './httpClient'

export type PredictiveAnalysisRequest = {
  namespaces: string[]
  enableMl?: boolean
}

export type PredictiveAnalysisResult = ApiResult & {
  executionId: string
}

function getExecutionId(payload: object): string | null {
  const candidate = payload as Record<string, unknown>
  const executionId = candidate.execute_id
    ?? candidate.execution_id
    ?? candidate.executionId
    ?? candidate.exec_id
  return typeof executionId === 'string' && executionId.trim() ? executionId : null
}

function buildPayload(request: PredictiveAnalysisRequest): Record<string, unknown> {
  return {
    namespaces: request.namespaces,
    enable_ml: request.enableMl ?? true,
  }
}

export async function runPredictiveAnalysis(
  request: PredictiveAnalysisRequest,
): Promise<PredictiveAnalysisResult> {
  const result = await executeRequest(
    'POST',
    CORE_AI_REPORTS_PATH,
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

  const executionId = getExecutionId(result.payload)
  if (!executionId) {
    throw new ApiRequestError(
      'The core-ai API response did not include an execution ID.',
      result.statusCode,
      result.payload,
    )
  }

  return { ...result, executionId }
}
