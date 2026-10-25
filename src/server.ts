import app from './app';
import { ENV } from './config/env';

const PORT = parseInt(ENV.PORT, 10) || 5000;

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` BookMyDoctorBD Backend Server running on port ${PORT}`);
  console.log(` Health check: http://localhost:${PORT}/api/health`);
  console.log(` Environment:  ${ENV.NODE_ENV}`);
  console.log(`=======================================================`);
});

