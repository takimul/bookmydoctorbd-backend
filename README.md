# BookMyDoctorBD — Backend API Engine

High-performance healthcare API engine architected for the Bangladesh medical ecosystem.

## Core Stack
- **Runtime**: Node.js & Express.js with TypeScript
- **Database**: NeonDB Serverless PostgreSQL via **Prisma 7.10** with `@prisma/adapter-pg`
- **Security**: JWT RBAC, Helmet, CORS, Bcrypt password hashing
- **Media**: Cloudinary integration for diagnostic report storage

## Architecture & Features
- **Single `User` Table with Dynamic Profiles**: Supports `GUEST`, `PATIENT`, `DOCTOR`, `ADMIN`, `SUPER_ADMIN`.
- **Guest Booking with Verified Mobile**: Instant booking with 6-digit SMS OTP verification (dev bypass `123456`).
- **Core Medical Case Entity**: Provisioned automatically when chamber consultations reach `COMPLETED` status.
- **Doctor Subscription Plans**: Basic, Pro, Premium, and Super Admin assignable 14-day Free Trial.
- **AI Clinical Intelligence**:
  - Bangladeshi medicine autocomplete (Napa, Seclo, Angilock, Monas, etc.) with self-learning doctor preferences.
  - Hospital diagnostic report text parser (extracts vitals, flags abnormal blood sugar, cholesterol, LDL).
- **Cat-First Veterinary Support**: Feline medical cases, routine booster schedules (Rabies, FVRCP).

## Local Development
```bash
npm install
npx prisma generate
npx prisma db push
npm run seed
npm run dev
```
API runs on `http://localhost:5000`. Health check: `GET /api/health`.
