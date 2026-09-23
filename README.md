# SAP Semi Pvt Ltd - Visitor Management System

Features:
- Mandatory visitor photo capture/upload
- Visitor IN registration
- Live dashboard polling
- Currently Inside count
- Today's visitors and check-outs
- Admin login
- Admin visitor history/search
- Admin OUT/check-out
- CSV export
- PostgreSQL storage for visitor data and photos
- Render deployment configuration

## Local setup
1. Install Node.js 18+.
2. Create a PostgreSQL database.
3. Set `DATABASE_URL`.
4. Optional: set `ADMIN_USERNAME` and `ADMIN_PASSWORD`.
5. Run `npm install` then `npm start`.

## Render
Push this project to GitHub and create a Render Blueprint from `render.yaml`.
Set `ADMIN_PASSWORD` as a secret during setup.

Footer branding: "© 2026 SAP Semi Pvt Ltd | Visitor Management System | Developed by Nilesh Joshi"
