// src/utils/uidGenerator.js

/**
 * Extract property code from property name
 * Example: "S0002 - 101 Maple" -> "S0002"
 */
export function extractPropertyCode(propertyName) {
  if (!propertyName || typeof propertyName !== 'string') {
    return null;
  }

  // Match pattern: property code before the dash
  const match = propertyName.trim().match(/^([A-Z]\d+)/i);
  
  if (match) {
    return match[1].toUpperCase();
  }

  // If no dash, check if the whole string is a property code
  const codeMatch = propertyName.trim().match(/^([A-Z]\d+)$/i);
  if (codeMatch) {
    return codeMatch[1].toUpperCase();
  }

  return null;
}

/**
 * Generate UID from property name and unit number
 * Format: {PropertyCode}_{UnitNumber}
 * Example: "S0002 - 101 Maple" + "D2" -> "S0002_D2"
 */
export function generateUID(propertyName, unitNumber) {
  const propertyCode = extractPropertyCode(propertyName);
  
  if (!propertyCode) {
    console.warn(`⚠ Could not extract property code from: "${propertyName}"`);
    return null;
  }

  if (!unitNumber || typeof unitNumber !== 'string') {
    console.warn(`⚠ Invalid unit number for property ${propertyCode}`);
    return null;
  }

  const cleanUnitNumber = unitNumber.trim().replace(/\s+/g, '');
  
  return `${propertyCode}_${cleanUnitNumber}`;
}

/**
 * Add UIDs to CSV rows
 * Expects rows to have 'Property Name' and 'Unit' columns
 */
export function addUIDsToRows(rows, options = {}) {
  const {
    propertyNameColumn = 'Property Name',
    unitColumn = 'Unit',
    uidColumn = 'UID',
  } = options;

  let successCount = 0;
  let failCount = 0;

  const rowsWithUIDs = rows.map((row, index) => {
    const propertyName = row[propertyNameColumn];
    const unitNumber = row[unitColumn];

    const uid = generateUID(propertyName, unitNumber);

    if (uid) {
      successCount++;
      return {
        ...row,
        [uidColumn]: uid,
      };
    } else {
      failCount++;
      console.warn(`⚠ Row ${index + 1}: Failed to generate UID for property="${propertyName}", unit="${unitNumber}"`);
      return {
        ...row,
        [uidColumn]: null,
      };
    }
  });

  console.log(`\n📋 UID Generation Summary:`);
  console.log(`   ✓ Successfully generated: ${successCount}`);
  console.log(`   ✗ Failed to generate: ${failCount}`);
  console.log(`   📊 Total rows: ${rows.length}`);

  return rowsWithUIDs;
}

/**
 * Validate UID format
 */
export function isValidUID(uid) {
  if (!uid || typeof uid !== 'string') {
    return false;
  }

  // Format: PropertyCode_UnitNumber
  // PropertyCode: Letter followed by digits (e.g., S0002)
  // UnitNumber: Alphanumeric (e.g., D2, 1N, 1S)
  const uidPattern = /^[A-Z]\d+_[A-Z0-9]+$/i;
  
  return uidPattern.test(uid);
}

/**
 * Parse UID into components
 */
export function parseUID(uid) {
  if (!isValidUID(uid)) {
    return null;
  }

  const [propertyCode, unitNumber] = uid.split('_');
  
  return {
    propertyCode,
    unitNumber,
    uid,
  };
}