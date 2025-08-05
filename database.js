const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// データベースファイルのパス
const dbPath = path.join(__dirname, 'chat.db');

// データベース接続
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('データベース接続エラー:', err.message);
    } else {
        console.log('SQLiteデータベースに接続しました');
        initializeDatabase();
    }
});

// データベースの初期化
function initializeDatabase() {
    // ユーザーテーブル
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_active DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // メッセージテーブル
    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        message TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_read BOOLEAN DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    // 既読状態テーブル
    db.run(`CREATE TABLE IF NOT EXISTS read_receipts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (message_id) REFERENCES messages(id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE(message_id, user_id)
    )`);

    // ファイル共有テーブル
    db.run(`CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        filename TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_type TEXT,
        file_size INTEGER,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);
}

// ユーザー関連の関数
const userFunctions = {
    // ユーザー作成
    create: (username) => {
        return new Promise((resolve, reject) => {
            db.run('INSERT INTO users (username) VALUES (?)', [username], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ id: this.lastID, username });
                }
            });
        });
    },

    // ユーザー検索
    findByUsername: (username) => {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    },

    // アクティブ時間更新
    updateLastActive: (userId) => {
        return new Promise((resolve, reject) => {
            db.run('UPDATE users SET last_active = CURRENT_TIMESTAMP WHERE id = ?', [userId], (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    },

    // 全ユーザー取得
    getAll: () => {
        return new Promise((resolve, reject) => {
            db.all('SELECT * FROM users ORDER BY last_active DESC', [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }
};

// メッセージ関連の関数
const messageFunctions = {
    // メッセージ保存
    create: (userId, message) => {
        return new Promise((resolve, reject) => {
            db.run('INSERT INTO messages (user_id, message) VALUES (?, ?)', [userId, message], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ id: this.lastID, userId, message });
                }
            });
        });
    },

    // メッセージ取得（最新n件）
    getRecent: (limit = 50) => {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT m.*, u.username 
                FROM messages m 
                JOIN users u ON m.user_id = u.id 
                ORDER BY m.created_at DESC 
                LIMIT ?
            `, [limit], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows.reverse());
                }
            });
        });
    },

    // 既読にする
    markAsRead: (messageId, userId) => {
        return new Promise((resolve, reject) => {
            db.run('INSERT OR IGNORE INTO read_receipts (message_id, user_id) VALUES (?, ?)', 
                [messageId, userId], (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    },

    // 既読状態取得
    getReadReceipts: (messageId) => {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT r.*, u.username 
                FROM read_receipts r 
                JOIN users u ON r.user_id = u.id 
                WHERE r.message_id = ?
            `, [messageId], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }
};

// ファイル関連の関数
const fileFunctions = {
    // ファイル情報保存
    create: (userId, filename, filePath, fileType, fileSize) => {
        return new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO files (user_id, filename, file_path, file_type, file_size) VALUES (?, ?, ?, ?, ?)',
                [userId, filename, filePath, fileType, fileSize],
                function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({ id: this.lastID });
                    }
                }
            );
        });
    },

    // ユーザーのファイル取得
    getByUser: (userId) => {
        return new Promise((resolve, reject) => {
            db.all('SELECT * FROM files WHERE user_id = ? ORDER BY uploaded_at DESC', [userId], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }
};

// エクスポート
module.exports = {
    db,
    users: userFunctions,
    messages: messageFunctions,
    files: fileFunctions
};