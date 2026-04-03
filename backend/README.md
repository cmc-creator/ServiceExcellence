# NyxArete Training Backend

Production-ready backend foundation for a multi-tenant training platform.
Trademark and Copyright (c) NyxArete.

## Features
- Multi-tenant organizations
- Role-based admin authorization (OWNER, ADMIN, MANAGER)
- Learner enrollment and progress tracking
- Attempt lifecycle APIs (start, event, complete)
- Certificate issuance support
- Analytics endpoints for completion and pass rates
- Prisma schema built for PostgreSQL
- Tailored deployment for Destiny Springs Healthcare psychiatric acute inpatient training

## Quick Start (Local)
1. Copy `.env.example` to `.env` and set values.
2. Install dependencies:
   `npm install`
3. Generate Prisma client:
   `npm run prisma:generate`
4. Run migrations:
   `npm run prisma:migrate`
5. Seed initial org + owner + course:
   `npm run seed`
6. Start API:
   `npm run dev`

## API Base URL
- Local: `http://localhost:4100`

## Important Endpoints
- `POST /api/auth/login`
- `POST /api/training/start`
- `POST /api/training/event`
- `POST /api/training/complete`
- `GET /api/admin/dashboard`
- `GET /api/analytics/completion`

## Vercel Deployment (Backend Project)
Deploy this `backend` folder as a separate Vercel project.

Full production steps: `DEPLOYMENT.md`

### Required Environment Variables
- `DATABASE_URL`
- `JWT_SECRET`
- `DEFAULT_OWNER_EMAIL`
- `DEFAULT_OWNER_PASSWORD`
- `DEFAULT_ORG_NAME`
- `CORS_ALLOWED_ORIGINS` (comma-separated frontend origins)

### CORS Configuration
- Set `CORS_ALLOWED_ORIGINS` to the exact frontend URLs that should call this API.
- Example:
   `CORS_ALLOWED_ORIGINS=https://your-frontend.vercel.app,https://www.your-frontend.com`
- Include local dev origins when needed:
   `CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173`

### Notes
- Use managed PostgreSQL for production persistence.
- Run Prisma migrations during CI/CD or a post-deploy task.

## Productization Path
- Add payment/billing per organization.
- Add white-label branding per tenant.
- Add SSO (SAML/OIDC) for enterprise buyers.
- Add audit trail exports and SOC-friendly controls.
