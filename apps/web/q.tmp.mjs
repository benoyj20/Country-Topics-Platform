import path from "node:path";
import pg from "pg";
process.loadEnvFile("C:/Users/benoy/CountryTopicsPlatform/Country-Topics-Platform/.env");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const { rows } = await pool.query(`SELECT id, youtube_id, title, check_status, check_requested_at, checked_at, check_message, created_at FROM videos ORDER BY created_at`);
console.table(rows);
const s = await pool.query(`SELECT id, caption, video_id, updated_at FROM snippets ORDER BY created_at`);
console.table(s.rows);
await pool.end();
