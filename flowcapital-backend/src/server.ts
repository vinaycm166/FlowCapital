import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';

dotenv.config();

import serverless from 'serverless-http';

const app = express();
/* WebSockets disabled for serverless Netlify compatibility
import http from 'http';
import { Server } from 'socket.io';
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.set('io', io);
*/

const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
import morgan from 'morgan';
app.use(morgan('dev'));

import authRoutes from './routes/auth';
import invoiceRoutes from './routes/invoices';
import riskRoutes from './routes/risk';
import marketplaceRoutes from './routes/marketplace';
import paymentRoutes from './routes/payment';
import analyticsRoutes from './routes/analytics';
import erpRoutes from './routes/erp';
import kycRoutes from './routes/kyc';
import defiRoutes from './routes/defi';
import userRoutes from './routes/user';
import reportRoutes from './routes/reports';

// Basic health check endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({ 
    message: 'FlowCapital Backend API is running', 
    endpoints: [
      '/health',
      '/api/auth',
      '/api/invoices',
      '/api/risk',
      '/api/marketplace',
      '/api/payment',
      '/api/analytics',
      '/api/erp',
      '/api/kyc',
      '/api/defi'
    ]
  });
});

app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/risk', riskRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/erp', erpRoutes);
app.use('/api/kyc', kycRoutes);
app.use('/api/defi', defiRoutes);
app.use('/api/user', userRoutes);
app.use('/api/reports', reportRoutes);

/*
io.on('connection', (socket) => {
  console.log('WS Client connected:', socket.id);
  socket.on('disconnect', () => console.log('WS Client disconnected:', socket.id));
});
*/

if (process.env.NETLIFY || process.env.LAMBDA_TASK_ROOT) {
  module.exports.handler = serverless(app);
} else {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}
