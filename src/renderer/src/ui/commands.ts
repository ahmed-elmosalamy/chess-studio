export type CommandItem = {
  id: string
  label: string
  hint?: string
  group: string
  keys?: string
  run: () => void
}

type Searchable = Pick<CommandItem, 'label' | 'group'>

export function filterCommands<T extends Searchable>(items: T[], query: string): T[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return items
  return items.filter((item) => item.label.toLowerCase().includes(needle) || item.group.toLowerCase().includes(needle))
}

export function stepSelection(index: number, delta: number, length: number): number {
  if (length <= 0) return 0
  return ((index + delta) % length + length) % length
}
