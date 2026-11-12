export type FitnessKind =
  | 'treadmill'
  | 'bike'
  | 'elliptical'
  | 'rower'
  | 'stepper'
  | 'chest-press'
  | 'lat-pulldown'
  | 'leg-press'
  | 'punching-bag'
  | 'bench-press'
  | 'yoga-mat'

export type WorkoutMode = FitnessKind | null
