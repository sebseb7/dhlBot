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
        
        // Create shipments table if it doesn't exist
        this.db.run(`CREATE TABLE IF NOT EXISTS shipments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            tracking_number TEXT NOT NULL,
            reference_number TEXT NOT NULL,
            sender_address TEXT NOT NULL,
            recipient_address TEXT NOT NULL,
            weight TEXT NOT NULL,
            status TEXT DEFAULT 'CREATED',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) {
                console.error('Error creating shipments table:', err);
            } else {
                console.log('Shipments table ready');
            }
        });
        
        // Create user credentials table
        this.db.run(`CREATE TABLE IF NOT EXISTS user_credentials (
            user_id INTEGER PRIMARY KEY,
            dhl_username TEXT NOT NULL,
            dhl_password TEXT NOT NULL,
            dhl_billing_number TEXT NOT NULL,
            is_initialized BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) {
                console.error('Error creating user_credentials table:', err);
            } else {
                console.log('User credentials table ready');
            }
        });
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

    async saveShipment(userId, trackingNumber, referenceNumber, senderAddress, recipientAddress, weight) {
        return new Promise((resolve, reject) => {
            this.db.run(`INSERT INTO shipments (user_id, tracking_number, reference_number, sender_address, recipient_address, weight) 
                    VALUES (?, ?, ?, ?, ?, ?)`, 
                    [userId, trackingNumber, referenceNumber, senderAddress, recipientAddress, weight], 
                    function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    }

    async getUserShipments(userId, limit = 10) {
        return new Promise((resolve, reject) => {
            this.db.all(`SELECT * FROM shipments WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`, 
                       [userId, limit], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });
    }

    async getShipmentByNumber(userId, trackingNumber) {
        return new Promise((resolve, reject) => {
            this.db.get(`SELECT * FROM shipments WHERE user_id = ? AND tracking_number = ?`, 
                       [userId, trackingNumber], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row || null);
                }
            });
        });
    }

    async updateShipmentStatus(userId, trackingNumber, status) {
        return new Promise((resolve, reject) => {
            this.db.run(`UPDATE shipments SET status = ?, updated_at = CURRENT_TIMESTAMP 
                        WHERE user_id = ? AND tracking_number = ?`, 
                        [status, userId, trackingNumber], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    async deleteShipment(userId, trackingNumber) {
        return new Promise((resolve, reject) => {
            this.db.run(`DELETE FROM shipments WHERE user_id = ? AND tracking_number = ?`, 
                        [userId, trackingNumber], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    // User credentials methods
    async getUserCredentials(userId) {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM user_credentials WHERE user_id = ?', [userId], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row || null);
                }
            });
        });
    }

    async isUserInitialized(userId) {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT is_initialized FROM user_credentials WHERE user_id = ?', [userId], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row ? !!row.is_initialized : false);
                }
            });
        });
    }

    async saveUserCredentials(userId, dhlUsername, dhlPassword, dhlBillingNumber) {
        return new Promise((resolve, reject) => {
            this.db.run(`INSERT OR REPLACE INTO user_credentials 
                        (user_id, dhl_username, dhl_password, dhl_billing_number, is_initialized, updated_at) 
                        VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)`, 
                        [userId, dhlUsername, dhlPassword, dhlBillingNumber], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    }

    async setUserInitialized(userId, initialized = true) {
        return new Promise((resolve, reject) => {
            this.db.run(`UPDATE user_credentials SET is_initialized = ?, updated_at = CURRENT_TIMESTAMP 
                        WHERE user_id = ?`, [initialized ? 1 : 0, userId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }
}

module.exports = Database; 