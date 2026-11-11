export type MessageTarget = {
  isDestroyed(): boolean
  send(channel: string, ...args: unknown[]): void
}

export function sendTo(target: MessageTarget | null | undefined, channel: string, payload: unknown): boolean {
  if (!target || target.isDestroyed()) return false
  try {
    target.send(channel, payload)
    return true
  } catch {
    // the window can be torn down between the isDestroyed() check and the send
    return false
  }
}
