# MohallaFix — Architecture (v1)

Stack: React (Vite) + Tailwind · Node/Express · PostgreSQL · Cloudinary · Leaflet/OpenStreetMap · JWT + RBAC.

## 1. Folder structure

```
mohallafix/
├── server/
│   ├── db/            schema.sql, seed.js
│   ├── src/
│   │   ├── index.js           app bootstrap, helmet, cors, rate limit
│   │   ├── config.js          env validation
│   │   ├── db.js              pg Pool
│   │   ├── middleware/        auth.js (JWT + requireRole), upload.js (multer), error.js, validate.js (zod)
│   │   ├── routes/            auth, complaints, worker, admin, meta
│   │   ├── services/          complaintService.js (state machine), cloudinary.js, sla.js, notify.js
│   │   └── jobs/              slaCheck.js (cron)
│   └── package.json
└── client/
    ├── src/
    │   ├── api/               axios instance + hooks
    │   ├── context/           AuthContext
    │   ├── components/        StatusBadge, Timeline, MapPicker, ComplaintMap, PhotoCapture,
    │   │                      CategoryGrid, StatCard, ProtectedRoute, BottomNav
    │   └── pages/
    │       ├── citizen/       Home, Report, Track, MyComplaints, Nearby, Verify
    │       ├── worker/        Tasks, TaskDetail
    │       ├── admin/         Dashboard, Complaints, ComplaintDetail, Analytics, Workers
    │       └── Login, Register
    └── tailwind.config.js
```

## 2. Database
See `server/db/schema.sql`. Core relations:
`users 1—N complaints` (citizen), `users 1—N complaints` (assigned worker), `categories→departments`, `complaints 1—N complaint_media / complaint_events / internal_notes`, `complaints 1—1 verifications`.

## 3. Lifecycle state machine (enforced server-side)

| From | To | Who |
|---|---|---|
| submitted | assigned | admin |
| assigned | worker_notified | system (on assign, after notify) |
| worker_notified | in_progress | worker |
| in_progress | resolved | worker (after-photo required) |
| resolved | verified | citizen (Yes) |
| resolved | reopened → assigned | citizen (No) / admin |

Every transition writes a `complaint_events` row in the same DB transaction.

## 4. API (`/api/v1`, JSON, `Authorization: Bearer <jwt>`)

**Auth**
- `POST /auth/register` `{name,email,password,phone}` → `201 {token,user}` (always role=citizen)
- `POST /auth/login` `{email,password}` → `{token,user:{id,name,role}}`
- `GET /auth/me`

**Meta (public)**
- `GET /meta/categories` → `[{id,slug,label,icon,sla_hours}]`
- `GET /meta/areas`

**Citizen**
- `POST /complaints` (multipart: `photo`, `category_id`, `lat`, `lng`, `location_source`, `description`) →
  `201 {id, public_id:"MH10293", status:"submitted", sla_due_at, nearby_duplicates:[...]}`
- `GET /complaints/mine?status=&page=`
- `GET /complaints/:id` → complaint + media + timeline (no internal notes for citizens)
- `GET /complaints/nearby?lat=&lng=&radius=1000&status=open` → public-safe markers
- `POST /complaints/:id/upvote`
- `POST /complaints/:id/verify` (multipart: `is_resolved`, `comment`, optional `photo`) → `{status:"verified"|"reopened"}`
- `GET /complaints/track/:publicId` → minimal public status (id, category, status, timeline)

**Worker**
- `GET /worker/tasks?status=`
- `PATCH /worker/tasks/:id/status` (multipart: `status`, `note`, `photo`) → updated complaint

**Admin**
- `GET /admin/stats` → `{total,pending,in_progress,resolved,sla_breached}`
- `GET /admin/complaints?status=&category=&area=&q=&page=`
- `PATCH /admin/complaints/:id/assign` `{worker_id}` → status `assigned`
- `PATCH /admin/complaints/:id/status` `{status,note}`
- `POST /admin/complaints/:id/notes` `{body}`
- `GET /admin/map?bbox=` → markers colour by status
- `GET /admin/analytics/summary` → `{avg_resolution_hours, by_category[], by_area[], repeat_locations[], sla:{breached,total}}`
- `GET /admin/analytics/workers` → `[{worker,assigned,resolved,avg_hours,sla_breached}]`
- `GET /admin/export.csv?from=&to=`
- `GET/POST /admin/workers`

Errors: `{error:{code,message,details?}}` with 400/401/403/404/409/422/429.

**Key SQL**
```sql
-- avg resolution time
SELECT AVG(resolution_hours) FROM v_complaint_metrics WHERE resolved_at IS NOT NULL;
-- repeat complaints: same category within ~50m in 90 days
SELECT ROUND(lat::numeric,3) lat, ROUND(lng::numeric,3) lng, category_id, COUNT(*) n
FROM complaints WHERE created_at > now() - interval '90 days'
GROUP BY 1,2,3 HAVING COUNT(*) >= 3 ORDER BY n DESC;
```

