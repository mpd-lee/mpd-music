export type GraphicsTier = 'mobile' | 'balanced' | 'high'

export const GRAPHICS_PRESETS: Record<GraphicsTier, {
  dpr: number
  shadows: boolean
  antialias: boolean
  environment: boolean
}> = {
  // Phone/tablet: prioritize responsive movement and fast first entry.
  mobile:   { dpr: 0.88, shadows: false, antialias: true, environment: false },
  // Mid-range laptop / integrated graphics.
  balanced: { dpr: 0.92, shadows: false, antialias: true, environment: false },
  // Desktop workstation.
  high:     { dpr: 1.12, shadows: true,  antialias: true,  environment: true },
}
