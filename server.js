const express = require("express");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");
const crypto = require("crypto");
const path = require("path");
const ExcelJS = require("exceljs");

const app = express();
const PORT = process.env.PORT || 10000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 10
  },
  fileFilter: (_, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/gif"];

    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPG, PNG and GIF image files are allowed."));
    }
  }
});

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));
app.use(express.static(path.join(__dirname, "public")));

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

async function initDb() {

  await pool.query(`
    CREATE TABLE IF NOT EXISTS admins (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE admins
    ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'admin'
  `);

  await pool.query(`
    UPDATE admins
    SET role='admin'
    WHERE role IS NULL
  `);

  await pool.query(`
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

      status TEXT NOT NULL DEFAULT 'IN',

      created_by INTEGER,
      created_by_username TEXT,
      created_by_role TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),

      checked_out_by INTEGER,
      checked_out_by_username TEXT,
      checked_out_by_role TEXT,
      checked_out_at TIMESTAMPTZ
    )
  `);

  await pool.query(`
    ALTER TABLE visitors
    ADD COLUMN IF NOT EXISTS created_by INTEGER
  `);

  await pool.query(`
    ALTER TABLE visitors
    ADD COLUMN IF NOT EXISTS created_by_username TEXT
  `);

  await pool.query(`
    ALTER TABLE visitors
    ADD COLUMN IF NOT EXISTS created_by_role TEXT
  `);

  await pool.query(`
    ALTER TABLE visitors
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()
  `);

  await pool.query(`
    ALTER TABLE visitors
    ADD COLUMN IF NOT EXISTS checked_out_by INTEGER
  `);

  await pool.query(`
    ALTER TABLE visitors
    ADD COLUMN IF NOT EXISTS checked_out_by_username TEXT
  `);

  await pool.query(`
    ALTER TABLE visitors
    ADD COLUMN IF NOT EXISTS checked_out_by_role TEXT
  `);

  await pool.query(`
    ALTER TABLE visitors
    ADD COLUMN IF NOT EXISTS checked_out_at TIMESTAMPTZ
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS visitor_photos (
      id SERIAL PRIMARY KEY,
      visitor_id INTEGER NOT NULL
        REFERENCES visitors(id)
        ON DELETE CASCADE,

      photo BYTEA NOT NULL,
      photo_type TEXT NOT NULL,
      photo_label TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const count = await pool.query(`
    SELECT COUNT(*)::int AS count
    FROM admins
  `);

  if (count.rows[0].count === 0) {

    const username =
      process.env.ADMIN_USERNAME || "admin";

    const password =
      process.env.ADMIN_PASSWORD || "ChangeMe@123";

    const hash =
      await bcrypt.hash(password, 12);

    await pool.query(`
      INSERT INTO admins
      (username,password_hash,role)
      VALUES($1,$2,'super_admin')
    `, [username, hash]);

    console.log(
      `Initial Super Admin created: ${username}`
    );
  }

  console.log("Database initialization completed.");
}


/* =========================
   LOGIN
========================= */

app.post("/api/admin/login", async (req, res) => {

  try {

    const username =
      String(req.body.username || "").trim();

    const password =
      String(req.body.password || "");

    const r = await pool.query(`
      SELECT
        id,
        username,
        password_hash,
        role
      FROM admins
      WHERE username=$1
    `, [username]);

    if (
      !r.rows[0] ||
      !(await bcrypt.compare(
        password,
        r.rows[0].password_hash
      ))
    ) {
      return res.status(401).json({
        error: "Invalid username or password."
      });
    }

    const u = r.rows[0];

    const token =
      crypto.randomBytes(32).toString("hex");

    global.adminTokens.set(token, {
      id: u.id,
      username: u.username,
      role: u.role || "admin"
    });

    res.json({
      token,
      user_id: u.id,
      username: u.username,
      role: u.role || "admin"
    });

  } catch (e) {

    console.error(e);

    res.status(500).json({
      error: "Login failed."
    });
  }
});


/* =========================
   LOGOUT
========================= */

app.post("/api/admin/logout", authRequired, (req, res) => {

  global.adminTokens.delete(
    req.headers["x-admin-token"]
  );

  res.json({
    ok: true
  });
});


/* =========================
   CURRENT USER
========================= */

app.get("/api/my-role", authRequired, (req, res) => {

  res.json(req.user);

});


/* =========================
   SUPER ADMIN USERS
========================= */

app.get(
  "/api/super-admin/users",
  superAdminRequired,
  async (_, res) => {

    try {

      const r = await pool.query(`
        SELECT
          id,
          username,
          role,
          created_at
        FROM admins
        ORDER BY created_at DESC
      `);

      res.json(r.rows);

    } catch (e) {

      console.error(e);

      res.status(500).json({
        error: "Could not load users."
      });
    }
  }
);


app.post(
  "/api/super-admin/users",
  superAdminRequired,
  async (req, res) => {

    try {

      const username =
        String(req.body.username || "").trim();

      const password =
        String(req.body.password || "");

      const role =
        String(req.body.role || "").trim();

      if (
        !username ||
        password.length < 6 ||
        !["admin", "user"].includes(role)
      ) {
        return res.status(400).json({
          error:
            "Valid username, 6+ character password and role are required."
        });
      }

      const exists = await pool.query(
        `SELECT id FROM admins WHERE username=$1`,
        [username]
      );

      if (exists.rows.length) {
        return res.status(400).json({
          error: "Username already exists."
        });
      }

      const hash =
        await bcrypt.hash(password, 12);

      const r = await pool.query(`
        INSERT INTO admins
        (username,password_hash,role)
        VALUES($1,$2,$3)
        RETURNING id,username,role,created_at
      `, [
        username,
        hash,
        role
      ]);

      res.status(201).json({
        message: "User created successfully.",
        user: r.rows[0]
      });

    } catch (e) {

      console.error(e);

      res.status(500).json({
        error: "Could not create user."
      });
    }
  }
);


app.delete(
  "/api/super-admin/users/:id",
  superAdminRequired,
  async (req, res) => {

    try {

      const id =
        Number(req.params.id);

      if (!Number.isInteger(id)) {
        return res.status(400).json({
          error: "Invalid user ID."
        });
      }

      if (id === req.user.id) {
        return res.status(400).json({
          error: "You cannot delete your own account."
        });
      }

      const r = await pool.query(`
        DELETE FROM admins
        WHERE id=$1
        RETURNING id,username,role
      `, [id]);

      if (!r.rows[0]) {
        return res.status(404).json({
          error: "User not found."
        });
      }

      for (
        const [token, session]
        of global.adminTokens.entries()
      ) {
        if (session.id === id) {
          global.adminTokens.delete(token);
        }
      }

      res.json({
        message: "User deleted successfully.",
        user: r.rows[0]
      });

    } catch (e) {

      console.error(e);

      res.status(500).json({
        error: "Could not delete user."
      });
    }
  }
);


/* =========================
   DASHBOARD
========================= */

app.get("/api/dashboard", authRequired, async (_, res) => {

  try {

    const counts = await pool.query(`
      SELECT

        COUNT(*)
        FILTER (
          WHERE status='IN'
        )::int AS inside,

        COUNT(*)
        FILTER (
          WHERE DATE(
            in_time AT TIME ZONE 'Asia/Kolkata'
          )
          =
          DATE(
            NOW() AT TIME ZONE 'Asia/Kolkata'
          )
        )::int AS today,

        COUNT(*)
        FILTER (
          WHERE status='OUT'
          AND DATE(
            out_time AT TIME ZONE 'Asia/Kolkata'
          )
          =
          DATE(
            NOW() AT TIME ZONE 'Asia/Kolkata'
          )
        )::int AS checked_out

      FROM visitors
    `);

    const list = await pool.query(`
      SELECT
        id,
        name,
        mobile,
        company,
        person_to_meet,
        purpose,
        vehicle_no,
        in_time,
        out_time,
        status,

        created_by,
        created_by_username,
        created_by_role,
        created_at,

        checked_out_by,
        checked_out_by_username,
        checked_out_by_role,
        checked_out_at,

        '/api/visitors/'||id||'/photo'
          AS photo_url

      FROM visitors

      WHERE status='IN'

      ORDER BY in_time DESC
    `);

    res.json({
      counts: counts.rows[0],
      inside: list.rows
    });

  } catch (e) {

    console.error(e);

    res.status(500).json({
      error: "Dashboard unavailable."
    });
  }
});


/* =========================
   PHOTO FIELDS
========================= */

const photoFields = [

  {
    name: "visitor_photo",
    label: "Visitor Photo"
  },

  {
    name: "vehicle_photo",
    label: "Vehicle Photo"
  },

  {
    name: "invoice_photo",
    label: "Invoice Photo"
  },

  {
    name: "id_photo",
    label: "ID Proof Photo"
  },

  {
    name: "material_photo",
    label: "Material Photo"
  },

  {
    name: "document_photo",
    label: "Other Document Photo"
  },

  {
    name: "other_photos",
    label: "Other Photo"
  }

];


/* =========================
   CHECK IN
========================= */

app.post(
  "/api/visitors",
  authRequired,

  upload.fields(
    photoFields.map(x => ({
      name: x.name,
      maxCount:
        x.name === "other_photos"
          ? 5
          : 1
    }))
  ),

  async (req, res) => {

    try {

      const visitorPhoto =
        req.files?.visitor_photo?.[0];

      if (!visitorPhoto) {

        return res.status(400).json({
          error:
            "Visitor photo is mandatory."
        });
      }

      const files = [];

      for (const field of photoFields) {

        for (
          const f
          of (req.files?.[field.name] || [])
        ) {

          files.push({
            file: f,
            label: field.label
          });

        }
      }

      if (files.length > 10) {

        return res.status(400).json({
          error:
            "Maximum 10 photos are allowed."
        });
      }

      const name =
        String(req.body.name || "").trim();

      const mobile =
        String(req.body.mobile || "").trim();

      const company =
        String(req.body.company || "").trim();

      const person =
        String(
          req.body.person_to_meet || ""
        ).trim();

      const purpose =
        String(req.body.purpose || "").trim();

      const vehicle =
        String(
          req.body.vehicle_no || ""
        ).trim();

      if (
        !name ||
        !mobile ||
        !person ||
        !purpose
      ) {

        return res.status(400).json({
          error:
            "Please fill all required fields."
        });
      }

      const client =
        await pool.connect();

      try {

        await client.query("BEGIN");

        const vr =
          await client.query(`
            INSERT INTO visitors
            (
              name,
              mobile,
              company,
              person_to_meet,
              purpose,
              vehicle_no,

              photo,
              photo_type,

              created_by,
              created_by_username,
              created_by_role,
              created_at
            )

            VALUES
            (
              $1,$2,$3,$4,$5,$6,
              $7,$8,
              $9,$10,$11,NOW()
            )

            RETURNING
              id,
              in_time,
              status,
              created_by,
              created_by_username,
              created_by_role,
              created_at
          `, [

            name,
            mobile,
            company || null,
            person,
            purpose,
            vehicle || null,

            visitorPhoto.buffer,
            visitorPhoto.mimetype,

            req.user.id,
            req.user.username,
            req.user.role

          ]);

        const visitor =
          vr.rows[0];

        for (const item of files) {

          await client.query(`
            INSERT INTO visitor_photos
            (
              visitor_id,
              photo,
              photo_type,
              photo_label
            )

            VALUES($1,$2,$3,$4)
          `, [

            visitor.id,
            item.file.buffer,
            item.file.mimetype,
            item.label

          ]);
        }

        await client.query("COMMIT");

        res.status(201).json({

          message:
            "Visitor checked in successfully.",

          visitor,

          photo_count:
            files.length

        });

      } catch (e) {

        await client.query("ROLLBACK");

        throw e;

      } finally {

        client.release();
      }

    } catch (e) {

      console.error(
        "Visitor check-in error:",
        e
      );

      res.status(500).json({
        error:
          "Could not save visitor."
      });
    }
  }
);


/* =========================
   MAIN PHOTO
========================= */

app.get(
  "/api/visitors/:id/photo",
  authRequired,
  async (req, res) => {

    try {

      const r = await pool.query(`
        SELECT
          photo,
          photo_type
        FROM visitors
        WHERE id=$1
      `, [req.params.id]);

      if (!r.rows[0]) {
        return res.status(404).end();
      }

      res.type(
        r.rows[0].photo_type
      );

      res.end(
        r.rows[0].photo
      );

    } catch (e) {

      res.status(500).end();
    }
  }
);


/* =========================
   ALL VISITOR PHOTOS
========================= */

app.get(
  "/api/visitors/:id/photos",
  authRequired,
  async (req, res) => {

    try {

      const id =
        Number(req.params.id);

      if (!Number.isInteger(id)) {

        return res.status(400).json({
          error: "Invalid visitor ID."
        });
      }

      const r = await pool.query(`
        SELECT
          id,
          photo_type,
          photo_label,
          created_at,

          '/api/visitor-photos/'||
          id||
          '/image'
          AS photo_url

        FROM visitor_photos

        WHERE visitor_id=$1

        ORDER BY id
      `, [id]);

      res.json(r.rows);

    } catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          "Could not load photos."
      });
    }
  }
);


/* =========================
   PHOTO IMAGE
========================= */

app.get(
  "/api/visitor-photos/:id/image",
  authRequired,
  async (req, res) => {

    try {

      const r = await pool.query(`
        SELECT
          photo,
          photo_type
        FROM visitor_photos
        WHERE id=$1
      `, [req.params.id]);

      if (!r.rows[0]) {
        return res.status(404).end();
      }

      res.type(
        r.rows[0].photo_type
      );

      res.end(
        r.rows[0].photo
      );

    } catch (e) {

      res.status(500).end();
    }
  }
);


/* =========================
   CHECK OUT
========================= */

app.post(
  "/api/visitors/:id/out",
  authRequired,
  async (req, res) => {

    try {

      const id =
        Number(req.params.id);

      if (!Number.isInteger(id)) {

        return res.status(400).json({
          error: "Invalid visitor ID."
        });
      }

      const r = await pool.query(`
        UPDATE visitors

        SET
          status='OUT',
          out_time=NOW(),

          checked_out_by=$2,
          checked_out_by_username=$3,
          checked_out_by_role=$4,
          checked_out_at=NOW()

        WHERE id=$1
        AND status='IN'

        RETURNING
          id,
          out_time,
          status,
          checked_out_by,
          checked_out_by_username,
          checked_out_by_role,
          checked_out_at
      `, [

        id,
        req.user.id,
        req.user.username,
        req.user.role

      ]);

      if (!r.rows[0]) {

        return res.status(404).json({
          error:
            "Visitor is already checked out or not found."
        });
      }

      res.json({

        message:
          "Visitor checked out successfully.",

        visitor:
          r.rows[0]

      });

    } catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          "Could not check out visitor."
      });
    }
  }
);


/* =========================
   VISITOR HISTORY
   ALL LOGGED-IN USERS
========================= */

app.get(
  "/api/admin/visitors",
  authRequired,
  async (req, res) => {

    try {

      const q =
        String(req.query.q || "")
          .trim();

      const date =
        String(req.query.date || "")
          .trim();

      const params = [];
      const where = [];

      if (q) {

        params.push(`%${q}%`);

        where.push(`(
          name ILIKE $${params.length}
          OR mobile ILIKE $${params.length}
          OR company ILIKE $${params.length}
          OR person_to_meet ILIKE $${params.length}
          OR purpose ILIKE $${params.length}
          OR vehicle_no ILIKE $${params.length}
          OR created_by_username ILIKE $${params.length}
          OR checked_out_by_username ILIKE $${params.length}
        )`);
      }

      if (date) {

        params.push(date);

        where.push(`
          DATE(
            in_time AT TIME ZONE 'Asia/Kolkata'
          )
          =
          $${params.length}::date
        `);
      }

      const sql = `

        SELECT

          id,
          name,
          mobile,
          company,
          person_to_meet,
          purpose,
          vehicle_no,

          in_time,
          out_time,
          status,

          created_by,
          created_by_username,
          created_by_role,
          created_at,

          checked_out_by,
          checked_out_by_username,
          checked_out_by_role,
          checked_out_at,

          '/api/visitors/'||
          id||
          '/photo'
          AS photo_url

        FROM visitors

        ${
          where.length
            ? "WHERE " + where.join(" AND ")
            : ""
        }

        ORDER BY in_time DESC

        LIMIT 500
      `;

      const r =
        await pool.query(
          sql,
          params
        );

      res.json(r.rows);

    } catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          "History unavailable."
      });
    }
  }
);


/* =========================
   EXCEL EXPORT
========================= */

app.get(
  "/api/admin/export.xlsx",
  authRequired,
  async (_, res) => {

    try {

      const r = await pool.query(`
        SELECT

          id,
          name,
          mobile,
          company,
          person_to_meet,
          purpose,
          vehicle_no,

          in_time,
          out_time,
          status,

          created_by_username,
          created_by_role,
          created_at,

          checked_out_by_username,
          checked_out_by_role,
          checked_out_at,

          photo,
          photo_type

        FROM visitors

        ORDER BY in_time DESC
      `);

      const workbook =
        new ExcelJS.Workbook();

      const sheet =
        workbook.addWorksheet(
          "Visitor Report"
        );

      sheet.columns = [

        {
          header: "ID",
          key: "id",
          width: 8
        },

        {
          header: "Visitor Photo",
          key: "photo",
          width: 18
        },

        {
          header: "Visitor Name",
          key: "name",
          width: 24
        },

        {
          header: "Mobile",
          key: "mobile",
          width: 16
        },

        {
          header: "Company",
          key: "company",
          width: 24
        },

        {
          header: "Meeting With",
          key: "person_to_meet",
          width: 24
        },

        {
          header: "Purpose",
          key: "purpose",
          width: 30
        },

        {
          header: "Vehicle No",
          key: "vehicle_no",
          width: 18
        },

        {
          header: "IN Time",
          key: "in_time",
          width: 22
        },

        {
          header: "OUT Time",
          key: "out_time",
          width: 22
        },

        {
          header: "Status",
          key: "status",
          width: 12
        },

        {
          header: "Registered By",
          key: "created_by_username",
          width: 20
        },

        {
          header: "Registered Role",
          key: "created_by_role",
          width: 18
        },

        {
          header: "Registration Time",
          key: "created_at",
          width: 22
        },

        {
          header: "Checked Out By",
          key: "checked_out_by_username",
          width: 20
        },

        {
          header: "Checkout Role",
          key: "checked_out_by_role",
          width: 18
        },

        {
          header: "Checkout Time",
          key: "checked_out_at",
          width: 22
        }

      ];

      sheet.getRow(1).font = {
        bold: true
      };

      sheet.freezePanes = {
        ySplit: 1
      };

      let rowNumber = 2;

      for (const v of r.rows) {

        const row =
          sheet.getRow(rowNumber);

        row.getCell(1).value =
          v.id;

        row.getCell(3).value =
          v.name;

        row.getCell(4).value =
          v.mobile;

        row.getCell(5).value =
          v.company || "";

        row.getCell(6).value =
          v.person_to_meet;

        row.getCell(7).value =
          v.purpose;

        row.getCell(8).value =
          v.vehicle_no || "";

        row.getCell(9).value =
          v.in_time
            ? new Date(v.in_time)
            : "";

        row.getCell(10).value =
          v.out_time
            ? new Date(v.out_time)
            : "";

        row.getCell(11).value =
          v.status;

        row.getCell(12).value =
          v.created_by_username || "";

        row.getCell(13).value =
          v.created_by_role || "";

        row.getCell(14).value =
          v.created_at
            ? new Date(v.created_at)
            : "";

        row.getCell(15).value =
          v.checked_out_by_username || "";

        row.getCell(16).value =
          v.checked_out_by_role || "";

        row.getCell(17).value =
          v.checked_out_at
            ? new Date(v.checked_out_at)
            : "";

        row.getCell(9).numFmt =
          "dd-mm-yyyy hh:mm";

        row.getCell(10).numFmt =
          "dd-mm-yyyy hh:mm";

        row.getCell(14).numFmt =
          "dd-mm-yyyy hh:mm";

        row.getCell(17).numFmt =
          "dd-mm-yyyy hh:mm";


        /* Embed Visitor Photo */

        if (
          v.photo &&
          (
            v.photo_type === "image/jpeg" ||
            v.photo_type === "image/png"
          )
        ) {

          const extension =
            v.photo_type === "image/png"
              ? "png"
              : "jpeg";

          const imageId =
            workbook.addImage({
              buffer: v.photo,
              extension
            });

          sheet.addImage(
            imageId,
            {
              tl: {
                col: 1,
                row: rowNumber - 1
              },

              ext: {
                width: 100,
                height: 100
              }
            }
          );

          row.height = 80;
        }

        rowNumber++;
      }

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );

      res.setHeader(
        "Content-Disposition",
        'attachment; filename="sap-semi-visitors.xlsx"'
      );

      await workbook.xlsx.write(res);

      res.end();

    } catch (e) {

      console.error(
        "Excel export error:",
        e
      );

      res.status(500).send(
        "Could not export Excel report."
      );
    }
  }
);


/* =========================
   MULTER ERROR
========================= */

app.use((err, req, res, next) => {

  if (
    err instanceof multer.MulterError ||
    err
  ) {

    return res.status(400).json({
      error:
        err.message ||
        "Upload error."
    });
  }

  next(err);
});


/* =========================
   FRONTEND
========================= */

app.get("/{*splat}", (req, res) => {

  res.sendFile(
    path.join(
      __dirname,
      "public",
      "index.html"
    )
  );
});


/* =========================
   START SERVER
========================= */

initDb()

  .then(() => {

    app.listen(
      PORT,
      "0.0.0.0",
      () => {

        console.log(
          `SAP Semi Visitor System running on port ${PORT}`
        );

      }
    );

  })

  .catch(err => {

    console.error(
      "Database initialization failed:",
      err
    );

    process.exit(1);
  });


process.on(
  "SIGTERM",
  async () => {

    await pool.end();

    process.exit(0);

  }
);
