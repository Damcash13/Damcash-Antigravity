const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

const client = new Client({
  connectionString,
  ssl: {
    rejectUnauthorized: false, // Bypass certificate verification for pooler connection
  },
});

async function run() {
  try {
    await client.connect();
    console.log('Connected to the database.');
    
    const sqlPath = path.join(__dirname, 'prisma', 'refined_migration.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('Running migration...');
    await client.query(sql);
    console.log('Migration completed successfully!');
    
  } catch (err) {
    console.error('Error running migration:', err);
  } finally {
    await client.end();
  }
}

run();
