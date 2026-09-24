const express = require("express");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");
const crypto = require("crypto");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 10000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false
});


/* =========================================================
   FILE UPLOAD
========================================================= */

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 10
  },

  fileFilter: (_, file, cb) => {

    if (!file.mimetype.startsWith("image/")) {

      return cb(
        new Error("Only image files are allowed.")
      );

    }

    cb(null, true);

  }
});


/* =========================================================
   EXPRESS
========================================================= */

app.use(
  express.json({
    limit: "5mb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "5mb"
  })
);

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);


/* =========================================================
   SESSION TOKENS
========================================================= */

global.adminTokens = new Map();


/* =========================================================
   DATABASE INITIALIZATION
========================================================= */

async function initDb() {

  /*
   * IMPORTANT:
   * Existing tables/data are NOT deleted.
   */

  await pool.query(`
    CREATE TABLE IF NOT EXISTS admins (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);


  /*
   * Add role column to existing admins table.
   * IF NOT EXISTS means existing database will remain safe.
   */

  await pool.query(`
    ALTER TABLE admins
    ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'admin';
  `);


  /*
   * Make sure old records which have NULL role
   * become normal admin accounts.
   */

  await pool.query(`
    UPDATE admins
    SET role = 'admin'
    WHERE role IS NULL;
  `);


  /*
   * Visitor table.
   * Existing table will NOT be recreated.
   */

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
      status TEXT NOT NULL DEFAULT 'IN'
    );
  `);


  /*
   * NEW:
   * Multiple photos for each visitor.
   *
   * Maximum 10 photos will be allowed by API.
   *
   * Existing visitor data remains untouched.
   */

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
    );
  `);


  /*
   * Create initial admin only if no account exists.
   */

  const r = await pool.query(
    "SELECT COUNT(*)::int AS count FROM admins"
  );


  if (r.rows[0].count === 0) {

    const username =
      process.env.ADMIN_USERNAME || "admin";

    const password =
      process.env.ADMIN_PASSWORD || "ChangeMe@123";

    const hash =
      await bcrypt.hash(password, 12);


    await pool.query(
      `
      INSERT INTO admins
      (username, password_hash, role)
      VALUES ($1, $2, 'super_admin')
      `,
      [
        username,
        hash
      ]
    );


    console.log(
      `Initial Super Admin created: ${username}`
    );

  }


  /*
   * If database already has admin account named "admin"
   * and role was never set, it stays admin.
   *
   * Your existing database already has:
   * admin = super_admin
   * so this does not overwrite it.
   */


  console.log("Database initialization completed.");

}


/* =========================================================
   AUTHENTICATION
========================================================= */

function authRequired(req, res, next) {

  const token =
    req.headers["x-admin-token"];

  const session =
    token
      ? global.adminTokens.get(token)
      : null;


  if (!session) {

    return res.status(401).json({
      error: "Login required."
    });

  }


  req.user = session;

  next();

}


/* =========================================================
   ADMIN ACCESS
   ADMIN + SUPER ADMIN
========================================================= */

function adminRequired(req, res, next) {

  authRequired(
    req,
    res,
    () => {

      if (
        req.user.role !== "admin" &&
        req.user.role !== "super_admin"
      ) {

        return res.status(403).json({
          error: "Admin access required."
        });

      }

      next();

    }
  );

}


/* =========================================================
   SUPER ADMIN ACCESS
========================================================= */

function superAdminRequired(req, res, next) {

  authRequired(
    req,
    res,
    () => {

      if (
        req.user.role !== "super_admin"
      ) {

        return res.status(403).json({
          error: "Super Admin access required."
        });

      }

      next();

    }
  );

}


/* =========================================================
   LOGIN
========================================================= */

app.post(
  "/api/admin/login",
  async (req, res) => {

    try {

      const username =
        String(
          req.body.username || ""
        ).trim();

      const password =
        String(
          req.body.password || ""
        );


      if (!username || !password) {

        return res.status(400).json({
          error: "Username and password are required."
        });

      }


      const r =
        await pool.query(
          `
          SELECT
            id,
            username,
            password_hash,
            role
          FROM admins
          WHERE username=$1
          `,
          [username]
        );


      if (!r.rows[0]) {

        return res.status(401).json({
          error: "Invalid username or password."
        });

      }


      const user =
        r.rows[0];


      const valid =
        await bcrypt.compare(
          password,
          user.password_hash
        );


      if (!valid) {

        return res.status(401).json({
          error: "Invalid username or password."
        });

      }


      const role =
        user.role || "admin";


      const token =
        crypto
          .randomBytes(32)
          .toString("hex");


      global.adminTokens.set(
        token,
        {
          id: user.id,
          username: user.username,
          role: role
        }
      );


      res.json({
        token: token,
        username: user.username,
        role: role
      });


    } catch (e) {

      console.error(
        "Login error:",
        e
      );


      res.status(500).json({
        error: "Login failed."
      });

    }

  }
);


/* =========================================================
   LOGOUT
========================================================= */

app.post(
  "/api/admin/logout",
  authRequired,
  (req, res) => {

    const token =
      req.headers["x-admin-token"];

    global.adminTokens.delete(
      token
    );


    res.json({
      ok: true
    });

  }
);


/* =========================================================
   CURRENT USER ROLE
========================================================= */

app.get(
  "/api/my-role",
  authRequired,
  (req, res) => {

    res.json({
      id: req.user.id,
      username: req.user.username,
      role: req.user.role
    });

  }
);


/* =========================================================
   SUPER ADMIN
   USER MANAGEMENT
========================================================= */


/*
 * GET ALL SYSTEM USERS
 */

app.get(
  "/api/super-admin/users",
  superAdminRequired,
  async (req, res) => {

    try {

      const r =
        await pool.query(
          `
          SELECT
            id,
            username,
            role,
            created_at
          FROM admins
          ORDER BY created_at DESC
          `
        );


      res.json(
        r.rows
      );


    } catch (e) {

      console.error(
        "Users list error:",
        e
      );


      res.status(500).json({
        error: "Could not load users."
      });

    }

  }
);


/*
 * CREATE ADMIN / USER
 */

app.post(
  "/api/super-admin/users",
  superAdminRequired,
  async (req, res) => {

    try {

      const username =
        String(
          req.body.username || ""
        ).trim();

      const password =
        String(
          req.body.password || ""
        );

      const role =
        String(
          req.body.role || ""
        ).trim();


      if (
        !username ||
        !password ||
        !role
      ) {

        return res.status(400).json({
          error:
            "Username, password and role are required."
        });

      }


      if (
        !["admin", "user"].includes(role)
      ) {

        return res.status(400).json({
          error: "Invalid role."
        });

      }


      if (password.length < 6) {

        return res.status(400).json({
          error:
            "Password must be at least 6 characters."
        });

      }


      const existing =
        await pool.query(
          `
          SELECT id
          FROM admins
          WHERE username=$1
          `,
          [username]
        );


      if (existing.rows.length) {

        return res.status(400).json({
          error:
            "Username already exists."
        });

      }


      const hash =
        await bcrypt.hash(
          password,
          12
        );


      const r =
        await pool.query(
          `
          INSERT INTO admins
          (
            username,
            password_hash,
            role
          )
          VALUES
          (
            $1,
            $2,
            $3
          )
          RETURNING
            id,
            username,
            role,
            created_at
          `,
          [
            username,
            hash,
            role
          ]
        );


      res.status(201).json({
        message:
          "User created successfully.",
        user:
          r.rows[0]
      });


    } catch (e) {

      console.error(
        "Create user error:",
        e
      );


      res.status(500).json({
        error:
          "Could not create user."
      });

    }

  }
);


/*
 * DELETE ADMIN / USER
 */

app.delete(
  "/api/super-admin/users/:id",
  superAdminRequired,
  async (req, res) => {

    try {

      const id =
        Number(
          req.params.id
        );


      if (
        !Number.isInteger(id)
      ) {

        return res.status(400).json({
          error:
            "Invalid user ID."
        });

      }


      /*
       * Super Admin cannot delete himself.
       */

      if (
        id === req.user.id
      ) {

        return res.status(400).json({
          error:
            "You cannot delete your own account."
        });

      }


      const r =
        await pool.query(
          `
          DELETE FROM admins
          WHERE id=$1
          RETURNING id, username, role
          `,
          [id]
        );


      if (!r.rows[0]) {

        return res.status(404).json({
          error:
            "User not found."
        });

      }


      /*
       * If deleted user had active token,
       * remove all tokens belonging to that user.
       */

      for (
        const [
          token,
          session
        ]
        of global.adminTokens.entries()
      ) {

        if (
          session.id === id
        ) {

          global.adminTokens.delete(
            token
          );

        }

      }


      res.json({
        message:
          "User deleted successfully.",
        user:
          r.rows[0]
      });


    } catch (e) {

      console.error(
        "Delete user error:",
        e
      );


      res.status(500).json({
        error:
          "Could not delete user."
      });

    }

  }
);


/* =========================================================
   DASHBOARD
========================================================= */

app.get(
  "/api/dashboard",
  async (req, res) => {

    try {

      const counts =
        await pool.query(
          `
          SELECT

            COUNT(*)
            FILTER (
              WHERE status='IN'
            )::int AS inside,

            COUNT(*)
            FILTER (
              WHERE
                DATE(
                  in_time
                  AT TIME ZONE 'Asia/Kolkata'
                )
                =
                DATE(
                  NOW()
                  AT TIME ZONE 'Asia/Kolkata'
                )
            )::int AS today,

            COUNT(*)
            FILTER (
              WHERE
                status='OUT'
                AND
                DATE(
                  out_time
                  AT TIME ZONE 'Asia/Kolkata'
                )
                =
                DATE(
                  NOW()
                  AT TIME ZONE 'Asia/Kolkata'
                )
            )::int AS checked_out

          FROM visitors
          `
        );


      const list =
        await pool.query(
          `
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

            '/api/visitors/'
            || id
            || '/photo'
            AS photo_url

          FROM visitors

          WHERE status='IN'

          ORDER BY in_time DESC
          `
        );


      res.json({
        counts:
          counts.rows[0],

        inside:
          list.rows
      });


    } catch (e) {

      console.error(
        "Dashboard error:",
        e
      );


      res.status(500).json({
        error:
          "Dashboard unavailable."
      });

    }

  }
);


/* =========================================================
   VISITOR CHECK-IN
   SUPPORTS:
   - old "photo" field
   - new "photos" field
   - maximum 10 photos
========================================================= */

app.post(
  "/api/visitors",

  upload.fields([
    {
      name: "photo",
      maxCount: 1
    },
    {
      name: "photos",
      maxCount: 10
    }
  ]),

  async (req, res) => {

    try {

      const name =
        String(
          req.body.name || ""
        ).trim();

      const mobile =
        String(
          req.body.mobile || ""
        ).trim();

      const company =
        String(
          req.body.company || ""
        ).trim();

      const personToMeet =
        String(
          req.body.person_to_meet || ""
        ).trim();

      const purpose =
        String(
          req.body.purpose || ""
        ).trim();

      const vehicleNo =
        String(
          req.body.vehicle_no || ""
        ).trim();


      /*
       * Collect uploaded files.
       */

      const files = [];


      if (
        req.files &&
        req.files.photo
      ) {

        files.push(
          ...req.files.photo
        );

      }


      if (
        req.files &&
        req.files.photos
      ) {

        files.push(
          ...req.files.photos
        );

      }


      /*
       * Maximum 10 photos.
       */

      if (
        files.length > 10
      ) {

        return res.status(400).json({
          error:
            "Maximum 10 photos are allowed."
        });

      }


      /*
       * At least one photo is mandatory.
       */

      if (
        files.length === 0
      ) {

        return res.status(400).json({
          error:
            "Visitor photo is mandatory."
        });

      }


      /*
       * Required visitor fields.
       */

      if (
        !name ||
        !mobile ||
        !personToMeet ||
        !purpose
      ) {

        return res.status(400).json({
          error:
            "Please fill all required fields."
        });

      }


      /*
       * First photo is stored in the existing
       * visitors.photo column.
       *
       * This keeps old website compatibility.
       */

      const firstPhoto =
        files[0];


      const client =
        await pool.connect();


      try {

        await client.query(
          "BEGIN"
        );


        /*
         * Insert visitor.
         */

        const visitorResult =
          await client.query(
            `
            INSERT INTO visitors
            (
              name,
              mobile,
              company,
              person_to_meet,
              purpose,
              vehicle_no,
              photo,
              photo_type
            )
            VALUES
            (
              $1,
              $2,
              $3,
              $4,
              $5,
              $6,
              $7,
              $8
            )
            RETURNING
              id,
              in_time,
              status
            `,
            [
              name,
              mobile,
              company || null,
              personToMeet,
              purpose,
              vehicleNo || null,
              firstPhoto.buffer,
              firstPhoto.mimetype
            ]
          );


        const visitor =
          visitorResult.rows[0];


        /*
         * Save all photos in new table.
         */

        for (
          let i = 0;
          i < files.length;
          i++
        ) {

          const file =
            files[i];


          await client.query(
            `
            INSERT INTO visitor_photos
            (
              visitor_id,
              photo,
              photo_type,
              photo_label
            )
            VALUES
            (
              $1,
              $2,
              $3,
              $4
            )
            `,
            [
              visitor.id,
              file.buffer,
              file.mimetype,
              `Photo ${i + 1}`
            ]
          );

        }


        await client.query(
          "COMMIT"
        );


        res.status(201).json({

          message:
            "Visitor checked in successfully.",

          visitor:
            visitor,

          photo_count:
            files.length

        });


      } catch (e) {

        await client.query(
          "ROLLBACK"
        );

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


/* =========================================================
   OLD / PRIMARY VISITOR PHOTO
========================================================= */

app.get(
  "/api/visitors/:id/photo",
  async (req, res) => {

    try {

      const r =
        await pool.query(
          `
          SELECT
            photo,
            photo_type
          FROM visitors
          WHERE id=$1
          `,
          [req.params.id]
        );


      if (!r.rows[0]) {

        return res.status(404).end();

      }


      res.set(
        "Content-Type",
        r.rows[0].photo_type
      );


      res.end(
        r.rows[0].photo
      );


    } catch (e) {

      console.error(
        "Photo error:",
        e
      );


      res.status(500).end();

    }

  }
);


/* =========================================================
   GET ALL PHOTOS FOR VISITOR
========================================================= */

app.get(
  "/api/visitors/:id/photos",
  authRequired,
  async (req, res) => {

    try {

      const id =
        Number(
          req.params.id
        );


      if (
        !Number.isInteger(id)
      ) {

        return res.status(400).json({
          error:
            "Invalid visitor ID."
        });

      }


      const r =
        await pool.query(
          `
          SELECT
            id,
            photo_type,
            photo_label,
            created_at,

            '/api/visitor-photos/'
            || id
            || '/image'
            AS photo_url

          FROM visitor_photos

          WHERE visitor_id=$1

          ORDER BY id ASC
          `,
          [id]
        );


      res.json(
        r.rows
      );


    } catch (e) {

      console.error(
        "Visitor photos error:",
        e
      );


      res.status(500).json({
        error:
          "Could not load visitor photos."
      });

    }

  }
);


/* =========================================================
   INDIVIDUAL EXTRA PHOTO
========================================================= */

app.get(
  "/api/visitor-photos/:photoId/image",
  authRequired,
  async (req, res) => {

    try {

      const id =
        Number(
          req.params.photoId
        );


      if (
        !Number.isInteger(id)
      ) {

        return res.status(400).end();

      }


      const r =
        await pool.query(
          `
          SELECT
            photo,
            photo_type
          FROM visitor_photos
          WHERE id=$1
          `,
          [id]
        );


      if (!r.rows[0]) {

        return res.status(404).end();

      }


      res.set(
        "Content-Type",
        r.rows[0].photo_type
      );


      res.end(
        r.rows[0].photo
      );


    } catch (e) {

      console.error(
        "Extra photo error:",
        e
      );


      res.status(500).end();

    }

  }
);


/* =========================================================
   VISITOR CHECK-OUT
   USER + ADMIN + SUPER ADMIN
========================================================= */

app.post(
  "/api/visitors/:id/out",
  authRequired,
  async (req, res) => {

    try {

      const id =
        Number(
          req.params.id
        );


      if (
        !Number.isInteger(id)
      ) {

        return res.status(400).json({
          error:
            "Invalid visitor ID."
        });

      }


      const r =
        await pool.query(
          `
          UPDATE visitors

          SET
            status='OUT',
            out_time=NOW()

          WHERE
            id=$1
            AND status='IN'

          RETURNING
            id,
            out_time,
            status
          `,
          [id]
        );


      if (!r.rows[0]) {

        return res.status(404).json({
          error:
            "Visitor is already checked out or not found."
        });

      }


      res.json({

        message:
          "Visitor checked out.",

        visitor:
          r.rows[0],

        checked_out_by:
          req.user.username,

        checked_out_by_role:
          req.user.role

      });


    } catch (e) {

      console.error(
        "Checkout error:",
        e
      );


      res.status(500).json({
        error:
          "Could not check out visitor."
      });

    }

  }
);


/* =========================================================
   ADMIN VISITOR HISTORY
   ADMIN + SUPER ADMIN
========================================================= */

app.get(
  "/api/admin/visitors",
  adminRequired,
  async (req, res) => {

    try {

      const q =
        String(
          req.query.q || ""
        ).trim();

      const date =
        String(
          req.query.date || ""
        ).trim();


      const params = [];

      const where = [];


      /*
       * Search
       */

      if (q) {

        params.push(
          `%${q}%`
        );


        where.push(
          `
          (
            name ILIKE $${params.length}
            OR mobile ILIKE $${params.length}
            OR company ILIKE $${params.length}
            OR person_to_meet ILIKE $${params.length}
            OR purpose ILIKE $${params.length}
            OR vehicle_no ILIKE $${params.length}
          )
          `
        );

      }


      /*
       * Date filter
       */

      if (date) {

        params.push(
          date
        );


        where.push(
          `
          DATE(
            in_time
            AT TIME ZONE 'Asia/Kolkata'
          )
          =
          $${params.length}::date
          `
        );

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

          '/api/visitors/'
          || id
          || '/photo'
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


      res.json(
        r.rows
      );


    } catch (e) {

      console.error(
        "History error:",
        e
      );


      res.status(500).json({
        error:
          "History unavailable."
      });

    }

  }
);


/* =========================================================
   CSV EXPORT
   ADMIN + SUPER ADMIN
========================================================= */

app.get(
  "/api/admin/export.csv",
  adminRequired,
  async (req, res) => {

    try {

      const r =
        await pool.query(
          `
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
            status
          FROM visitors
          ORDER BY in_time DESC
          `
        );


      const esc =
        value => {

          return `"${String(
            value ?? ""
          ).replaceAll(
            '"',
            '""'
          )}"`;

        };


      const csv = [

        [
          "ID",
          "Name",
          "Mobile",
          "Company",
          "Person To Meet",
          "Purpose",
          "Vehicle No",
          "IN Time",
          "OUT Time",
          "Status"
        ]
        .map(esc)
        .join(","),


        ...r.rows.map(
          x => [

            x.id,
            x.name,
            x.mobile,
            x.company,
            x.person_to_meet,
            x.purpose,
            x.vehicle_no,
            x.in_time,
            x.out_time,
            x.status

          ]
          .map(esc)
          .join(",")
        )

      ].join("\n");


      res.setHeader(
        "Content-Type",
        "text/csv; charset=utf-8"
      );


      res.setHeader(
        "Content-Disposition",
        'attachment; filename="sap-semi-visitors.csv"'
      );


      res.send(
        csv
      );


    } catch (e) {

      console.error(
        "CSV export error:",
        e
      );


      res.status(500).json({
        error:
          "Could not export report."
      });

    }

  }
);


