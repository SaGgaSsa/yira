import { getImageFileMimeType, isImageFilePath } from './fileImage'

const supported = {
  'image.PNG': 'image/png',
  'photo.jpg': 'image/jpeg',
  'photo.JPEG': 'image/jpeg',
  'animation.gif': 'image/gif',
  'modern.webp': 'image/webp',
  'modern.avif': 'image/avif',
} as const

for (const [filePath, mimeType] of Object.entries(supported)) {
  if (!isImageFilePath(filePath) || getImageFileMimeType(filePath) !== mimeType) {
    throw new Error(`${filePath} must resolve to ${mimeType}`)
  }
}

for (const filePath of [
  'README.md',
  'photo.png.txt',
  'photo.svg',
  'png',
  'constructor',
  'x.constructor',
  'folder.with.dot/photo',
  '',
  '  image.webp  ',
]) {
  const expected = filePath.trim() === 'image.webp'
  if (isImageFilePath(filePath) !== expected) {
    throw new Error(`${filePath || '<empty>'} has an unexpected image classification`)
  }
}

for (const filePath of [
  'folder.with.dot/photo.PNG',
  'folder\\with\\dot\\photo.jpeg',
  'folder/mixed\\separators/photo.webp',
]) {
  if (!isImageFilePath(filePath)) throw new Error(`${filePath} must be recognized as an image path`)
}
