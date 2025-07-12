const sqlite3 = require('sqlite3').verbose();

class Database {
    constructor() {
        this.db = new sqlite3.Database('./bot_data.db', (err) => {
            if (err) {
                console.error('Error opening database:', err.message);
            } else {
                console.log('Connected to SQLite database');
                this.initTables();
            }
        });
    }

    initTables() {
        this.db.run(`CREATE TABLE IF NOT EXISTS user_addresses (
            user_id INTEGER PRIMARY KEY,
            sender_address TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
    }

    async getSenderAddress(userId) {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT sender_address FROM user_addresses WHERE user_id = ?', [userId], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row ? row.sender_address : null);
                }
            });
        });
    }

    async saveSenderAddress(userId, address) {
        return new Promise((resolve, reject) => {
            this.db.run(`INSERT OR REPLACE INTO user_addresses (user_id, sender_address, updated_at) 
                    VALUES (?, ?, CURRENT_TIMESTAMP)`, [userId, address], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    }

    close() {
        this.db.close((err) => {
            if (err) {
                console.error('Error closing database:', err.message);
            } else {
                console.log('Database connection closed');
            }
        });
    }
}

module.exports = Database; 