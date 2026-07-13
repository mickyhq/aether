export default function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  response.setHeader('Cache-Control', 'no-store')
  response.status(200).json({
    firmsConfigured: Boolean(process.env.FIRMS_MAP_KEY?.trim())
  })
}
