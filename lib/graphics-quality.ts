export type GraphicsTier = 'mobile' | 'balanced' | 'high'

export const GRAPHICS_PRESETS: Record<GraphicsTier, {
  dpr: number
  shadows: boolean
  antialias: boolean
  environment: boolean
}> = {
  // Start at native-ish resolution for sharp text and edges. The frame guard can reduce DPR only if needed.
  mobile:   { dpr: 1.0, shadows: false, antialias: true, environment: false },
  // Mid-range laptop / integrated graphics.
  balanced: { dpr: 1.05, shadows: false, antialias: true, environment: false },
  // Desktop workstation.
  high:     { dpr: 1.2, shadows: true, antialias: true, environment: true },
}
