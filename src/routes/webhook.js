import express from "express";
import multer from "multer";
import path from "path";
import { readCSV } from "../utils/csvProcessor.js";
import { processAndUpsertCSV } from "../services/upsert.js";
import fs from "fs";

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), "temp");

    // Ensure directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
    );
  },
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    // Only accept CSV files
    if (
      file.mimetype === "text/csv" ||
      file.originalname.toLowerCase().endsWith(".csv")
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV files are allowed"));
    }
  },
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
  },
});

/**
 * POST /api/webhook/ingest
 * Main webhook endpoint for CSV ingestion (works with both Zapier and direct uploads)
 * Accepts CSV file upload and processes with UID generation
 */
router.post("/ingest", upload.single("file"), async (req, res) => {
  let filePath = null;
  let originalName = "zapier-upload.csv";

  try {
    if (req.file) {
      // Ensure temp directory exists
      const tempDir = path.join(process.cwd(), "temp");
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      const startTime = Date.now();
      // Get filename from Zapier
      originalName = req.file?.file;
      filePath = req.file.path;
      originalName = req.file.originalname;
      console.log(`   Size: ${(req.file.size / 1024).toFixed(2)} KB`);

      console.log(`\n${"=".repeat(60)}`);
      console.log(`📥 Webhook received CSV: ${originalName}`);
      console.log(`   Path: ${filePath}`);
      console.log(`${"=".repeat(60)}`);

      // Extract options from request body
      const {
        source = originalName,
        propertyNameColumn = "Property Name",
        unitColumn = "Unit",
      } = req.body;
      console.log(`   Source: ${source}`);
      console.log(`   Property Column: ${propertyNameColumn}`);
      console.log(`   Unit Column: ${unitColumn}`);

      // Read CSV
      console.log("\n📖 Reading CSV file...");
      const rows = await readCSV(filePath);

      if (rows.length === 0) {
        // Clean up file before returning error
        fs.unlinkSync(filePath);

        return res.status(400).json({
          success: false,
          error: "CSV file is empty",
          message: "The uploaded CSV file contains no data rows",
        });
      }

      console.log(`   ✓ Read ${rows.length} rows from CSV`);

      // Process and upsert with UID generation
      const result = await processAndUpsertCSV(rows, source, {
        propertyNameColumn,
        unitColumn,
      });
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
       console.log('duration', duration)
      // Clean up uploaded file
      fs.unlinkSync(filePath);
      console.log(`\n🗑️  Cleaned up temp file`);

      console.log(`\n${"=".repeat(60)}`);
      console.log(`✅ Webhook processing completed successfully!`);
      console.log(`${"=".repeat(60)}\n`);

      // Return success response
      return res.json({
        success: true,
        message: "CSV processed successfully",
        data: {
          source: result.source,
          totalRows: result.totalRows,
          documentsWithUID: result.documentsWithUID,
          inserted: result.inserted,
          updated: result.updated,
          failed: result.failed,
        },
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("Error details in webhook ingestion::", error.message);

    // Clean up file if it exists
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log("   🗑️  Cleaned up temp file after error");
      } catch (cleanupError) {
        console.error("   ⚠️  Error cleaning up file:", cleanupError.message);
      }
    }

    res.status(500).json({
      success: false,
      error: "Failed to process CSV",
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/webhook/health
 * Health check endpoint for webhook service
 */
router.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "healthy",
    endpoint: "webhook",
    timestamp: new Date().toISOString(),
    message: "Webhook service is running and ready to receive CSV files",
  });
});

/**
 * GET /api/webhook/info
 * Information about webhook usage
 */
router.get("/info", (req, res) => {
  res.json({
    success: true,
    service: "CSV Webhook Ingestion",
    version: "1.0.0",
    endpoints: {
      ingest: {
        method: "POST",
        path: "/api/webhook/ingest",
        description:
          "Upload CSV file for processing with UID generation (supports both direct upload and Zapier)",
        contentType: "multipart/form-data or application/json (Zapier)",
        parameters: {
          file: "CSV file (required for direct upload) OR file URL (Zapier) OR base64_content (Zapier)",
          filename: "Filename (optional, for Zapier)",
          source: "Source name (optional, defaults to filename)",
          propertyNameColumn:
            'Column name for property (optional, default: "Property Name")',
          unitColumn: 'Column name for unit (optional, default: "Unit")',
        },
        examples: {
          direct:
            'curl -X POST http://your-server/api/webhook/ingest -F "file=@data.csv"',
          zapier:
            'curl -X POST http://your-server/api/webhook/ingest -H "Content-Type: application/json" -d \'{"file":"https://...", "filename":"data.csv"}\'',
        },
      },
      health: {
        method: "GET",
        path: "/api/webhook/health",
        description: "Check webhook service health",
      },
    },
    features: [
      "Automatic UID generation (PropertyCode_UnitNumber)",
      "Smart upsert (updates existing records, inserts new ones)",
      "Vector embeddings with OpenAI",
      "Supabase storage with metadata",
      "Zapier webhook compatibility (file URL and base64)",
    ],
    timestamp: new Date().toISOString(),
  });
});

export default router;
