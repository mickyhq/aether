export function isPageVisible() {
  return document.visibilityState !== 'hidden'
}

export function subscribeToPageVisibility(
  listener: (visible: boolean) => void
) {
  const handleVisibilityChange = () => listener(isPageVisible())

  document.addEventListener('visibilitychange', handleVisibilityChange)

  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  }
}
