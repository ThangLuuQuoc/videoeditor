// Static file server with HTTP Range support (like S3), for render tests.
// Usage: node serve.mjs <dir> [port=8791]
import { createReadStream, statSync } from "node:fs"
import { createServer } from "node:http"
import { extname, join, normalize } from "node:path"

const [dir = ".", port = "8791"] = process.argv.slice(2)
const types = { ".mp4": "video/mp4", ".wav": "audio/wav", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml" }

createServer((req, res) => {
  const path = normalize(join(dir, decodeURIComponent(new URL(req.url, "http://x").pathname)))
  if (!path.startsWith(normalize(dir))) return res.writeHead(403).end()
  let size
  try {
    size = statSync(path).size
  } catch {
    return res.writeHead(404).end()
  }
  const headers = { "Accept-Ranges": "bytes", "Content-Type": types[extname(path)] ?? "application/octet-stream" }
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "")
  if (!range) {
    res.writeHead(200, { ...headers, "Content-Length": size })
    return createReadStream(path).pipe(res)
  }
  const start = range[1] ? Number(range[1]) : size - Number(range[2])
  const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
  if (start > end || start >= size) {
    return res.writeHead(416, { "Content-Range": `bytes */${size}` }).end()
  }
  res.writeHead(206, { ...headers, "Content-Length": end - start + 1, "Content-Range": `bytes ${start}-${end}/${size}` })
  createReadStream(path, { start, end }).pipe(res)
}).listen(Number(port), "127.0.0.1", () => console.log(`serving ${dir} on http://127.0.0.1:${port} (ranges)`))
