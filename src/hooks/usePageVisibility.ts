import { useEffect, useState } from 'react'
import {
  isPageVisible,
  subscribeToPageVisibility
} from '../utils/pageVisibility'

export function usePageVisibility() {
  const [pageVisible, setPageVisible] = useState(isPageVisible)

  useEffect(() => subscribeToPageVisibility(setPageVisible), [])

  return pageVisible
}
