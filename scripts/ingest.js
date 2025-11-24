// scripts/ingest.js
import { ingestCSV, getIngestionStats } from '../src/services/ingestion.js';
import { testConnection } from '../src/config/supabase.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Main ingestion script
 */
async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('CSV Ingestion Script - RAG Agent');
  console.log('='.repeat(70) + '\n');

  // Get CSV file path from command line arguments
  const csvPath = process.argv[2];

  if (!csvPath) {
    console.error('❌ Error: Please provide a CSV file path');
    console.log('\nUsage:');
    console.log('  npm run ingest <path-to-csv-file>');
    console.log('\nExample:');
    console.log('  npm run ingest ./data/my_data.csv');
    process.exit(1);
  }

  // Resolve absolute path
  const absolutePath = path.isAbsolute(csvPath) 
    ? csvPath 
    : path.resolve(process.cwd(), csvPath);

  // Check if file exists
  if (!fs.existsSync(absolutePath)) {
    console.error(`❌ Error: File not found: ${absolutePath}`);
    process.exit(1);
  }

  // Check if it's a CSV file
  if (!absolutePath.toLowerCase().endsWith('.csv')) {
    console.error('❌ Error: File must be a CSV file (.csv extension)');
    process.exit(1);
  }

  console.log(`📂 CSV File: ${absolutePath}`);
  console.log(`📦 File Size: ${(fs.statSync(absolutePath).size / 1024).toFixed(2)} KB\n`);

  // Test Supabase connection
  console.log('🔌 Testing Supabase connection...');
  const connected = await testConnection();

  if (!connected) {
    console.error('\n❌ Cannot proceed: Supabase connection failed');
    console.log('\nPlease check:');
    console.log('  1. Your .env file has correct SUPABASE_URL and SUPABASE_SERVICE_KEY');
    console.log('  2. Your Supabase project is running');
    console.log('  3. The database schema is set up (run the schema.sql file)');
    process.exit(1);
  }

  console.log('');

  try {
    // Parse options
    const clearExisting = !process.argv.includes('--no-clear');
    const sourceName = process.argv.find(arg => arg.startsWith('--source='))?.split('=')[1] || null;

    console.log('⚙️  Options:');
    console.log(`   Clear existing: ${clearExisting}`);
    console.log(`   Source name: ${sourceName || 'auto (filename)'}\n`);

    // Run ingestion
    const result = await ingestCSV(absolutePath, {
      clearExisting,
      source: sourceName,
      trackJob: true,
    });

    
    // Show final statistics
    console.log('\n📊 Final Statistics:');
    const stats = await getIngestionStats();
    if (stats) {
      console.log(`   Total documents in database: ${stats.totalDocuments}`);
      console.log(`   Sources: ${stats.sources.join(', ')}`);
    }

    console.log('\n✨ Ingestion completed successfully!');
    console.log('   You can now query your data using the API\n');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Ingestion failed:', error.message);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  }
}

// Run the script
main();