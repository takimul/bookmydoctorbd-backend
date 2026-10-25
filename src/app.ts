import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { errorHandler } from './middlewares/error.middleware';

// Module Routes
import authRoutes from './modules/auth/auth.routes';
import doctorRoutes from './modules/doctors/doctors.routes';
import appointmentRoutes from './modules/appointments/appointments.routes';
import medicalCaseRoutes from './modules/medicalCases/medicalCases.routes';
import adminRoutes from './modules/admin/admin.routes';
import aiRoutes from './modules/ai/ai.routes';
import patientRoutes from './modules/patient/patient.routes';
import subscriptionRoutes from './modules/subscriptions/subscriptions.routes';

const app: Application = express();

// Security and utility middlewares
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow localhost or frontend deployed domains
      callback(null, true);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Root & Health check endpoints
app.get(['/', '/health', '/api/health'], (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'BookMyDoctorBD Backend API',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    database: 'NeonDB PostgreSQL (Prisma 7)',
  });
});

// Mount modular routes
app.use('/api/auth', authRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/medical-cases', medicalCaseRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/patient', patientRoutes);
app.use('/api/subscriptions', subscriptionRoutes);

// Global Error Handler
app.use(errorHandler);

export default app;

