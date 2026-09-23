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


/* =======
