export function compareNamesNatural(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

export function sortFilesNatural(files: File[]): File[] {
  return [...files].sort((a, b) => compareNamesNatural(a.name, b.name))
}

export function frameFileName(index: number): string {
  return `frame_${String(index + 1).padStart(3, '0')}.png`
}
