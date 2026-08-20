import { runGenerativeAnalysis } from './analyzerService'
import { runPredictiveAnalysis } from './coreAiService'
import type { ApiResult } from './httpClient'

export type AnalysisMode = 'generative' | 'predictive'

export type AnalysisRunResult = ApiResult & {
  requiresStatusPolling: boolean
  executionId?: string
}

export async function runAnalysis(
  mode: AnalysisMode,
  namespaces: string[],
): Promise<AnalysisRunResult> {
  if (mode === 'predictive') {
    const result = await runPredictiveAnalysis({ namespaces, enableMl: true })
    return { ...result, requiresStatusPolling: true, executionId: result.executionId }
  }

  const result = await runGenerativeAnalysis(namespaces)
  return { ...result, requiresStatusPolling: true }
}
