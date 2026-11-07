import type { EngineSettings } from '@shared/engine'
import type { EngineClient, EngineEvents } from './engineClient.ts'

export default class NativeEngine implements EngineClient {
  private expected = 0
  private unsubscribe: (() => void) | null = null

  constructor(private readonly events: EngineEvents) {
    this.unsubscribe = window.studio.engine.onEvent((payload) => {
      if (payload.kind === 'status') {
        this.events.onState(payload.status.state, payload.status.name, payload.status.error)
        return
      }
      if (payload.epoch !== this.expected) return
      if (payload.kind === 'line') this.events.onLine(payload.line)
      else this.events.onBest(payload.move)
    })
  }

  analyze(fen: string, settings: EngineSettings, epoch: number): void {
    this.expected = epoch
    window.studio.engine.analyze({ epoch, fen, source: 'native', settings })
  }

  stop(): void {
    window.studio.engine.stop()
  }

  dispose(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
    window.studio.engine.stop()
  }
}
