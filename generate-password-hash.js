#!/usr/bin/env node
/**
 * Password Hash Generator for ReadSync
 * 
 * Usage: node generate-password-hash.js YOUR_PASSWORD
 * 
 * This script generates a bcrypt hash for your password.
 * Copy the hash to your .env file as ADMIN_PASSWORD_HASH
 */

const bcrypt = require('bcryptjs');

// Get password from command line argument
const password = process.argv[2];

if (!password) {
    console.error('❌ Error: No password provided');
    console.log('');
    console.log('Usage: node generate-password-hash.js YOUR_PASSWORD');
    console.log('');
    console.log('Example:');
    console.log('  node generate-password-hash.js mySecurePassword123');
    console.log('');
    process.exit(1);
}

// Generate hash
console.log('🔐 Generating bcrypt hash...\n');

bcrypt.hash(password, 10, (err, hash) => {
    if (err) {
        console.error('❌ Error generating hash:', err);
        process.exit(1);
    }

    console.log('✅ Hash generated successfully!\n');
    console.log('Copy this line to your .env file:');
    console.log('─────────────────────────────────────────────────────────');
    console.log(`ADMIN_PASSWORD_HASH="${hash}"`);
    console.log('─────────────────────────────────────────────────────────');
    console.log('');
    console.log('⚠️  IMPORTANT: Keep this hash secret! Do not commit to git.');
    console.log('');
});