const express = require("express");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false });
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (!file.mimetype.startsWith("image/")) return cb(new Error("Photo must be an image."));
    cb(null, true);
  }
});

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admins (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS visitors (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      mobile TEXT NOT NULL,
      company TEXT,
      person_to_meet TEXT NOT NULL,
      purpose TEXT NOT NULL,
      vehicle_no TEXT,
      photo BYTEA NOT NULL,
      photo_type TEXT NOT NULL,
      in_time TIMESTAMPTZ DEFAULT NOW(),
      out_time TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'IN'
    );
  `);
  const r = await pool.query("SELECT COUNT(*)::int AS count FROM admins");
  if (r.rows[0].count === 0) {
    const username = process.env.ADMIN_USERNAME || "admin";
    const password = process.env.ADMIN_PASSWORD || "ChangeMe@123";
    const hash = await bcrypt.hash(password, 12);
    await pool.query("INSERT INTO admins(username, password_hash) VALUES($1,$2)", [username, hash]);
    console.log(`Initial admin created: ${username}`);
  }
}

//function adminRequired(req, res, next) {
  //const token = req.headers["x-admin-token"];
  //if (!token || !global.adminTokens?.has(token)) return res.status(401).json({ error: "Admin login required." });
  //next();
//}
//global.adminTokens = new Set();

//global .adminTokens = new Map(); function authRequired(req, res, next) { const token = req.headers; const session = token ? global.adminTokens .get(token) : null; if (!session) { return res .status(401).json({ error: "Login required."}); req.user = session. next(); function adminRequired(req, res, next) { authRequired(req, res, () => { if (req.user.role !== "admin" && req.user.role !== "super_admin") { return res .status(403).json({ error: "Admin access required."}); next(); }); } function superAdminRequired(req, res, next) { authRequired(req, res, () => { if (req.user.role !== "super_admin") { return res .status(403).json({ error: "Super Admin access required."}); next(); });

  global.adminTokens = new Map();

function authRequired(req, res, next) {
  const token = req.headers["x-admin-token"];
  const session = token ? global.adminTokens.get(token) : null;

  if (!session) {
    return res.status(401).json({
      error: "Login required."
    });
  }

  req.user = session;
  next();
}

function adminRequired(req, res, next) {
  authRequired(req, res, () => {
    if (
      req.user.role !== "admin" &&
      req.user.role !== "super_admin"
    ) {
      return res.status(403).json({
        error: "Admin access required."
      });
    }

    next();
  });
}

function superAdminRequired(req, res, next) {
  authRequired(req, res, () => {
    if (req.user.role !== "super_admin") {
      return res.status(403).json({
        error: "Super Admin access required."
      });
    }

    next();
  });
}
//app.post("/api/admin/login", async (req, res) => {
  //try {
    //const { username, password } = req.body;
    //const r = await pool.query("SELECT * FROM admins WHERE username=$1", [username]);
    //if (!r.rows[0] || !(await bcrypt.compare(password || "", r.rows[0].password_hash))) {
      //return res.status(401).json({ error: "Invalid username or password." });
    //}
    //const token = require("crypto").randomBytes(32).toString("hex");
    //global.adminTokens.add(token);
    //res.json({ token, username: r.rows[0].username });
  //} catch (e) { res.status(500).json({ error: "Login failed." }); }
//});

app.post("/api/admin/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const r = await pool.query(
      "SELECT id, username, password_hash, role FROM admins WHERE username=$1",
      [username]
    );

    if (
      !r.rows[0] ||
      !(await bcrypt.compare(password || "", r.rows[0].password_hash))
    ) {
      return res.status(401).json({
        error: "Invalid username or password."
      });
    }

    const user = r.rows[0];

    const token = require("crypto")
      .randomBytes(32)
      .toString("hex");

    global.adminTokens.set(token, {
      id: user.id,
      username: user.username,
      role: user.role || "admin"
    });

    res.json({
      token,
      username: user.username,
      role: user.role || "admin"
    });

  } catch (e) {
    console.error("Login error:", e);
    res.status(500).json({
      error: "Login failed."
    });
  }
});     

// ===============================
// SUPER ADMIN - USER MANAGEMENT
// ===============================

app.get("/api/super-admin/users", superAdminRequired, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT id, username, role, created_at
      FROM admins
      ORDER BY created_at DESC
    `);

    res.json(r.rows);
  } catch (e) {
    console.error("Users list error:", e);
    res.status(500).json({
      error: "Could not load users."
    });
  }
});


app.post("/api/super-admin/users", superAdminRequired, async (req, res) => {
  try {
    const {
      username,
      password,
      role
    } = req.body;

    if (!username || !password || !role) {
      return res.status(400).json({
        error: "Username, password and role are required."
      });
    }

    if (!["admin", "user"].includes(role)) {
      return res.status(400).json({
        error: "Invalid role."
      });
    }

    const existing = await pool.query(
      "SELECT id FROM admins WHERE username=$1",
      [username.trim()]
    );

    if (existing.rows.length) {
      return res.status(400).json({
        error: "Username already exists."
      });
    }

    const hash = await bcrypt.hash(password, 12);

    const r = await pool.query(`
      INSERT INTO admins(username, password_hash, role)
      VALUES($1, $2, $3)
      RETURNING id, username, role, created_at
    `, [
      username.trim(),
      hash,
      role
    ]);

    res.status(201).json({
      message: "User created successfully.",
      user: r.rows[0]
    });

  } catch (e) {
    console.error("Create user error:", e);
    res.status(500).json({
      error: "Could not create user."
    });
  }
});


