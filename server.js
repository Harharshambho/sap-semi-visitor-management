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
  fileFilter: (_, file, cb) =>
    file.mimetype.startsWith("image/")
      ? cb(null, true)
      : cb(new Error("Only image files are allowed."))
});

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));
app.use(express.static(path.join(__dirname, "public")));

global.adminTokens = new Map();


/* =========================================================
   AUTHENTICATION
========================================================= */

function authRequired(req, res, next) {
  const token = req.headers["x-admin-token"];
  const session = token
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

function adminRequired(req, res, next) {
  authRequired(req, res, () => {
    if (!["admin", "super_admin"].includes(req.user.role)) {
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


/* =========================================================
   DATABASE
========================================================= */

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


  /* VISITORS */

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

  /* CHECKOUT USER DETAILS */

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


  /* ALL PHOTOS */

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


  /* INITIAL SUPER ADMIN */

  const count = await pool.query(
    "SELECT COUNT(*)::int AS count FROM admins"
  );

  if (count.rows[0].count === 0) {

    const username =
      process.env.ADMIN_USERNAME || "admin";

    const password =
      process.env.ADMIN_PASSWORD || "ChangeMe@123";

    const hash =
      await bcrypt.hash(password, 12);

    await pool.query(
      `
      INSERT INTO admins
      (username,password_hash,role)
      VALUES($1,$2,'super_admin')
      `,
      [username, hash]
    );

    console.log(
      `Initial Super Admin created: ${username}`
    );
  }

  console.log(
    "Database initialization completed."
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
        String(req.body.username || "").trim();

      const password =
        String(req.body.password || "");

      const r = await pool.query(
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

      if (
        !r.rows[0] ||
        !(await bcrypt.compare(
          password,
          r.rows[0].password_hash
        ))
      ) {
        return res.status(401).json({
          error:
            "Invalid username or password."
        });
      }

      const u = r.rows[0];

      const token =
        crypto.randomBytes(32).toString("hex");

      global.adminTokens.set(
        token,
        {
          id: u.id,
          username: u.username,
          role: u.role || "admin"
        }
      );

      res.json({
        token,
        username: u.username,
        role: u.role || "admin",
        user_id: u.id
      });

    } catch (e) {

      console.error(e);

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

    global.adminTokens.delete(
      req.headers["x-admin-token"]
    );

    res.json({
      ok: true
    });
  }
);


/* =========================================================
   CURRENT USER
========================================================= */

app.get(
  "/api/my-role",
  authRequired,
  (req, res) => {

    res.json(req.user);
  }
);


/* =========================================================
   SUPER ADMIN - USERS
========================================================= */

app.get(
  "/api/super-admin/users",
  superAdminRequired,
  async (_, res) => {

    try {

      const r = await pool.query(
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

      const exists =
        await pool.query(
          `
          SELECT id
          FROM admins
          WHERE username=$1
          `,
          [username]
        );

      if (exists.rows.length) {
        return res.status(400).json({
          error: "Username already exists."
        });
      }

      const hash =
        await bcrypt.hash(password, 12);

      const r = await pool.query(
        `
        INSERT INTO admins
        (username,password_hash,role)
        VALUES($1,$2,$3)
        RETURNING id,username,role,created_at
        `,
        [username, hash, role]
      );

      res.status(201).json({
        message:
          "User created successfully.",
        user: r.rows[0]
      });

    } catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          "Could not create user."
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
          error:
            "You cannot delete your own account."
        });
      }

      const r = await pool.query(
        `
        DELETE FROM admins
        WHERE id=$1
        RETURNING id,username,role
        `,
        [id]
      );

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
        message:
          "User deleted successfully.",
        user: r.rows[0]
      });

    } catch (e) {

      console.error(e);

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
  authRequired,
  async (_, res) => {

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
            ) =
            DATE(
              NOW() AT TIME ZONE 'Asia/Kolkata'
            )
          )::int AS today,

          COUNT(*)
          FILTER (
            WHERE status='OUT'
            AND DATE(
              out_time AT TIME ZONE 'Asia/Kolkata'
            ) =
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
        error:
          "Dashboard unavailable."
      });
    }
  }
);


/* =========================================================
   PHOTO FIELDS
========================================================= */

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


