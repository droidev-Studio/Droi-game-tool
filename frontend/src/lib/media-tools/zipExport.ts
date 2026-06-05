import JSZip from 'jszip'

export async function createZip(files: Array<{ path: string; blob: Blob | string }>): Promise<Blob> {
  const zip = new JSZip()
  files.forEach((file) => zip.file(file.path, file.blob))
  return zip.generateAsync({ type: 'blob' })
}
