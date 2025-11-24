// src/routes/ask.js
import express from 'express';
import { runAgent, simpleQuery } from '../services/agent.js';
import { getDocumentStats } from '../services/retrieval.js';

const router = express.Router();

/**
 * POST /api/ask
 * Main endpoint for asking questions
 */
router.post('/', async (req, res) => {
  try {
    const { question, useAgent = true, source = null } = req.body;

    // Validate request
    if (!question || typeof question !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Question is required and must be a string',
      });
    }

    if (question.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Question cannot be empty',
      });
    }

    console.log(`\n📨 Received question: "${question}"`);
    console.log(`   Use agent: ${useAgent}`);
    console.log(`   Source filter: ${source || 'none'}`);

    // Process query
    const startTime = Date.now();
    let result;

    if (useAgent) {
      result = await runAgent(question);
    } else {
      result = await simpleQuery(question, { source });
    }

    const processingTime = Date.now() - startTime;

    // Return response
    res.json({
      success: true,
      data: {
        question,
        answer: result.answer,
        sources: result.sources || [],
        hasAnswer: result.hasAnswer,
        processingTime: `${processingTime}ms`,
      },
    });

  } catch (error) {
    console.error('Error in /api/ask:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to process question',
      message: error.message,
    });
  }
});

/**
 * GET /api/ask/stats
 * Get statistics about the dataset
 */
router.get('/stats', async (req, res) => {
  try {
    const { source } = req.query;
    const stats = await getDocumentStats(source || null);

    if (!stats) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch statistics',
      });
    }

    res.json({
      success: true,
      data: stats,
    });

  } catch (error) {
    console.error('Error in /api/ask/stats:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics',
      message: error.message,
    });
  }
});

/**
 * GET /api/ask/health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

export default router;