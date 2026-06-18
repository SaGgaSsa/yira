import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const outDir = 'resources'
const icoSizes = [16, 32, 48, 64, 128, 256]

const colors = {
  bg: [16, 20, 24, 255],
  fg: [244, 247, 248, 255],
  blue: [93, 168, 255, 255],
  amber: [255, 178, 63, 255],
}

function createCanvas(size) {
  return {
    size,
    scale: size / 512,
    data: new Uint8Array(size * size * 4),
  }
}

function setPixel(canvas, x, y, color) {
  if (x < 0 || y < 0 || x >= canvas.size || y >= canvas.size) return
  const index = (Math.floor(y) * canvas.size + Math.floor(x)) * 4
  const alpha = color[3] / 255
  const invAlpha = 1 - alpha
  canvas.data[index] = Math.round(color[0] * alpha + canvas.data[index] * invAlpha)
  canvas.data[index + 1] = Math.round(color[1] * alpha + canvas.data[index + 1] * invAlpha)
  canvas.data[index + 2] = Math.round(color[2] * alpha + canvas.data[index + 2] * invAlpha)
  canvas.data[index + 3] = Math.round(color[3] + canvas.data[index + 3] * invAlpha)
}

function drawShape(canvas, predicate, color) {
  const size = canvas.size
  const samples = size >= 128 ? 3 : 4
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let hits = 0
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const px = (x + (sx + 0.5) / samples) / canvas.scale
          const py = (y + (sy + 0.5) / samples) / canvas.scale
          if (predicate(px, py)) hits += 1
        }
      }
      if (hits > 0) {
        setPixel(canvas, x, y, [color[0], color[1], color[2], Math.round(color[3] * hits / (samples * samples))])
      }
    }
  }
}

function roundedRect(x, y, width, height, radius) {
  return (px, py) => {
    const cx = Math.max(x + radius, Math.min(px, x + width - radius))
    const cy = Math.max(y + radius, Math.min(py, y + height - radius))
    const dx = px - cx
    const dy = py - cy
    return dx * dx + dy * dy <= radius * radius
  }
}

function circle(cx, cy, radius) {
  return (px, py) => {
    const dx = px - cx
    const dy = py - cy
    return dx * dx + dy * dy <= radius * radius
  }
}

function capsule(x1, y1, x2, y2, width) {
  const radius = width / 2
  const vx = x2 - x1
  const vy = y2 - y1
  const len2 = vx * vx + vy * vy
  return (px, py) => {
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * vx + (py - y1) * vy) / len2))
    const cx = x1 + vx * t
    const cy = y1 + vy * t
    const dx = px - cx
    const dy = py - cy
    return dx * dx + dy * dy <= radius * radius
  }
}

function polygon(points) {
  return (px, py) => {
    let inside = false
    for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
      const [xi, yi] = points[i]
      const [xj, yj] = points[j]
      const intersects = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
      if (intersects) inside = !inside
    }
    return inside
  }
}

function union(...predicates) {
  return (px, py) => predicates.some((predicate) => predicate(px, py))
}

function renderIcon(size) {
  const canvas = createCanvas(size)

  drawShape(canvas, roundedRect(0, 0, 512, 512, 112), colors.bg)
  drawShape(canvas, circle(278, 122, 36), colors.fg)
  drawShape(
    canvas,
    union(
      polygon([
        [244, 178],
        [288, 178],
        [324, 202],
        [356, 272],
        [323, 310],
        [285, 310],
        [228, 408],
        [210, 419],
        [191, 408],
        [191, 386],
        [234, 310],
        [203, 310],
        [181, 300],
        [179, 276],
        [218, 196],
      ]),
      capsule(305, 199, 348, 241, 42),
      capsule(329, 241, 371, 241, 42),
    ),
    colors.fg,
  )
  drawShape(canvas, roundedRect(306, 222, 112, 76, 14), colors.blue)
  drawShape(canvas, roundedRect(326, 242, 72, 28, 6), colors.bg)
  drawShape(canvas, capsule(160, 418, 236, 418, 18), colors.amber)
  drawShape(canvas, capsule(330, 418, 410, 418, 18), colors.amber)

  return canvas.data
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let i = 0; i < 8; i += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0)
  return Buffer.concat([length, typeBuffer, data, crc])
}

function png(size) {
  const rgba = renderIcon(size)
  const rows = []
  for (let y = 0; y < size; y += 1) {
    const start = y * size * 4
    rows.push(Buffer.from([0]), Buffer.from(rgba.subarray(start, start + size * 4)))
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function ico(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)

  const entries = []
  let offset = 6 + images.length * 16
  for (const image of images) {
    const entry = Buffer.alloc(16)
    entry[0] = image.size === 256 ? 0 : image.size
    entry[1] = image.size === 256 ? 0 : image.size
    entry[2] = 0
    entry[3] = 0
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(image.buffer.length, 8)
    entry.writeUInt32LE(offset, 12)
    entries.push(entry)
    offset += image.buffer.length
  }

  return Buffer.concat([header, ...entries, ...images.map((image) => image.buffer)])
}

const iconPng = png(512)
const iconIco = ico(icoSizes.map((size) => ({ size, buffer: png(size) })))

writeFileSync(join(outDir, 'icon.png'), iconPng)
writeFileSync(join(outDir, 'icon.ico'), iconIco)

console.log(`Generated ${join(outDir, 'icon.png')} and ${join(outDir, 'icon.ico')}`)
