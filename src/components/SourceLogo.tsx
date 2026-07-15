import { useState } from 'react'

export function SourceLogo({ name, url }: { name: string, url: string }) {
  const [failed, setFailed] = useState(false)
  const domain = getDomain(url)

  if (failed || !domain) {
    return (
      <span className="source-logo source-logo-fallback" aria-hidden="true">
        {getInitials(name)}
      </span>
    )
  }

  return (
    <span className="source-logo">
      <img
        src={`https://icons.duckduckgo.com/ip3/${domain}.ico`}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </span>
  )
}

function getDomain(url: string) {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

function getInitials(name: string) {
  return name
    .split(/\s|\//)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase()
}
