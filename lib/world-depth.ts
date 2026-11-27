export const UNDERWATER_SURFACE_Y = 0.42
// Keep the explorer below the waterline while allowing a genuinely deep dive.
export const UNDERWATER_MIN_Y = -900.25
// The visible panoramic reef shell has a 3.2 km radius. Keep the physical seabed
// safely below that shell (even at max dive depth) so a flat plane cannot cut
// across the photograph and create the persistent horizontal blur/horizon seam.
export const UNDERWATER_FLOOR_Y = -4400
// Broad free-swim boundaries, centred on the pool entrance's world coordinates.
export const UNDERWATER_MIN_X = -4000
export const UNDERWATER_MAX_X = 4000
export const UNDERWATER_MIN_Z = -4000
export const UNDERWATER_MAX_Z = 4000
