'use strict';
// Makes a consistent copy of the live database (safe while the server runs) and keeps the newest 14.
// Usage: node scripts/backup.js   (reads DATA_DIR; BACKUP_DIR defaults to DATA_DIR/backups)
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(DATA_DIR, 'backups');
const KEEP = +process.env.BACKUP_KEEP || 14;
fs.mkdirSync(BACKUP_DIR, { recursive: true });
const out = path.join(BACKUP_DIR, `joinvoo-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.db`);
const db = new DatabaseSync(path.join(DATA_DIR, 'joinvoo.db'));
db.exec('PRAGMA busy_timeout=10000');
db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
db.close();
const files = fs.readdirSync(BACKUP_DIR).filter((f) => /^joinvoo-.*\.db$/.test(f)).sort();
for (const f of files.slice(0, Math.max(0, files.length - KEEP))) fs.unlinkSync(path.join(BACKUP_DIR, f));
console.log(new Date().toISOString(), 'backup written', out, (fs.statSync(out).size / 1e6).toFixed(1) + ' MB');