app.delete("/api/super-admin/users/:id", superAdminRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
      return res.status(400).json({
        error: "Invalid user ID."
      });
    }

    // Prevent Super Admin from deleting himself
    if (id === req.user.id) {
      return res.status(400).json({
        error: "You cannot delete your own account."
      });
    }

    const r = await pool.query(
      "DELETE FROM admins WHERE id=$1 RETURNING id, username",
      [id]
    );

    if (!r.rows[0]) {
      return res.status(404).json({
        error: "User not found."
      });
    }

    res.json({
      message: "User deleted successfully.",
      user: r.rows[0]
    });

  } catch (e) {
    console.error("Delete user error:", e);
    res.status(500).json({
      error: "Could not delete user."
    });
  }
});
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   
app.post("/api/admin/logout", adminRequired, (req, res) => {
  global.adminTokens.delete(req.headers["x-admin-token"]);
  res.json({ ok: true });
});

app.get("/api/my-role", authRequired, (req, res) => {
  res.json({
    id: req.user.id,
    username: req.user.username,
    role: req.user.role
  });
});

app.get("/api/dashboard", async (_, res) => {
  try {
    const counts = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status='IN')::int AS inside,
        COUNT(*) FILTER (WHERE DATE(in_time AT TIME ZONE 'Asia/Kolkata') = DATE(NOW() AT TIME ZONE 'Asia/Kolkata'))::int AS today,
        COUNT(*) FILTER (WHERE status='OUT' AND DATE(out_time AT TIME ZONE 'Asia/Kolkata') = DATE(NOW() AT TIME ZONE 'Asia/Kolkata'))::int AS checked_out
      FROM visitors
    `);
    const list = await pool.query(`
      SELECT id, name, mobile, company, person_to_meet, purpose, vehicle_no, in_time, out_time, status,
             '/api/visitors/' || id || '/photo' AS photo_url
      FROM visitors
      WHERE status='IN'
      ORDER BY in_time DESC
    `);
    res.json({ counts: counts.rows[0], inside: list.rows });
  } catch (e) { res.status(500).json({ error: "Dashboard unavailable." }); }
});

app.post("/api/visitors", upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Visitor photo is mandatory." });
    const { name, mobile, company, person_to_meet, purpose, vehicle_no } = req.body;
    if (!name || !mobile || !person_to_meet || !purpose) return res.status(400).json({ error: "Please fill all required fields." });
    const r = await pool.query(`
      INSERT INTO visitors(name,mobile,company,person_to_meet,purpose,vehicle_no,photo,photo_type)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, in_time, status
    `, [name.trim(), mobile.trim(), company?.trim() || null, person_to_meet.trim(), purpose.trim(), vehicle_no?.trim() || null, req.file.buffer, req.file.mimetype]);
    res.status(201).json({ message: "Visitor checked in successfully.", visitor: r.rows[0] });
  } catch (e) { res.status(500).json({ error: "Could not save visitor." }); }
});

app.get("/api/visitors/:id/photo", async (req, res) => {
  try {
    const r = await pool.query("SELECT photo, photo_type FROM visitors WHERE id=$1", [req.params.id]);
    if (!r.rows[0]) return res.status(404).end();
    res.set("Content-Type", r.rows[0].photo_type);
    res.end(r.rows[0].photo);
  } catch (e) { res.status(500).end(); }
});

app.post("/api/visitors/:id/out", adminRequired, async (req, res) => {
  try {
    const r = await pool.query(`
      UPDATE visitors SET status='OUT', out_time=NOW()
      WHERE id=$1 AND status='IN'
      RETURNING id, out_time
    `, [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: "Visitor is already checked out or not found." });
    res.json({ message: "Visitor checked out.", visitor: r.rows[0] });
  } catch (e) { res.status(500).json({ error: "Could not check out visitor." }); }
});

app.get("/api/admin/visitors", adminRequired, async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const date = String(req.query.date || "").trim();
    const params = [];
    const where = [];
    if (q) {
      params.push(`%${q}%`);
      where.push(`(name ILIKE $${params.length} OR mobile ILIKE $${params.length} OR company ILIKE $${params.length} OR person_to_meet ILIKE $${params.length})`);
    }
    if (date) {
      params.push(date);
      where.push(`DATE(in_time AT TIME ZONE 'Asia/Kolkata') = $${params.length}::date`);
    }
    const sql = `
      SELECT id,name,mobile,company,person_to_meet,purpose,vehicle_no,in_time,out_time,status,
             '/api/visitors/' || id || '/photo' AS photo_url
      FROM visitors ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY in_time DESC LIMIT 500
    `;
    const r = await pool.query(sql, params);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: "History unavailable." }); }
});

app.get("/api/admin/export.csv", adminRequired, async (_, res) => {
  const r = await pool.query(`SELECT id,name,mobile,company,person_to_meet,purpose,vehicle_no,in_time,out_time,status FROM visitors ORDER BY in_time DESC`);
  const esc = v => `"${String(v ?? "").replaceAll('"','""')}"`;
  const csv = [
    "ID,Name,Mobile,Company,Person To Meet,Purpose,Vehicle No,IN Time,OUT Time,Status",
    ...r.rows.map(x => [x.id,x.name,x.mobile,x.company,x.person_to_meet,x.purpose,x.vehicle_no,x.in_time,x.out_time,x.status].map(esc).join(","))
  ].join("\n");
  res.setHeader("Content-Type","text/csv");
  res.setHeader("Content-Disposition",'attachment; filename="sap-semi-visitors.csv"');
  res.send(csv);
});

app.get("/{*splat}", (_, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

initDb().then(() => app.listen(PORT, () => console.log(`SAP Semi Visitor System running on ${PORT}`)))
  .catch(err => { console.error(err); process.exit(1); });

process.on("SIGTERM", async () => { await pool.end(); process.exit(0); });
