const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
        fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading index.html');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

const wss = new WebSocket.Server({ server });

const clients = new Map();

wss.on('connection', (ws) => {
    let userId = null;
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            switch (data.type) {
                case 'join':
                    userId = Date.now().toString();
                    clients.set(userId, {
                        ws: ws,
                        username: data.username
                    });
                    
                    // 新しいユーザーに現在のユーザーリストを送信
                    const userList = Array.from(clients.entries()).map(([id, client]) => ({
                        id: id,
                        username: client.username
                    }));
                    
                    ws.send(JSON.stringify({
                        type: 'userList',
                        users: userList
                    }));
                    
                    // 他のユーザーに新しいユーザーの参加を通知
                    broadcast(JSON.stringify({
                        type: 'userJoined',
                        userId: userId,
                        username: data.username
                    }), userId);
                    
                    // システムメッセージを全員に送信
                    broadcast(JSON.stringify({
                        type: 'message',
                        text: `${data.username} さんが参加しました`,
                        sender: 'システム',
                        timestamp: new Date().toISOString(),
                        isSystem: true
                    }));
                    break;
                    
                case 'message':
                    const client = clients.get(userId);
                    if (client) {
                        // すべてのクライアントにメッセージを送信
                        const messageData = {
                            type: 'message',
                            text: data.text,
                            sender: client.username,
                            timestamp: new Date().toISOString(),
                            senderId: userId
                        };
                        
                        // ファイルデータがある場合は追加
                        if (data.fileData && data.fileType) {
                            messageData.fileData = data.fileData;
                            messageData.fileType = data.fileType;
                        }
                        
                        broadcast(JSON.stringify(messageData));
                    }
                    break;
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });
    
    ws.on('close', () => {
        if (userId && clients.has(userId)) {
            const username = clients.get(userId).username;
            clients.delete(userId);
            
            // 他のユーザーに退出を通知
            broadcast(JSON.stringify({
                type: 'userLeft',
                userId: userId,
                username: username
            }));
            
            // システムメッセージを送信
            broadcast(JSON.stringify({
                type: 'message',
                text: `${username} さんが退出しました`,
                sender: 'システム',
                timestamp: new Date().toISOString(),
                isSystem: true
            }));
        }
    });
});

function broadcast(message, excludeUserId = null) {
    clients.forEach((client, id) => {
        if (id !== excludeUserId && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(message);
        }
    });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});