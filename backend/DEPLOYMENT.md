# Production Deployment Guide

This guide deploys the Destiny Springs Healthcare white-label edition of the NyxArete training platform.

## Architecture
- Frontend: Vercel static site from repo root
- Backend: Separate Vercel project from `backend/`
- Database: Managed PostgreSQL
- ORM: Prisma

## 1. Create Production Database
Use one of these:
- Neon Postgres
- Supabase Postgres
- Railway Postgres
- Prisma Postgres

You need one connection string in this format:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require
```

## 2. Deploy Backend to Vercel
Create a new Vercel project from the same GitHub repo.

Settings:
- Root Directory: `backend`
- Framework Preset: Other
- Build Command: leave blank
- Output Directory: leave blank

Environment Variables:
- `DATABASE_URL`
- `JWT_SECRET`
- `DEFAULT_OWNER_EMAIL`
- `DEFAULT_OWNER_PASSWORD`
- `DEFAULT_ORG_NAME=Destiny Springs Healthcare`

Recommended values:
- `DEFAULT_OWNER_EMAIL=owner@nyxarete.com`
- `DEFAULT_ORG_NAME=Destiny Springs Healthcare`
- `JWT_SECRET=` long random secret, minimum 32 characters

After deploy, your backend URL will look like:

```text
https://your-backend-project.vercel.app
```

## 3. Run Prisma Setup
Because the current workspace is on a network UNC path, run these from a local clone such as `C:\repos\ServiceExcellence`.

```powershell
cd C:\repos\ServiceExcellence\backend
copy .env.example .env
```

Edit `.env` and set your real `DATABASE_URL`, `JWT_SECRET`, and owner values.

Then run:

```powershell
npm install
npm run prisma:generate
npm run prisma:migrate
npm run seed
```

This creates:
- Organization: Destiny Springs Healthcare
- Owner account
- Default course: `SE-COC-ANNUAL` version `2026.1`

## 4. Deploy Frontend to Vercel
Create or update a Vercel project from repo root.

Settings:
- Root Directory: `.`
- Framework Preset: Other

Then edit:
- `training-tool/runtime-config.js`

Set:

```javascript
window.NYX_API_BASE = "https://your-backend-project.vercel.app";
window.NYX_ORG_SLUG = "destiny-springs-healthcare";
```

Commit and push that change, then redeploy frontend.

## 5. Smoke Test
Frontend:
- Open home page
- Confirm redirect into training tool
- Confirm branding shows Destiny Springs Healthcare and NyxArete footer note

Backend:
- Open `https://your-backend-project.vercel.app/health`
- Expect JSON with `ok: true`

Training flow:
- Start experience
- Complete one run
- Submit completion
- Confirm no console errors

## 6. Admin API Login Test
Once seeded, call:

```http
POST /api/auth/login
```

Payload:

```json
{
  "email": "owner@nyxarete.com",
  "password": "YOUR_PASSWORD",
  "organizationSlug": "destiny-springs-healthcare"
}
```

Then use returned bearer token on:
- `GET /api/admin/dashboard`
- `GET /api/analytics/completion`

## 7. Launch Checklist
- HR/compliance final review complete
- Backend health endpoint live
- Database migrations applied
- Seed data loaded
- Frontend runtime config updated
- One test learner completion recorded
- One admin analytics check completed

## 8. Commercialization Next
- Add branded tenant admin UI
- Add SSO
- Add billing/subscriptions
- Add PDF certificate generation
- Add branded theme per customer