/* =========================================================
   REGISTER VISITOR
========================================================= */

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

    const files = [];

    for (
      const field
      of photoFields
    ) {

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


    try {

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
        String(req.body.vehicle_no || "").trim();


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


      /*
        Visitor photo compulsory
      */

      const visitorPhoto =
        req.files?.visitor_photo?.[0];

      if (!visitorPhoto) {

        return res.status(400).json({
          error:
            "Visitor photo is mandatory."
        });
      }


      if (!files.length) {

        return res.status(400).json({
          error:
            "Visitor photo is mandatory."
        });
      }


      if (files.length > 10) {

        return res.status(400).json({
          error:
            "Maximum 10 photos are allowed."
        });
      }


      const client =
        await pool.connect();


      try {

        await client.query(
          "BEGIN"
        );


        /*
          MAIN VISITOR RECORD

          IMPORTANT:
          Here we save exactly who registered
          the visitor.
        */

        const vr =
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
            `,

            [
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
            ]
          );


        const visitor =
          vr.rows[0];


        /*
          SAVE ALL PHOTOS
        */

        for (
          const item
          of files
        ) {

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
            ($1,$2,$3,$4)
            `,

            [
              visitor.id,
              item.file.buffer,
              item.file.mimetype,
              item.label
            ]
          );
        }


        await client.query(
          "COMMIT"
        );


        res.status(201).json({

          message:
            "Visitor checked in successfully.",

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
   MAIN PHOTO
========================================================= */

app.get(
  "/api/visitors/:id/photo",
  authRequired,
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

      res.type(
        r.rows[0].photo_type
      );

      res.end(
        r.rows[0].photo
      );

    } catch (e) {

      console.error(e);

      res.status(500).end();
    }
  }
);


/* =========================================================
   ALL VISITOR PHOTOS
========================================================= */

app.get(
  "/api/visitors/:id/photos",
  authRequired,
  async (req, res) => {

    try {

      const id =
        Number(req.params.id);

      if (!Number.isInteger(id)) {
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

            '/api/visitor-photos/'||
            id||
            '/image'
            AS photo_url

          FROM visitor_photos

          WHERE visitor_id=$1

          ORDER BY id
          `,
          [id]
        );


      res.json(
        r.rows
      );

    } catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          "Could not load photos."
      });
    }
  }
);


/* =========================================================
   INDIVIDUAL PHOTO
========================================================= */

app.get(
  "/api/visitor-photos/:id/image",
  authRequired,
  async (req, res) => {

    try {

      const r =
        await pool.query(
          `
          SELECT
            photo,
            photo_type
          FROM visitor_photos
          WHERE id=$1
          `,
          [req.params.id]
        );


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

      console.error(e);

      res.status(500).end();
    }
  }
);


/* =========================================================
   CHECK OUT
   USER + ADMIN + SUPER ADMIN
========================================================= */

app.post(
  "/api/visitors/:id/out",
  authRequired,
  async (req, res) => {

    try {

      const id =
        Number(req.params.id);

      if (!Number.isInteger(id)) {

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
            out_time=NOW(),

            checked_out_by=$2,
            checked_out_by_username=$3,
            checked_out_by_role=$4

          WHERE
            id=$1
            AND status='IN'

          RETURNING
            id,
            out_time,
            status,

            checked_out_by,
            checked_out_by_username,
            checked_out_by_role
          `,

          [
            id,
            req.user.id,
            req.user.username,
            req.user.role
          ]
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

      console.error(e);

      res.status(500).json({
        error:
          "Could not check out visitor."
      });
    }
  }
);


/* =========================================================
   VISITOR HISTORY
   ALL LOGGED-IN USERS
========================================================= */

app.get(
  "/api/admin/visitors",
  authRequired,
  async (req, res) => {

    try {

      const q =
        String(req.query.q || "").trim();

      const date =
        String(req.query.date || "").trim();

      const params = [];
      const where = [];


      if (q) {

        params.push(
          `%${q}%`
        );

        const p =
          params.length;

        where.push(`
          (
            name ILIKE $${p}
            OR mobile ILIKE $${p}
            OR company ILIKE $${p}
            OR person_to_meet ILIKE $${p}
            OR purpose ILIKE $${p}
            OR vehicle_no ILIKE $${p}
            OR created_by_username ILIKE $${p}
            OR checked_out_by_username ILIKE $${p}
          )
        `);
      }


      if (date) {

        params.push(date);

        where.push(
          `
          DATE(
            in_time AT TIME ZONE 'Asia/Kolkata'
          )=$${params.length}::date
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

          created_by,
          created_by_username,
          created_by_role,
          created_at,

          checked_out_by,
          checked_out_by_username,
          checked_out_by_role,

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


      res.json(
        r.rows
      );


    } catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          "History unavailable."
      });
    }
  }
);


/* =========================================================
   EXCEL EXPORT
   WITH ACTUAL PHOTOS
========================================================= */

app.get(
  "/api/admin/export.xlsx",
  authRequired,
  async (_, res) => {

    try {

      const r =
        await pool.query(`
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

            photo,
            photo_type,

            created_by_username,
            created_by_role,
            created_at,

            checked_out_by_username,
            checked_out_by_role

          FROM visitors

          ORDER BY in_time DESC
        `);


      const workbook =
        new ExcelJS.Workbook();

      workbook.creator =
        "SAP Semi Pvt Ltd";

      workbook.created =
        new Date();


      const sheet =
        workbook.addWorksheet(
          "Visitor Report"
        );


      sheet.columns = [

        {
          header: "Photo",
          key: "photo",
          width: 18
        },

        {
          header: "Visitor ID",
          key: "id",
          width: 12
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
          header: "Person To Meet",
          key: "person_to_meet",
          width: 24
        },

        {
          header: "Purpose",
          key: "purpose",
          width: 28
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
          key: "registered_by",
          width: 24
        },

        {
          header: "Registered Role",
          key: "registered_role",
          width: 18
        },

        {
          header: "Registered At",
          key: "registered_at",
          width: 22
        },

        {
          header: "Checked Out By",
          key: "checkout_by",
          width: 24
        },

        {
          header: "Checkout Role",
          key: "checkout_role",
          width: 18
        }

      ];


      /* Header */

      const headerRow =
        sheet.getRow(1);

      headerRow.font = {
        bold: true,
        size: 12
      };

      headerRow.alignment = {
        vertical: "middle",
        horizontal: "center"
      };

      headerRow.height = 25;


      /* Data */

      for (
        const v
        of r.rows
      ) {

        const row =
          sheet.addRow({

            photo: "",

            id: v.id,

            name: v.name,

            mobile: v.mobile,

            company:
              v.company || "",

            person_to_meet:
              v.person_to_meet,

            purpose:
              v.purpose,

            vehicle_no:
              v.vehicle_no || "",

            in_time:
              v.in_time
                ? new Date(v.in_time)
                : "",

            out_time:
              v.out_time
                ? new Date(v.out_time)
                : "",

            status:
              v.status,

            registered_by:
              v.created_by_username || "",

            registered_role:
              v.created_by_role || "",

            registered_at:
              v.created_at
                ? new Date(v.created_at)
                : "",

            checkout_by:
              v.checked_out_by_username || "",

            checkout_role:
              v.checked_out_by_role || ""

          });


        row.height = 90;


        /*
          Embed actual image into Excel
        */

        if (
          v.photo &&
          v.photo_type
        ) {

          try {

            let extension =
              "png";

            if (
              v.photo_type.includes(
                "jpeg"
              ) ||
              v.photo_type.includes(
                "jpg"
              )
            ) {
              extension = "jpeg";
            }

            if (
              v.photo_type.includes(
                "webp"
              )
            ) {
              extension = "webp";
            }

            const imageId =
              workbook.addImage({
                buffer: v.photo,
                extension
              });


            sheet.addImage(
              imageId,
              {
                tl: {
                  col: 0,
                  row: row.number - 1
                },

                ext: {
                  width: 95,
                  height: 80
                }
              }
            );

          } catch (imageError) {

            console.error(
              "Excel image error:",
              imageError
            );
          }
        }
      }


      /* Date formatting */

      for (
        let i = 2;
        i <= sheet.rowCount;
        i++
      ) {

        sheet.getCell(
          `I${i}`
        ).numFmt =
          "dd-mm-yyyy hh:mm";

        sheet.getCell(
          `J${i}`
        ).numFmt =
          "dd-mm-yyyy hh:mm";

        sheet.getCell(
          `N${i}`
        ).numFmt =
          "dd-mm-yyyy hh:mm";
      }


      sheet.views = [
        {
          state: "frozen",
          ySplit: 1
        }
      ];


      sheet.autoFilter = {
        from: "A1",
        to:
          `P${Math.max(
            1,
            sheet.rowCount
          )}`
      };


      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );

      res.setHeader(
        "Content-Disposition",
        'attachment; filename="SAP-Semi-Visitor-Report.xlsx"'
      );


      await workbook.xlsx.write(
        res
      );

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


/* =========================================================
   ERROR HANDLER
========================================================= */

app.use(
  (err, req, res, next) => {

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
  .then(() => {

    app.listen(
      PORT,
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
