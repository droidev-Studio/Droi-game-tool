import { removeBackground } from '../../api'
import { hasUsefulAlpha } from './imageAlpha'

export type MatteProcessResult = {
  blob: Blob
  status: 'transparent' | 'processed' | 'failed' | 'too-large'
  skipped: boolean
  error?: unknown
}

export type MatteProcessOptions = {
  skipTransparent?: boolean
  maxImageMb?: number
  signal?: AbortSignal
}

export async function removeBackgroundIfNeeded(file: File, options: MatteProcessOptions | boolean = {}): Promise<MatteProcessResult> {
  const resolvedOptions: MatteProcessOptions = typeof options === 'boolean' ? { skipTransparent: options } : options
  const skipTransparent = resolvedOptions.skipTransparent ?? true
  if (resolvedOptions.maxImageMb && file.size > resolvedOptions.maxImageMb * 1024 * 1024) {
    return { blob: file, status: 'too-large', skipped: true }
  }
  if (skipTransparent) {
    try {
      if (await hasUsefulAlpha(file)) {
        return { blob: file, status: 'transparent', skipped: true }
      }
    } catch {
      // If alpha probing fails, still try the matte endpoint before falling back.
    }
  }
  try {
    const blob = await removeBackground(file, resolvedOptions.signal)
    return { blob, status: 'processed', skipped: false }
  } catch (error) {
    return { blob: file, status: 'failed', skipped: false, error }
  }
}
