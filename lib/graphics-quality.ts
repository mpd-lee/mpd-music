export type GraphicsTier = 'mobile' | 'balanced' | 'high'

export const GRAPHICS_PRESETS: Record<GraphicsTier, {
  dpr: number
  shadows: boolean
  antialias: boolean
  environment: boolean
}> = {
  // Phone/tablet: prioritize responsive movement and fast first entry.
  mobile:   { dpr: 0.5, shadows: false, antialias: false, environment: false },
  // Mid-range laptop / integrated graphics.
  balanced: { dpr: 0.68, shadows: false, antialias: false, environment: false },
  // Desktop workstation.
  high:     { dpr: 0.98, shadows: true,  antialias: true,  environment: true },
}
