# ServiceExcellence

ServiceExcellence includes:

- Static frontend experience at repository root
- Interactive training app in `training-tool/`
- Node + Prisma backend API in `backend/`

## Local Development (Recommended)

Run from a local path such as `C:\repos\ServiceExcellence`.

## One-Command Start (Current Machine)

From this workspace root, run:
`pwsh -ExecutionPolicy Bypass -File .\start-working-app.ps1`

This starts:

- Frontend from this workspace at `http://localhost:3000`
- Backend from local clone at `C:\repos\ServiceExcellence\backend`

Use this when your UNC backend `node_modules` is stuck.

1. Clone or copy this repository to a local drive.
2. Install root dev tools:
   `npm install`
3. Configure backend env:
   `copy backend\.env.example backend\.env`
4. Install backend dependencies and generate Prisma client:
   `npm run setup`
5. Start frontend + backend together:
   `npm run dev`

URLs:

- Frontend: `http://localhost:3000`
- Backend health: `http://localhost:4100/health`

## UNC / Network Share Notes (Windows)

Running npm directly from a UNC path can fail on Windows due command shell limitations and file locking in `node_modules`.

If your repo is opened from a network path, use one of these approaches:

- Preferred: work from a local clone on `C:`.
- Temporary: map the network share to a drive letter before npm commands.

Example mapping flow:

```cmd
pushd \\192.168.168.182\Folder Redirection\Ccooper\Documents\GitHub\SE\ServiceExcellence
npm install
npm run setup
npm run dev
popd
```

## Backend-Only Commands

From repository root:

- `npm run start:backend`
- `npm run dev:backend`

From `backend/` directly:

- `npm run dev`
- `npm run start`
- `npm run prisma:generate`
- `npm run prisma:migrate`
- `npm run seed`

## Deployment

- Backend deployment guide: `backend/DEPLOYMENT.md`
- Backend service docs: `backend/README.md`
- Frontend-backend connection notes: `training-tool/docs/backend-connection.md`

## Production Smoke Checks

Frontend/Admin smoke checks:

- Open Admin `Settings`
- Run `Run UI Smoke Check` for core UI readiness
- Run `Verify CSV Exports` for analytics/mastery/certificate export readiness

Backend smoke checks:

- Run `npm run smoke:backend`
- Optional protected endpoint verification:
   Set `SMOKE_ADMIN_TOKEN` to a valid admin JWT, then re-run `npm run smoke:backend`.

The backend smoke script checks:

- `GET /health`
- `POST /api/admin/settings/auto-enrollment/preview` (when token is provided)
