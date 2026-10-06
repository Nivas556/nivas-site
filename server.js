// Nivas Mission Control — Express + Socket.IO, JSON-file persistence, password login.
const express = require("express"), http = require("http"), { Server } = require("socket.io");
const multer = require("multer"), fs = require("fs"), path = require("path"), crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const PASS = process.env.APP_PASSWORD || "changeme";
const DATA = process.env.DATA_DIR || path.join(__dirname, "data");
const UP = path.join(DATA, "uploads");
fs.mkdirSync(UP, { recursive: true });
if (PASS === "changeme") console.warn("⚠  Set APP_PASSWORD before exposing this site to the internet!");

const sha = s => crypto.createHash("sha256").update(String(s)).digest();
const SECRET = process.env.SESSION_SECRET || sha(PASS + "|nivas").toString("hex");
const TOKEN = crypto.createHmac("sha256", SECRET).update("nivas-session").digest("hex");
const eq = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const cookieOf = h => ((h || "").split(";").map(s => s.trim()).find(s => s.startsWith("nv=")) || "").slice(3);
const authed = h => { const c = cookieOf(h); return !!c && eq(c, TOKEN); };

// ---- storage ----
const DBF = path.join(DATA, "db.json");
let db = { logs: [], exp: [], notes: [], topics: [], cfg: {} };
try { db = { ...db, ...JSON.parse(fs.readFileSync(DBF, "utf8")) }; } catch {}
let timer;
const save = () => { clearTimeout(timer); timer = setTimeout(() =>
  fs.writeFile(DBF + ".tmp", JSON.stringify(db), e => { if (!e) fs.rename(DBF + ".tmp", DBF, () => {}); }), 200); };

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "20kb" }));

// ---- login (rate limited) ----
const tries = new Map();
app.post("/api/login", (req, res) => {
  const ip = req.ip, now = Date.now();
  const t = (tries.get(ip) || []).filter(x => now - x < 15 * 60e3);
  if (t.length >= 10) return res.status(429).end();
  const ok = eq(sha(req.body && req.body.password || "").toString("hex"), sha(PASS).toString("hex"));
  if (!ok) { t.push(now); tries.set(ip, t); return res.status(401).end(); }
  const secure = req.secure ? "; Secure" : "";
  res.setHeader("Set-Cookie", `nv=${TOKEN}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000${secure}`);
  res.json({ ok: true });
});
const guard = (req, res, next) => authed(req.headers.cookie) ? next() : res.status(401).end();
app.get("/api/me", guard, (req, res) => res.json({ ok: true }));

// ---- file uploads (PDF / images / text) ----
const ALLOWED = [".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".txt", ".md"];
const upload = multer({
  limits: { fileSize: 25 * 1024 * 1024 },
  storage: multer.diskStorage({
    destination: UP,
    filename: (req, f, cb) => cb(null, crypto.randomBytes(8).toString("hex") + path.extname(f.originalname).toLowerCase())
  }),
  fileFilter: (req, f, cb) => cb(null, ALLOWED.includes(path.extname(f.originalname).toLowerCase()))
});
app.post("/upload", guard, (req, res) => upload.single("file")(req, res, err => {
  if (err || !req.file) return res.status(400).json({ error: "upload failed or type not allowed" });
  res.json({ id: req.file.filename, name: req.file.originalname });
}));
app.get("/files/:id", guard, (req, res) => {
  if (!/^[a-f0-9]{16}\.[a-z]{2,4}$/.test(req.params.id)) return res.status(404).end();
  res.setHeader("X-Content-Type-Options", "nosniff");
  const inline = /\.(pdf|png|jpe?g|gif|webp)$/.test(req.params.id);
  if (!inline) res.setHeader("Content-Disposition", "attachment");
  res.sendFile(path.join(UP, req.params.id), e => { if (e && !res.headersSent) res.status(404).end(); });
});

app.use(express.static(path.join(__dirname, "public")));

// ---- real-time ----
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e5 });
io.use((s, next) => authed(s.handshake.headers.cookie) ? next() : next(new Error("unauthorized")));
const COLS = ["logs", "exp", "notes", "topics"];
const clean = o => (o && typeof o === "object" && !Array.isArray(o) && JSON.stringify(o).length < 40000) ? (({ id, ...r }) => r)(o) : null;
const push = () => { save(); io.emit("state", db); };
io.on("connection", sock => {
  sock.emit("state", db);
  sock.on("add", (n, o) => { o = clean(o); if (!COLS.includes(n) || !o) return;
    db[n].push({ id: crypto.randomBytes(6).toString("hex"), ...o }); push(); });
  sock.on("upd", (n, id, o) => { o = clean(o); if (!COLS.includes(n) || !o) return;
    const i = db[n].findIndex(x => x.id === id); if (i < 0) return; db[n][i] = { ...db[n][i], ...o }; push(); });
  sock.on("del", (n, id) => { if (!COLS.includes(n)) return; db[n] = db[n].filter(x => x.id !== id); push(); });
  sock.on("cfg", p => { p = clean(p); if (!p) return; db.cfg = { ...db.cfg, ...p }; push(); });
});
server.listen(PORT, () => console.log(`Nivas Mission Control running on http://localhost:${PORT}`));
