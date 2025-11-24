// scripts/test-uid-generation.js
import { readCSV } from '../src/utils/csvProcessor.js';
import { addUIDsToRows, generateUID, extractPropertyCode, isValidUID } from '../src/utils/uidGenerator.js';
import path from 'path';

/**
 * Test UID generation with sample data
 */
async function testUIDGeneration() {
  console.log('\n' + '='.repeat(70));
  console.log('UID Generation Test');
  console.log('='.repeat(70) + '\n');

  // Test individual functions
  console.log('📋 Testing Individual Functions:\n');

  // Test property code extraction
  const testCases = [
    { input: 'S0002 - 101 Maple', expected: 'S0002' },
    { input: 'S0020 - Oak Plaza', expected: 'S0020' },
    { input: 'P1234 - Downtown Center', expected: 'P1234' },
    { input: 'A001 - Riverside', expected: 'A001' },
  ];

  console.log('1️⃣  Property Code Extraction:');
  for (const test of testCases) {
    const result = extractPropertyCode(test.input);
    const status = result === test.expected ? '✅' : '❌';
    console.log(`   ${status} "${test.input}" → "${result}" (expected: "${test.expected}")`);
  }

  // Test UID generation
  console.log('\n2️⃣  UID Generation:');
  const uidTests = [
    { property: 'S0002 - 101 Maple', unit: 'D2', expected: 'S0002_D2' },
    { property: 'S0020 - Oak Plaza', unit: '1N', expected: 'S0020_1N' },
    { property: 'S0020 - Oak Plaza', unit: '1S', expected: 'S0020_1S' },
    { property: 'P1234 - Downtown', unit: 'A101', expected: 'P1234_A101' },
  ];

  for (const test of uidTests) {
    const result = generateUID(test.property, test.unit);
    const status = result === test.expected ? '✅' : '❌';
    console.log(`   ${status} "${test.property}" + "${test.unit}" → "${result}"`);
  }

  // Test UID validation
  console.log('\n3️⃣  UID Validation:');
  const validationTests = [
    { uid: 'S0002_D2', expected: true },
    { uid: 'S0020_1N', expected: true },
    { uid: 'INVALID', expected: false },
    { uid: '0002_D2', expected: false },
    { uid: 'S0002-D2', expected: false },
  ];

  for (const test of validationTests) {
    const result = isValidUID(test.uid);
    const status = result === test.expected ? '✅' : '❌';
    console.log(`   ${status} "${test.uid}" → ${result} (expected: ${test.expected})`);
  }

  // Test with actual CSV if provided
  const csvPath = process.argv[2];
  
  if (csvPath) {
    console.log('\n' + '='.repeat(70));
    console.log('Testing with CSV File');
    console.log('='.repeat(70) + '\n');

    const absolutePath = path.isAbsolute(csvPath) 
      ? csvPath 
      : path.resolve(process.cwd(), csvPath);

    console.log(`📄 Reading CSV: ${absolutePath}\n`);

    try {
      const rows = await readCSV(absolutePath);
      console.log(`✅ Loaded ${rows.length} rows\n`);

      // Show first few rows
      console.log('Sample Rows (first 3):');
      rows.slice(0, 3).forEach((row, idx) => {
        console.log(`\n   Row ${idx + 1}:`);
        console.log(`   Property Name: ${row['Property Name']}`);
        console.log(`   Unit: ${row['Unit']}`);
      });

      // Generate UIDs
      console.log('\n' + '-'.repeat(70));
      console.log('Generating UIDs...\n');
      
      const rowsWithUIDs = addUIDsToRows(rows, {
        propertyNameColumn: 'Property Name',
        unitColumn: 'Unit',
      });

      // Show results
      console.log('\nSample Results (first 5):');
      rowsWithUIDs.slice(0, 5).forEach((row, idx) => {
        console.log(`\n   ${idx + 1}. Property: ${row['Property Name']}`);
        console.log(`      Unit: ${row['Unit']}`);
        console.log(`      UID: ${row['UID'] || '❌ FAILED'}`);
      });

      // Summary statistics
      const totalRows = rowsWithUIDs.length;
      const successfulUIDs = rowsWithUIDs.filter(r => r.UID).length;
      const failedUIDs = totalRows - successfulUIDs;
      const uniqueUIDs = new Set(rowsWithUIDs.map(r => r.UID).filter(Boolean)).size;

      console.log('\n' + '='.repeat(70));
      console.log('Summary Statistics:');
      console.log('='.repeat(70));
      console.log(`   Total Rows: ${totalRows}`);
      console.log(`   Successful UIDs: ${successfulUIDs} (${(successfulUIDs / totalRows * 100).toFixed(1)}%)`);
      console.log(`   Failed UIDs: ${failedUIDs}`);
      console.log(`   Unique UIDs: ${uniqueUIDs}`);
      
      if (uniqueUIDs < successfulUIDs) {
        console.log(`\n   ⚠️  Warning: ${successfulUIDs - uniqueUIDs} duplicate UIDs detected!`);
      }

      // Show any failures
      if (failedUIDs > 0) {
        console.log('\n   ❌ Failed Rows:');
        rowsWithUIDs
          .filter(r => !r.UID)
          .slice(0, 5)
          .forEach((row, idx) => {
            console.log(`\n      ${idx + 1}. Property: "${row['Property Name']}"`);
            console.log(`         Unit: "${row['Unit']}"`);
          });
      }

    } catch (error) {
      console.error('\n❌ Error testing CSV:', error.message);
    }
  } else {
    console.log('\n💡 To test with your CSV file, run:');
    console.log('   node scripts/test-uid-generation.js ./data/your_file.csv');
  }

  console.log('\n' + '='.repeat(70));
  console.log('✅ Test Complete');
  console.log('='.repeat(70) + '\n');
}

testUIDGeneration();