type LayerControlInfo = {
  id: string
  label: string
  detail: string
  aboutLabel: string
}

export function addLayerControlInfo(
  input: HTMLInputElement | undefined,
  info: LayerControlInfo
) {
  const label = input?.closest('label')

  if (!label) {
    return () => {}
  }

  const row = document.createElement('div')
  const button = document.createElement('button')
  const popover = document.createElement('div')
  const popoverId = `layer-info-${info.id}`

  row.className = 'leaflet-layer-info-row'
  button.type = 'button'
  button.className = 'leaflet-layer-info-button'
  button.textContent = 'i'
  button.setAttribute('aria-label', info.aboutLabel)
  button.setAttribute('aria-expanded', 'false')
  button.setAttribute('aria-controls', popoverId)
  button.setAttribute('aria-haspopup', 'dialog')
  popover.id = popoverId
  popover.className = 'leaflet-layer-info-popover'
  popover.hidden = true
  popover.tabIndex = -1
  popover.setAttribute('role', 'dialog')
  popover.setAttribute('aria-label', info.label)
  popover.textContent = info.detail

  label.before(row)
  row.append(label, button)
  row.after(popover)

  const close = () => {
    popover.hidden = true
    button.setAttribute('aria-expanded', 'false')
  }
  const toggle = () => {
    const willOpen = popover.hidden

    popover.hidden = !willOpen
    button.setAttribute('aria-expanded', String(willOpen))

    if (willOpen) {
      popover.focus()
    }
  }
  const handleButtonClick = () => toggle()
  const handleButtonKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      close()
    }
  }
  const handlePopoverKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      close()
      button.focus()
    }
  }
  const handleOutsidePointer = (event: PointerEvent) => {
    const target = event.target

    if (
      !popover.hidden &&
      target instanceof Node &&
      !row.contains(target) &&
      !popover.contains(target)
    ) {
      close()
    }
  }

  button.addEventListener('click', handleButtonClick)
  button.addEventListener('keydown', handleButtonKeyDown)
  popover.addEventListener('keydown', handlePopoverKeyDown)
  document.addEventListener('pointerdown', handleOutsidePointer)

  return () => {
    button.removeEventListener('click', handleButtonClick)
    button.removeEventListener('keydown', handleButtonKeyDown)
    popover.removeEventListener('keydown', handlePopoverKeyDown)
    document.removeEventListener('pointerdown', handleOutsidePointer)
    row.before(label)
    row.remove()
    popover.remove()
  }
}
