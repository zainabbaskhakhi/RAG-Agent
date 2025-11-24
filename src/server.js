// src/server.js
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import askRouter from './routes/ask.js';
import webhookRouter from './routes/webhook.js';
import { testConnection } from './config/supabase.js';
import { getIngestionStats } from './services/ingestion.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/ask', askRouter);
app.use('/api/webhook', webhookRouter);

// Root endpoint
app.get('/', async (req, res) => {
  try {
    const stats = await getIngestionStats();
    
    res.json({
      service: 'RAG Agent API',
      version: '1.0.0',
      status: 'running',
      timestamp: new Date().toISOString(),
      endpoints: {
        ask: 'POST /api/ask',
        stats: 'GET /api/ask/stats',
        health: 'GET /api/ask/health',
        webhookIngest: 'POST /api/webhook/ingest',
        webhookHealth: 'GET /api/webhook/health',
      },
      stats: stats || { message: 'Unable to fetch stats' },
      documentation: 'Zapier-powered automated CSV ingestion with UID generation',
    });
  } catch (error) {
    res.json({
      service: 'RAG Agent API',
      version: '1.0.0',
      status: 'running',
      timestamp: new Date().toISOString(),
      endpoints: {
        ask: 'POST /api/ask',
        stats: 'GET /api/ask/stats',
        health: 'GET /api/ask/health',
        webhookIngest: 'POST /api/webhook/ingest',
        webhookHealth: 'GET /api/webhook/health',
      },
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path,
    availableEndpoints: [
      'POST /api/ask',
      'GET /api/ask/stats',
      'GET /api/ask/health',
      'POST /api/webhook/ingest',
      'GET /api/webhook/health',
      'GET /',
    ],
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  
  res.status(err.status || 500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Start server
async function startServer() {
  try {
    // Test Supabase connection
    console.log('\n🔌 Testing Supabase connection...');
    const connected = await testConnection();
    
    if (!connected) {
      console.error('⚠️  Warning: Supabase connection failed. Please check your configuration.');
      console.log('   Check your .env file for correct SUPABASE_URL and SUPABASE_SERVICE_KEY');
    }
    
    // Start listening
    app.listen(PORT, () => {
      console.log('\n' + '='.repeat(60));
      console.log('🚀 RAG Agent API Server (Zapier Integration)');
      console.log('='.repeat(60));
      console.log(`📡 Server running on: http://localhost:${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`📊 Ready to accept requests`);
      console.log('='.repeat(60) + '\n');
      
      console.log('📍 Available endpoints:');
      console.log(`  GET    http://localhost:${PORT}/`);
      console.log(`  POST   http://localhost:${PORT}/api/ask`);
      console.log(`  GET    http://localhost:${PORT}/api/ask/stats`);
      console.log(`  GET    http://localhost:${PORT}/api/ask/health`);
      console.log(`  POST   http://localhost:${PORT}/api/webhook/ingest   ← Zapier calls this`);
      console.log(`  GET    http://localhost:${PORT}/api/webhook/health`);
      console.log('');
      
      console.log('🔗 Zapier Integration:');
      console.log('   Configure Zapier webhook to POST CSV files to:');
      console.log(`   http://localhost:${PORT}/api/webhook/ingest`);
      console.log('   (Use your ngrok or deployed URL for production)');
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    console.error('Error details:', error.message);
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n📴 SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n📴 SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Start the server
startServer();