import { getReportedFires } from '../server/reportedFires.js'

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const fires = await getReportedFires()

    response.status(200)
    response.setHeader('Cache-Control', 'public, max-age=300')
    response.setHeader(
      'Vercel-CDN-Cache-Control',
      'public, s-maxage=900, stale-while-revalidate=3600'
    )
    response.json({ fires })
  } catch {
    response.status(502).json({ error: 'Reported wildfire feed unavailable' })
  }
}
