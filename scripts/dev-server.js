// Zero-dependency local dev server.
//
// This emulates the parts of `vercel dev` that this project relies on so the
// app can be run locally without a Vercel account:
//   - Serves static assets using the rewrites defined in vercel.json
//     (/css, /js, /data, /images) with an SPA-style fallback to src/index.html
//   - Routes /api/* requests to the serverless function handlers in api/*.js,
//     invoking their default export with lightweight req/res shims that mirror
//     the Vercel Node runtime (req.query, req.body, res.status().json(), etc.)
//
// Usage: node scripts/dev-server.js [--port 3000]
//
// Note: Some API routes (teams, schedule, and games without static data) call
// the live ESPN API and therefore require outbound network access.

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const portArgIndex = process.argv.indexOf('--port');
const PORT = portArgIndex !== -1 ? Number(process.argv[portArgIndex + 1]) : Number(process.env.PORT) || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

// Mirrors the static rewrites from vercel.json, then falls back to serving any
// real file from the project root (Vercel's outputDirectory is ".", so files
// like /shared/algorithm-config.js are served directly before the catch-all).
function resolveStaticPath(pathname) {
  if (pathname.startsWith('/css/')) return path.join(ROOT, 'src', pathname);
  if (pathname.startsWith('/js/')) return path.join(ROOT, 'src', pathname);
  if (pathname.startsWith('/data/')) return path.join(ROOT, 'public', pathname);
  if (pathname.startsWith('/images/')) return path.join(ROOT, 'public', pathname);
  if (pathname === '/' || pathname === '/index.html') return path.join(ROOT, 'src', 'index.html');

  // Serve real files that live at the repo root (e.g. /shared/*), while
  // guarding against path traversal outside ROOT.
  const candidate = path.normalize(path.join(ROOT, pathname));
  if (candidate.startsWith(ROOT + path.sep)) return candidate;
  return null;
}

function contentTypeFor(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

async function serveFile(res, filePath) {
  const data = await readFile(filePath);
  res.writeHead(200, { 'Content-Type': contentTypeFor(filePath) });
  res.end(data);
}

// Builds an Express/Vercel-like res shim on top of the raw Node response.
function buildResShim(nodeRes) {
  const res = {
    statusCode: 200,
    setHeader: (k, v) => nodeRes.setHeader(k, v),
    getHeader: (k) => nodeRes.getHeader(k),
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(obj) {
      if (!nodeRes.getHeader('Content-Type')) {
        nodeRes.setHeader('Content-Type', 'application/json; charset=utf-8');
      }
      nodeRes.writeHead(this.statusCode);
      nodeRes.end(JSON.stringify(obj));
      return this;
    },
    send(body) {
      nodeRes.writeHead(this.statusCode);
      nodeRes.end(body);
      return this;
    },
    end(body) {
      nodeRes.writeHead(this.statusCode);
      nodeRes.end(body);
      return this;
    }
  };
  return res;
}

function readBody(nodeReq) {
  return new Promise((resolve) => {
    const chunks = [];
    nodeReq.on('data', (c) => chunks.push(c));
    nodeReq.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(raw);
      }
    });
    nodeReq.on('error', () => resolve({}));
  });
}

async function handleApi(nodeReq, nodeRes, url) {
  const name = url.pathname.replace(/^\/api\//, '').replace(/\/$/, '');
  const handlerPath = path.join(ROOT, 'api', `${name}.js`);

  try {
    await stat(handlerPath);
  } catch {
    nodeRes.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    nodeRes.end(JSON.stringify({ success: false, error: `No API route: /api/${name}` }));
    return;
  }

  let mod;
  try {
    mod = await import(pathToFileURL(handlerPath).href);
  } catch (err) {
    nodeRes.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    nodeRes.end(JSON.stringify({ success: false, error: 'Failed to load handler', details: err.message }));
    return;
  }

  const query = Object.fromEntries(url.searchParams.entries());
  const body = nodeReq.method === 'GET' || nodeReq.method === 'HEAD' ? {} : await readBody(nodeReq);

  const req = {
    method: nodeReq.method,
    url: nodeReq.url,
    headers: nodeReq.headers,
    query,
    body,
    cookies: {}
  };

  const res = buildResShim(nodeRes);

  try {
    await mod.default(req, res);
  } catch (err) {
    if (!nodeRes.headersSent) {
      nodeRes.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      nodeRes.end(JSON.stringify({ success: false, error: 'Handler threw', details: err.message }));
    }
  }
}

const server = http.createServer(async (nodeReq, nodeRes) => {
  const url = new URL(nodeReq.url, `http://localhost:${PORT}`);
  const started = Date.now();

  nodeRes.on('finish', () => {
    console.log(`${nodeReq.method} ${url.pathname} -> ${nodeRes.statusCode} (${Date.now() - started}ms)`);
  });

  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(nodeReq, nodeRes, url);
      return;
    }

    // Vercel Web Analytics is injected by Vercel's edge in production and does
    // not exist locally; return a harmless no-op so the console stays clean.
    if (url.pathname.startsWith('/_vercel/')) {
      nodeRes.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      nodeRes.end('/* vercel analytics no-op (local dev) */');
      return;
    }

    const staticPath = resolveStaticPath(url.pathname);
    if (staticPath) {
      try {
        await serveFile(nodeRes, staticPath);
        return;
      } catch {
        // fall through to SPA fallback
      }
    }

    // SPA fallback -> src/index.html (mirrors the catch-all rewrite)
    await serveFile(nodeRes, path.join(ROOT, 'src', 'index.html'));
  } catch (err) {
    nodeRes.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    nodeRes.end(`Server error: ${err.message}`);
  }
});

server.listen(PORT, () => {
  console.log(`\n  Game Entertainment Index — local dev server`);
  console.log(`  ➜  http://localhost:${PORT}\n`);
  console.log(`  Static data is served from public/data. API routes that need`);
  console.log(`  live ESPN data require outbound network access.\n`);
});
