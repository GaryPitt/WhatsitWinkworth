require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// ── SQLite setup ──
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "winkworth.db");

// Ensure data directory exists
const fs = require("fs");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// Create table if not exists
db.exec(`
  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    streak INTEGER NOT NULL DEFAULT 3,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

// Prepared statements for performance
const insertStmt = db.prepare(
  "INSERT INTO submissions (name, email, phone, streak) VALUES (?, ?, ?, ?)",
);
const getAllStmt = db.prepare(
  "SELECT * FROM submissions ORDER BY created_at DESC",
);
const getAllAscStmt = db.prepare(
  "SELECT * FROM submissions ORDER BY created_at ASC",
);

// ── Basic auth helper ──
function basicAuth(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Basic ")) return false;
  const [user, pass] = Buffer.from(header.split(" ")[1], "base64")
    .toString()
    .split(":");
  return user === process.env.ADMIN_USER && pass === process.env.ADMIN_PASS;
}

// ── Health check ──
app.get("/api/health", (_req, res) => {
  try {
    const row = db.prepare("SELECT datetime('now') as now").get();
    res.json({ status: "ok", time: row.now });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ── Submit a registration ──
app.post("/api/submissions", (req, res) => {
  const { name, email, phone, streak } = req.body;

  if (!name || !name.trim() || name.trim().length < 2) {
    return res
      .status(400)
      .json({ error: "Name is required (min 2 characters)" });
  }

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!email || !emailRe.test(email.trim())) {
    return res.status(400).json({ error: "A valid email address is required" });
  }

  if (phone && phone.trim()) {
    const digits = phone.replace(/[\s\-()]/g, "");
    if (!/^\+?\d{7,15}$/.test(digits)) {
      return res
        .status(400)
        .json({ error: "Phone number must be at least 7 digits" });
    }
  }

  try {
    const info = insertStmt.run(
      name.trim(),
      email.trim().toLowerCase(),
      phone ? phone.trim() : null,
      streak || 3,
    );
    const row = db
      .prepare("SELECT * FROM submissions WHERE id = ?")
      .get(info.lastInsertRowid);
    res.status(201).json(row);
  } catch (err) {
    console.error("Insert error:", err);
    res.status(500).json({ error: "Failed to save submission" });
  }
});

// ── Admin: list submissions (JSON) ──
app.get("/api/submissions", (req, res) => {
  if (!basicAuth(req)) {
    res.set("WWW-Authenticate", 'Basic realm="Admin"');
    return res.status(401).send("Unauthorized");
  }
  try {
    res.json(getAllStmt.all());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: download CSV ──
app.get("/api/submissions/csv", (req, res) => {
  if (!basicAuth(req)) {
    res.set("WWW-Authenticate", 'Basic realm="Admin"');
    return res.status(401).send("Unauthorized");
  }
  try {
    const rows = getAllAscStmt.all();
    const header = "id,name,email,phone,streak,created_at";
    const csvRows = rows.map((r) =>
      [
        r.id,
        csvEscape(r.name),
        csvEscape(r.email),
        csvEscape(r.phone || ""),
        r.streak,
        r.created_at,
      ].join(","),
    );
    const date = new Date().toISOString().split("T")[0];
    res.set("Content-Type", "text/csv");
    res.set(
      "Content-Disposition",
      `attachment; filename="winkworth-submissions-${date}.csv"`,
    );
    res.send([header, ...csvRows].join("\n"));
  } catch (err) {
    res.status(500).send(err.message);
  }
});

function csvEscape(val) {
  if (/[,"\n]/.test(val)) return '"' + val.replace(/"/g, '""') + '"';
  return val;
}

app.listen(PORT, () => {
  console.log(`Winkworth API running on http://localhost:${PORT}`);
  console.log(`SQLite DB at ${DB_PATH}`);
});
