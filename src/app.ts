import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware';
import { securityHeadersMiddleware, requestSanitizerMiddleware } from './middlewares/security.middleware';
import { globalLimiter, authLimiter } from './middlewares/rateLimit.middleware';

// Module Routes
import authRoutes from './modules/auth/auth.routes';
import doctorRoutes from './modules/doctors/doctors.routes';
import appointmentRoutes from './modules/appointments/appointments.routes';
import medicalCaseRoutes from './modules/medicalCases/medicalCases.routes';
import adminRoutes from './modules/admin/admin.routes';
import aiRoutes from './modules/ai/ai.routes';
import patientRoutes from './modules/patient/patient.routes';
import subscriptionRoutes from './modules/subscriptions/subscriptions.routes';
import medicinesRoutes from './modules/medicines/medicines.routes';

const app: Application = express();

// Security and utility middlewares
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(securityHeadersMiddleware);
app.use(
  cors({
    origin: (_origin, callback) => {
      // Allow localhost or frontend deployed domains
      callback(null, true);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true, limit: '30mb' }));
app.use(requestSanitizerMiddleware);

// Static files for uploaded images, photos and reports
app.use('/uploads', express.static(path.join(process.cwd(), 'public', 'uploads')));
app.use(express.static(path.join(process.cwd(), 'public')));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Global API Rate Limiter
app.use('/api', globalLimiter);

// Root & Health check endpoints
app.get(['/', '/health', '/api/health'], (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'BookMyDoctorBD Backend API',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    database: 'NeonDB PostgreSQL (Prisma 7)',
    security: {
      rateLimiter: 'active',
      sanitizer: 'active',
      helmet: 'active',
    },
  });
});

// Mount modular routes (with specific auth limiter on /api/auth)
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/medical-cases', medicalCaseRoutes);
app.use('/api/medicines', medicinesRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/patient', patientRoutes);
app.use('/api/subscriptions', subscriptionRoutes);

// 404 Route Handler for undefined endpoints
app.use(notFoundHandler);

// Global Error Handler
app.use(errorHandler);

export default app;
