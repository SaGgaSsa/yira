const IMAGE_FILE_MIME_TYPES = {
  avif: 'image/avif',
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
} as const

export type ImageFileMimeType = (typeof IMAGE_FILE_MIME_TYPES)[keyof typeof IMAGE_FILE_MIME_TYPES]

export function getImageFileMimeType(filePath: string): ImageFileMimeType | null {
  const basename = filePath.trim().split(/[\\/]/).at(-1) ?? ''
  const dotIndex = basename.lastIndexOf('.')
  if (dotIndex < 0 || dotIndex === basename.length - 1) return null
  const extension = basename.slice(dotIndex + 1).toLowerCase()
  if (!Object.prototype.hasOwnProperty.call(IMAGE_FILE_MIME_TYPES, extension)) return null
  return IMAGE_FILE_MIME_TYPES[extension as keyof typeof IMAGE_FILE_MIME_TYPES] ?? null
}

export function isImageFilePath(filePath: string): boolean {
  return getImageFileMimeType(filePath) !== null
}
