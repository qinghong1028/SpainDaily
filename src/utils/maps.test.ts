import { describe, expect, it } from 'vitest'
import { googleMapsDirections, googleMapsSearch } from './maps'

describe('Google Maps URLs', () => {
  it('round-trips accented names and punctuation through URLSearchParams', () => {
    const url = new URL(googleMapsSearch('Basílica de la Sagrada Família, Carrer de Mallorca, 401'))
    expect(url.protocol).toBe('https:')
    expect(url.searchParams.get('query')).toBe('Basílica de la Sagrada Família, Carrer de Mallorca, 401')
  })

  it('keeps current-location and previous-stop routes distinct', () => {
    const current = new URL(googleMapsDirections('Mezquita-Catedral de Córdoba'))
    const previous = new URL(googleMapsDirections('Mezquita-Catedral de Córdoba', 'Córdoba railway station', 'walking'))
    expect(current.searchParams.has('origin')).toBe(false)
    expect(previous.searchParams.get('origin')).toBe('Córdoba railway station')
    expect(previous.searchParams.get('travelmode')).toBe('walking')
  })
})
