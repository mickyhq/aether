export default function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  const area = typeof request.body?.area === 'string'
    ? request.body.area.slice(0, 40)
    : 'unknown'
  const message = typeof request.body?.message === 'string'
    ? request.body.message.slice(0, 500)
    : 'Unknown rendering error'

  console.error(JSON.stringify({
    event: 'aether.client-render-error',
    area,
    message
  }))
  response.status(204).send('')
}