/* =========================================================
   MULTER / UPLOAD ERROR HANDLER
========================================================= */

app.use(
  (err, req, res, next) => {

    if (
      err instanceof multer.MulterError
    ) {

      if (
        err.code ===
        "LIMIT_FILE_SIZE"
      ) {

        return res.status(400).json({
          error:
            "Each photo must be below 5 MB."
        });

      }


      if (
        err.code ===
        "LIMIT_FILE_COUNT"
      ) {

        return res.status(400).json({
          error:
            "Maximum 10 photos are allowed."
        });

      }


      return res.status(400).json({
        error:
          err.message
      });

    }


    if (err) {

      console.error(
        "Server error:",
        err
      );


      return res.status(400).json({
        error:
          err.message ||
          "Request failed."
      });

    }


    next();

  }
);


/* =========================================================
   FRONTEND
========================================================= */

app.get(
  "/{*splat}",
  (req, res) => {

    res.sendFile(
      path.join(
        __dirname,
        "public",
        "index.html"
      )
    );

  }
);


/* =========================================================
   START SERVER
========================================================= */

initDb()
  .then(
    () => {

      app.listen(
        PORT,
        () => {

          console.log(
            `SAP Semi Visitor System running on port ${PORT}`
          );

        }
      );

    }
  )
  .catch(
    err => {

      console.error(
        "Server startup failed:",
        err
      );

      process.exit(1);

    }
  );


/* =========================================================
   SHUTDOWN
========================================================= */

process.on(
  "SIGTERM",
  async () => {

    console.log(
      "SIGTERM received. Closing database..."
    );

    await pool.end();

    process.exit(0);

  }
);