## 5. Frontend pages

- **Report** (core): 1 PhotoCapture (`<input type=file accept="image/*" capture="environment">`, client-side compress to ≤1MB) → 2 location (`navigator.geolocation`, draggable Leaflet pin to override) → 3 category grid (large tap targets) → optional note → Submit → confirmation screen with big `#MH10293`.
- **Track**: vertical timeline with the 6 lifecycle steps, before/after photos, SLA countdown.
- **Verify**: Yes/No, comment, optional photo.
- **Nearby**: Leaflet map + bottom sheet list, "Me too" upvote.
- **Worker Tasks**: card list sorted by SLA due; one-tap "Start work"; Resolve requires after-photo.
- **Admin Dashboard**: 4 stat cards, category bars, map (red/amber/green markers with clustering), SLA breach list.
- **Analytics**: avg resolution, by-colony table, hotspot list, repeat list, worker leaderboard (Recharts).

Design: white/slate surfaces, one trust-blue primary (`#1d4ed8`), status colours red/amber/green, 16px base text, 44px min tap targets, bottom nav on mobile.

## 6. Implementation order
1. DB: run `schema.sql`, `seed.js`.
2. Server skeleton: config, db, error handler, helmet, rate-limit.
3. Auth + RBAC middleware.
4. Meta endpoints; Cloudinary upload middleware.
5. Complaint create + state-machine service + events.
6. Citizen read endpoints (mine, detail, nearby, track), verify.
7. Admin assign/status/notes; worker endpoints.
8. Analytics queries + CSV export; SLA cron.
9. Client: Vite + Tailwind, AuthContext, routing, layout.
10. Report flow → Track → Nearby → Verify.
11. Worker pages → Admin dashboard/map → Analytics.
12. Tests for state machine and RBAC; deploy.

## 7. Environment variables

Server:
```
DATABASE_URL=postgres://user:pass@host:5432/mohallafix
JWT_SECRET=<32+ random chars>
JWT_EXPIRES_IN=7d
CLIENT_ORIGIN=https://mohallafix.vercel.app
CLOUDINARY_CLOUD_NAME= / CLOUDINARY_API_KEY= / CLOUDINARY_API_SECRET=
PORT=4000
# optional later
SMTP_URL= / SMS_API_KEY=
```
Client:
```
VITE_API_URL=https://mohallafix-api.up.railway.app/api/v1
```

## 8. Seed data
`seed.js` creates: 3 departments, 8 categories (pothole, garbage, streetlight, water leak, sewer, road damage, stray animals, drainage) with SLA hours, 4 areas, 1 admin, 3 workers, 5 citizens, ~60 complaints spread over 60 days with realistic status mix, coordinates jittered around a centre point, and events/resolution times so analytics are populated. Demo logins: `admin@demo.in`, `worker1@demo.in`, `citizen1@demo.in` / `Demo@1234`.

## 9. Deployment
- **DB + API:** Railway (Postgres plugin + Node service, root `server/`, start `node src/index.js`). Run `psql $DATABASE_URL -f db/schema.sql` once.
- **Client:** Vercel, root `client/`, build `vite build`, add SPA rewrite `/(.*) → /index.html`.
- Set `CLIENT_ORIGIN` for CORS; use HTTPS (geolocation and camera require it).
- SLA cron: `node-cron` inside the API for MVP; move to a Railway cron job if you scale to multiple instances.
- Backups: enable daily Postgres snapshots.

## 10. Edge cases
- **GPS denied/inaccurate:** fall back to map pin; store `location_source`; reject accuracy >100m without manual confirm.
- **Duplicate reports:** on submit, return same-category open complaints within 50m and offer "Me too" instead; admin can link `duplicate_of`.
- **Large/slow uploads:** client compress, 5MB server cap, image MIME sniffing, EXIF stripped; submit via retry-safe idempotency key.
- **Fake/abusive reports:** rate limit (e.g. 10/day/user), admin can reject/flag, users can be deactivated.
- **Invalid transitions / double clicks:** state machine rejects with 409; transitions use `SELECT … FOR UPDATE`.
- **Worker unavailable:** admin reassign; event logged.
- **Citizen never verifies:** auto-verify 7 days after `resolved` (cron).
- **Citizen says "No":** reopen, notify admin, SLA resets.
- **Privacy:** citizens see only their own details; nearby/public endpoints hide name, phone and exact submitter.
- **Out-of-area coordinates:** validate against area bounding boxes; assign `area_id` by nearest centre.
- **Security:** bcrypt, parameterised queries, zod validation, helmet, role checks on every route, signed upload params.
- **Offline/poor network:** keep report draft in memory and show clear retry state.

## 11. Later
AI photo classification (send image to Claude vision API, return suggested `category_slug` with confidence, user confirms), email/SMS via Nodemailer/Twilio, PDF reports.
