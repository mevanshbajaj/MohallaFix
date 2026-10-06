# MohallaFix

Community grievance redressal for colonies, RWAs, campuses and small towns.
Citizens report a problem with a photo + GPS, workers fix it, citizens verify.

**Stack:** React + Vite + Tailwind · Node/Express · PostgreSQL · Cloudinary · Leaflet/OpenStreetMap · JWT + RBAC
See `ARCHITECTURE.md` for the lifecycle, API list and edge cases.

## Run locally

Requirements: Node 18+, PostgreSQL 14+.

```bash
createdb mohallafix

# API
cd server
cp .env.example .env        # set DATABASE_URL and JWT_SECRET
npm install
npm run db:seed             # creates tables + demo data (wipes the DB!)
npm run dev                 # http://localhost:4000

# Web app (new terminal)
cd client
npm install
npm run dev                 # http://localhost:5173  (proxies /api to :4000)
```

Demo logins (password `Demo@1234`): `admin@demo.in`, `worker1@demo.in` … `worker4@demo.in`, `citizen1@demo.in` … `citizen5@demo.in`.

GPS and camera need HTTPS or `localhost`. To test on a phone, use a tunnel (e.g. `npx localtunnel --port 5173`).
Without Cloudinary keys, photos are saved to `server/uploads/` (development only; the host disk is wiped on redeploy).

## Environment variables

| Where | Variable | Notes |
|---|---|---|
| server | `DATABASE_URL` | Postgres connection string |
| server | `PGSSL` | `true` on Railway/Render managed Postgres |
| server | `JWT_SECRET` | 32+ random characters |
| server | `CLIENT_ORIGIN` | Deployed web URL (comma-separate for several) |
| server | `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET` | required in production |
| server | `PUBLIC_URL` | API base URL (used for dev uploads) |
| client | `VITE_API_URL` | e.g. `https://your-api.up.railway.app/api/v1` |

## Deploy

**API + database (Railway or Render)**
1. Create a Postgres database and a Node service with root directory `server/`. Start command: `npm start`.
2. Set the server variables above (`PGSSL=true`, `NODE_ENV=production`).
3. Create tables once: run `npm run db:seed -- --force` from your machine with `DATABASE_URL` pointing at the new DB (loads demo data), or run only `psql "$DATABASE_URL" -f db/schema.sql` for an empty database and create the first admin with SQL (`INSERT INTO users (name,email,password_hash,role) ...` using a bcrypt hash).

**Web app (Vercel)**
1. Import the repo, root directory `client/`, framework Vite.
2. Set `VITE_API_URL`. `vercel.json` already rewrites all routes to `index.html`.
3. Add the Vercel URL to the API's `CLIENT_ORIGIN`.

## Before real users
- Change/remove demo accounts; create real admin and workers.
- Set strong `JWT_SECRET`; use Cloudinary; enable database backups.
- Optional next: SMS/email notifications on assign/resolve, AI photo → category suggestion, PDF reports.
