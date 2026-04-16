const path = require("path");
const fs = require("fs");
const express = require("express");
const compression = require("compression");
const multer = require("multer");
const ROOT = __dirname;
// Load .env next to this server file (instead of relying on process.cwd()).
require("dotenv").config({ path: path.join(ROOT, ".env") });
const DATA_ROOT = path.resolve(process.env.DATA_ROOT || ROOT);
const DATA_DIR = path.join(DATA_ROOT, "data");
const UPLOADS_DIR = path.join(DATA_ROOT, "uploads");
const SHOWS_FILE = path.join(DATA_DIR, "shows.json");
const DEFAULT_SHOWS_FILE = path.join(ROOT, "data", "default-shows.json");

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function readDefaultShowsPayload() {
  const raw = fs.readFileSync(DEFAULT_SHOWS_FILE, "utf8");
  const data = JSON.parse(raw);
  if (!data || !Array.isArray(data.shows) || !data.shows.length) {
    throw new Error("Invalid data/default-shows.json");
  }
  return data;
}

function clonePayload(data) {
  return JSON.parse(JSON.stringify(data));
}

function readShows() {
  ensureDirs();
  if (!fs.existsSync(SHOWS_FILE)) {
    const data = readDefaultShowsPayload();
    writeShows(data);
    return clonePayload(data);
  }
  const raw = fs.readFileSync(SHOWS_FILE, "utf8");
  try {
    return JSON.parse(raw);
  } catch {
    const data = readDefaultShowsPayload();
    writeShows(data);
    return clonePayload(data);
  }
}

function writeShows(payload) {
  ensureDirs();
  fs.writeFileSync(SHOWS_FILE, JSON.stringify(payload, null, 2), "utf8");
}

function safeImageUrl(u) {
  const s = String(u || "").trim();
  if (!s || s.length > 2048) return "";
  if (s.startsWith("//")) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("/")) return s;
  return "";
}

function sanitizeCardColor(raw) {
  const s = String(raw ?? "").trim();
  if (!s || s.length > 80) return "";
  if (/[;<>{}]|url\(|expression|@import/i.test(s)) return "";
  return s;
}

function sanitizeCaption(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (s.length > 500) return s.slice(0, 500);
  return s;
}

function sanitizeFilename(name) {
  const base = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
  return base || "file";
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureDirs();
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const safe = sanitizeFilename(file.originalname);
    cb(null, `${Date.now()}-${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported type: ${file.mimetype}`));
    }
  },
});

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3333;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const DEV_ADMIN_ORIGIN = "http://localhost:3333";

app.use(compression());
app.use((req, res, next) => {
  const origin = req.headers.origin || "";
  if (origin === DEV_ADMIN_ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS");
  }
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

function requireAdmin(req, res, next) {
  if (!ADMIN_TOKEN) {
    return res.status(503).json({
      error: "Server missing ADMIN_TOKEN in .env — set it to enable admin saves and uploads.",
    });
  }
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

app.use(express.json({ limit: "2mb" }));

app.get("/api/shows", (_req, res) => {
  try {
    const data = readShows();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/admin/check", requireAdmin, (_req, res) => {
  res.json({ ok: true });
});

app.put("/api/shows", requireAdmin, (req, res) => {
  try {
    const body = req.body;
    if (!body || typeof body !== "object" || !Array.isArray(body.shows)) {
      return res.status(400).json({ error: "Body must be { shows: [...] }" });
    }
    const shows = body.shows;
    for (const s of shows) {
      if (!s || typeof s !== "object") {
        return res.status(400).json({ error: "Invalid show entry" });
      }
      if (!s.id || typeof s.id !== "string") {
        return res.status(400).json({ error: "Each show needs a string id" });
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(s.id)) {
        return res.status(400).json({ error: `Invalid id: ${s.id}` });
      }
      s.label = String(s.label ?? "");
      s.title = String(s.title ?? "");
      s.text = String(s.text ?? "");
      let images = [];
      if (Array.isArray(s.images)) {
        images = s.images.map((x) => safeImageUrl(String(x))).filter(Boolean);
      }
      if (!images.length) {
        const one = safeImageUrl(s.image);
        if (one) images = [one];
      }
      images = images.slice(0, 40);
      s.images = images;
      let imageCaptions = [];
      if (Array.isArray(s.imageCaptions)) {
        imageCaptions = s.imageCaptions.map((x) => sanitizeCaption(x));
      }
      if (imageCaptions.length < images.length) {
        while (imageCaptions.length < images.length) imageCaptions.push("");
      } else if (imageCaptions.length > images.length) {
        imageCaptions = imageCaptions.slice(0, images.length);
      }
      s.imageCaptions = imageCaptions;
      s.image = images[0] || "";
      s.cardColor = sanitizeCardColor(s.cardColor);
      const allowedSymbols = new Set(["music", "bwSerif", "bwBrush", "bc", "custom"]);
      const sym = String(s.symbol ?? "music");
      s.symbol = allowedSymbols.has(sym) ? sym : "music";
      s.symbolAsset = String(s.symbolAsset ?? "");
    }
    const ids = new Set();
    for (const s of shows) {
      if (ids.has(s.id)) {
        return res.status(400).json({ error: `Duplicate id: ${s.id}` });
      }
      ids.add(s.id);
    }
    writeShows({ shows });
    res.json({ ok: true, shows });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/upload", requireAdmin, upload.single("file"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file" });
    }
    const url = `/uploads/${req.file.filename}`;
    res.json({
      url,
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

function staticCacheHeaders(res, filePath) {
  const rel = path.relative(ROOT, filePath).replace(/\\/g, "/");
  if (rel.endsWith(".css") || rel.endsWith(".js")) {
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  } else if (rel === "data/default-shows.json") {
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=86400");
  } else if (rel.endsWith(".html")) {
    res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
  }
}

app.use(
  express.static(ROOT, {
    index: ["index.html"],
    extensions: ["html"],
    setHeaders: staticCacheHeaders,
  }),
);

app.use(
  "/uploads",
  express.static(UPLOADS_DIR, {
    setHeaders(res) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    },
  }),
);

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "File too large" });
    }
  }
  const msg = err && err.message ? err.message : "Error";
  res.status(400).json({ error: msg });
});

ensureDirs();

app.listen(PORT, () => {
  console.log(`Gallery running at http://localhost:${PORT}`);
  console.log(`Persistent data root: ${DATA_ROOT}`);
  if (!ADMIN_TOKEN) {
    console.warn("Warning: ADMIN_TOKEN not set. Set it in .env to use the admin portal.");
  }
});
