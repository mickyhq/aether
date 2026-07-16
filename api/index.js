import { dispatchApiRequest } from '../server/apiRoutes.js'

export const maxDuration = 60

export default async function handler(request, response) {
  await dispatchApiRequest(request, response)
}
