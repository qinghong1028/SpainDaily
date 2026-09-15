export function googleMapsSearch(query: string): string {
  const url = new URL('https://www.google.com/maps/search/')
  url.searchParams.set('api', '1')
  url.searchParams.set('query', query)
  return url.toString()
}

export function googleMapsDirections(destination: string, origin?: string, travelMode: 'walking' | 'transit' | 'driving' = 'transit'): string {
  const url = new URL('https://www.google.com/maps/dir/')
  url.searchParams.set('api', '1')
  if (origin) url.searchParams.set('origin', origin)
  url.searchParams.set('destination', destination)
  url.searchParams.set('travelmode', travelMode)
  return url.toString()
}
