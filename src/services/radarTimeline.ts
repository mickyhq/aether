import { fetchWithTimeout } from '../../shared/fetchTimeout.js'
import {
  parseResponseJson,
  radarMetadataResponseSchema
} from '../schemas/serverResponses'
import type { RadarFrame } from '../schemas/serverResponses'
import {
  recordProviderFailure,
  recordProviderRequestError
} from './clientTelemetry'

export async function fetchRadarTimelineFrames(signal?: AbortSignal) {
  try {
    const response = await fetchWithTimeout('/api/radar', { signal })

    if (!response.ok) {
      recordProviderFailure('radar')
      return []
    }

    const metadata = await parseResponseJson(
      response,
      radarMetadataResponseSchema,
      'Radar timeline response'
    )

    return metadata.frames
      .filter(isUsableRadarFrame)
      .sort((first, second) => first.time - second.time)
  } catch (error) {
    recordProviderRequestError('radar', error, signal)
    return []
  }
}

function isUsableRadarFrame(frame: RadarFrame) {
  return Number.isFinite(frame.time) && frame.path.startsWith('/')
}
