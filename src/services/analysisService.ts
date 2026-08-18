import { runGenerativeAnalysis } from './analyzerService'
import { runPredictiveAnalysis } from './coreAiService'
import type { ApiResult } from './httpClient'

export type AnalysisMode = 'generative' | 'predictive'

export type AnalysisRunResult = ApiResult & {
  // Only the generative flow reports progress through the Analyzer status endpoint.
  requiresStatusPolling: boolean
}

export async function runAnalysis(
  mode: AnalysisMode,
  namespaces: string[],
): Promise<AnalysisRunResult> {
  if (mode === 'predictive') {
    const result = await runPredictiveAnalysis({ namespaces, enableMl: true })
    return { ...result, requiresStatusPolling: false }
  }

  const result = await runGenerativeAnalysis(namespaces)
  return { ...result, requiresStatusPolling: true }
}
