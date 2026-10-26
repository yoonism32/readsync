#!/usr/bin/env node
// /**
//  * Password Hash Generator for ReadSync
//  * 
//  * Usage: node generate-password-hash.js YOUR_PASSWORD
//  * 
//  * This script generates a bcrypt hash for your password.
//  * Copy the hash to your .env file as ADMIN_PASSWORD_HASH
//  */

// const bcrypt = require('bcryptjs');

// // Get password from command line argument
// const password = process.argv[2];

// if (!password) {
//     console.error('❌ Error: No password provided');
//     console.log('');
//     console.log('Usage: node generate-password-hash.js YOUR_PASSWORD');
//     console.log('');
//     console.log('Example:');
//     console.log('  node generate-password-hash.js mySecurePassword123');
//     console.log('');
//     process.exit(1);
// }

// // Generate hash
// console.log('Generating bcrypt hash...\n');

// bcrypt.hash(password, 10, (err, hash) => {
//     if (err) {
//         console.error('Error generating hash:', err);
//         process.exit(1);
//     }

//     console.log('Hash generated successfully!\n');
//     console.log('Copy this line to your .env file:');
//     console.log('─────────────────────────────────────────────────────────');
//     console.log(`ADMIN_PASSWORD_HASH="${hash}"`);
//     console.log('─────────────────────────────────────────────────────────');
//     console.log('');
//     console.log('IMPORTANT: Keep this hash secret! Do not commit to git.');
//     console.log('');
// });

//#!/usr/bin/env node
/**
 * Password Hash Generator for ReadSync
 *
 * Usage:
 *   node generate-password-hash.js            # interactive (recommended)
 *   printf '%s' "$PW" | node generate-password-hash.js   # piped
 *
 * The password is NEVER read from argv, so it never lands in shell history.
 */

'use strict';

const bcrypt = require('bcryptjs');

const ROUNDS = Number(process.env.BCRYPT_ROUNDS || 10);
const MIN_LEN = 12;

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

/** Read all of stdin as a single string, stripping one trailing newline. */
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}

/** Prompt on a TTY with echo disabled. Returns the typed password. */
function promptHidden(question) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let value = '';
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
      stdout.write('\n');
      resolve(value);
    };

    const onData = (chunk) => {
      if (done) return;
      for (const ch of chunk) {
        if (ch === '\u0003') {           // Ctrl-C
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          stdout.write('\n');
          process.exit(130);
        } else if (ch === '\r' || ch === '\n') {
          finish();
          return;
        } else if (ch === '\u007f' || ch === '\b') { // Backspace
          value = value.slice(0, -1);
        } else if (ch === '\u0015') {    // Ctrl-U: clear line
          value = '';
        } else if (ch >= ' ') {          // printable
          value += ch;
        }
      }
    };

    stdin.on('data', onData);
  });
}

async function main() {
  // Refuse argv: it leaks to shell history / process list.
  if (process.argv.length > 2) {
    console.error('❌ Refusing to read the password from the command line.');
    console.error('   Arguments are visible in `ps` and stored in shell history.');
    console.error('');
    console.error('   Interactive (recommended):');
    console.error('     node generate-password-hash.js');
    console.error('');
    console.error('   Piped (for scripts; use `read -rs` so typing is not echoed):');
    console.error("     read -rs PW && printf '%s' \"$PW\" | node generate-password-hash.js");
    process.exit(1);
  }

  let password;
  let interactive = false;

  if (process.stdin.isTTY) {
    interactive = true;
    password = await promptHidden('Password: ');
    const confirm = await promptHidden('Confirm:  ');
    if (password !== confirm) fail('Passwords do not match.');
  } else {
    password = await readStdin();
    if (!password) fail('No password provided on stdin.');
  }

  if (password.length < MIN_LEN) {
    console.error(`⚠️  Warning: password is ${password.length} chars; ${MIN_LEN}+ is recommended.`);
  }

  console.log('\nGenerating bcrypt hash...\n');

  const hash = await bcrypt.hash(password, ROUNDS);

  // Sanity check: verify the hash we just produced.
  const ok = await bcrypt.compare(password, hash);
  if (!ok) fail('Internal error: generated hash did not verify.');

  console.log('Hash generated successfully!\n');
  console.log('Copy this line to your .env file:');
  console.log('─────────────────────────────────────────────────────────');
  console.log(`ADMIN_PASSWORD_HASH="${hash}"`);
  console.log('─────────────────────────────────────────────────────────');
  console.log('');
  console.log('IMPORTANT: Keep this hash secret! Do not commit to git.');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});