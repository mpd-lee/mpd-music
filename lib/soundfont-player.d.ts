declare module 'soundfont-player' {
  export type LoadedSoundfontInstrument = {
    play(note: number, time?: number, options?: { duration?: number; gain?: number }): unknown
    stop?(): void
  }

  export function instrument(
    audioContext: AudioContext,
    name: string,
    options?: {
      soundfont?: 'FluidR3_GM' | 'MusyngKite'
      format?: 'mp3' | 'ogg'
      destination?: AudioNode
      gain?: number
      notes?: number[] | string[]
    },
  ): Promise<LoadedSoundfontInstrument>
}
