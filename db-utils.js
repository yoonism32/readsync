// db-utils.js - Shared Database Utilities
const { Pool } = require('pg');
const { URL } = require('url');

/**
 * Force SSL mode to 'no-verify' in database URL
 * @param {string} dbUrl - Database connection URL
 * @returns {string} - Modified database URL with sslmode=no-verify
 */
function forceNoVerify(dbUrl) {
    try {
        const u = new URL(dbUrl);
        u.searchParams.set('sslmode', 'no-verify');
        return u.toString();
    } catch {
        if (/sslmode=/.test(dbUrl)) {
            return dbUrl.replace(/sslmode=[^&]+/i, 'sslmode=no-verify');
        }
        return dbUrl + (dbUrl.includes('?') ? '&' : '?') + 'sslmode=no-verify';
    }
}

/**
 * Create a PostgreSQL connection pool with standardized configuration
 * @param {Object} options - Pool configuration options
 * @param {string} options.connectionString - Database connection string
 * @param {number} [options.max=20] - Maximum number of clients in the pool
 * @param {number} [options.idleTimeoutMillis=30000] - Idle timeout in milliseconds
 * @param {number} [options.connectionTimeoutMillis=10000] - Connection timeout in milliseconds
 * @returns {Pool} - PostgreSQL connection pool
 */
function createPool(options = {}) {
    const {
        connectionString,
        max = 20,
        idleTimeoutMillis = 30000,
        connectionTimeoutMillis = 10000
    } = options;

    if (!connectionString) {
        throw new Error('connectionString is required');
    }

    const processedConnectionString = forceNoVerify(connectionString);

    const pool = new Pool({
        connectionString: processedConnectionString,
        ssl: { rejectUnauthorized: false },
        max: Number(max),
        idleTimeoutMillis: Number(idleTimeoutMillis),
        connectionTimeoutMillis: Number(connectionTimeoutMillis),
        keepAlive: true,
        statement_timeout: 30000,
        query_timeout: 30000,
    });

    // Set up error handlers
    pool.on('error', (err) => {
        console.error('PostgreSQL pool error:', err);
    });

    pool.on('connect', () => {
        console.log('New PostgreSQL connection established');
    });

    return pool;
}

module.exports = {
    createPool,
    forceNoVerify
};