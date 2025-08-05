const express = require('express');
const WebSocket = require('ws');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = 3001;

// 静的ファイルの提供
app.use(express.static(path.join(__dirname)));
app.use(express.json());

// HTTPサーバーの起動
const server = app.listen(PORT, () => {
    console.log(`サーバーがポート ${PORT} で起動しました`);
    console.log(`http://localhost:${PORT} でアクセスできます`);
});

// WebSocketサーバーの設定
const wss = new WebSocket.Server({ server });

// 接続中のクライアント管理
const clients = new Map();

wss.on('connection', (ws) => {
    let currentUser = null;

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            switch (data.type) {
                case 'join':
                    // ユーザー登録または取得
                    let user = await db.users.findByUsername(data.username);
                    if (!user) {
                        user = await db.users.create(data.username);
                    }
                    currentUser = user;
                    
                    // クライアントマップに追加
                    clients.set(ws, {
                        userId: user.id,
                        username: user.username,
                        ws: ws
                    });

                    // ユーザーIDを送信
                    ws.send(JSON.stringify({
                        type: 'userId',
                        userId: user.id
                    }));

                    // 最近のメッセージを送信
                    const recentMessages = await db.messages.getRecent(50);
                    for (const msg of recentMessages) {
                        ws.send(JSON.stringify({
                            type: 'message',
                            id: msg.id,
                            text: msg.message,
                            sender: msg.username,
                            senderId: msg.user_id,
                            timestamp: msg.created_at
                        }));
                    }

                    // 全ユーザーリストを更新
                    broadcastUserList();

                    // 参加通知
                    broadcast({
                        type: 'userJoined',
                        userId: user.id,
                        username: user.username
                    }, ws);

                    break;

                case 'message':
                    if (currentUser) {
                        // メッセージをデータベースに保存
                        const savedMessage = await db.messages.create(currentUser.id, data.text);
                        
                        // 全クライアントに送信
                        broadcast({
                            type: 'message',
                            id: savedMessage.id,
                            text: data.text,
                            sender: currentUser.username,
                            senderId: currentUser.id,
                            timestamp: new Date().toISOString()
                        });

                        // アクティブ時間を更新
                        await db.users.updateLastActive(currentUser.id);
                    }
                    break;

                case 'read':
                    if (currentUser && data.messageId) {
                        // 既読状態を保存
                        await db.messages.markAsRead(data.messageId, currentUser.id);
                        
                        // 既読通知を送信（オプション）
                        broadcast({
                            type: 'readReceipt',
                            messageId: data.messageId,
                            userId: currentUser.id,
                            username: currentUser.username
                        });
                    }
                    break;
            }
        } catch (error) {
            console.error('メッセージ処理エラー:', error);
        }
    });

    ws.on('close', () => {
        if (currentUser) {
            clients.delete(ws);
            
            // 退出通知
            broadcast({
                type: 'userLeft',
                userId: currentUser.id,
                username: currentUser.username
            }, ws);

            // ユーザーリストを更新
            broadcastUserList();
        }
    });
});

// メッセージをブロードキャスト
function broadcast(data, excludeWs = null) {
    const message = JSON.stringify(data);
    clients.forEach((client, clientWs) => {
        if (clientWs !== excludeWs && clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(message);
        }
    });
}

// ユーザーリストをブロードキャスト
async function broadcastUserList() {
    const users = Array.from(clients.values()).map(client => ({
        id: client.userId,
        username: client.username
    }));

    const message = JSON.stringify({
        type: 'userList',
        users: users
    });

    clients.forEach((client, ws) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(message);
        }
    });
}

// APIエンドポイント
// メッセージ履歴取得
app.get('/api/messages', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const messages = await db.messages.getRecent(limit);
        res.json(messages);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ユーザー一覧取得
app.get('/api/users', async (req, res) => {
    try {
        const users = await db.users.getAll();
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 既読状態取得
app.get('/api/messages/:messageId/read-receipts', async (req, res) => {
    try {
        const receipts = await db.messages.getReadReceipts(req.params.messageId);
        res.json(receipts);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});