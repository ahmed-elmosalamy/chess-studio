import type { EngineSettings } from '../../shared/engine.ts'

export function configScript(settings: EngineSettings): string[] {
  return [
    `setoption name MultiPV value ${settings.multipv}`,
    `setoption name Threads value ${settings.threads}`,
    `setoption name Hash value ${settings.hash}`
  ]
}

export function searchScript(fen: string, settings: EngineSettings, stopFirst: boolean): string[] {
  const commands: string[] = []
  if (stopFirst) commands.push('stop')
  commands.push(`position fen ${fen}`)
  commands.push(`go depth ${settings.depth}`)
  return commands
}
