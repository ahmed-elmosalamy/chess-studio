let counter = 0

/** One monotonic source so every engine client can tell its own search results from another's. */
export function nextEpoch(): number {
  counter += 1
  return counter
}
