import { ANALYZER_RUN_PATH } from '../config/api'
import { executeRequest, type ApiResult } from './httpClient'

// Generative flow: keeps the historical `llm` payload accepted by the Analyzer API.
export async function runGenerativeAnalysis(namespaces: string[]): Promise<ApiResult> {
  return executeRequest('POST', ANALYZER_RUN_PATH, {
    mode: 'llm',
    namespaces,
  })
}
