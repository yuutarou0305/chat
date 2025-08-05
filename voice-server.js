const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const uploadedFiles = new Map();

const server = http.createServer((req, res) => {
    // CORSヘッダーを設定
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    if (req.url === '/' || req.url === '/real-chat.html') {
        fs.readFile(path.join(__dirname, 'real-chat.html'), (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading real-chat.html');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
    } else if (req.url === '/upload' && req.method === 'POST') {
        let body = [];
        req.on('data', chunk => {
            body.push(chunk);
        });
        req.on('end', () => {
            try {
                const data = JSON.parse(Buffer.concat(body).toString());
                const fileId = crypto.randomBytes(16).toString('hex');
                uploadedFiles.set(fileId, {
                    data: data.fileData,
                    type: data.fileType,
                    timestamp: Date.now()
                });
                
                // 1時間後に削除
                setTimeout(() => {
                    uploadedFiles.delete(fileId);
                }, 3600000);
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ fileId }));
            } catch (error) {
                res.writeHead(400);
                res.end('Invalid request');
            }
        });
    } else if (req.url.startsWith('/file/') && req.method === 'GET') {
        const fileId = req.url.substring(6);
        const file = uploadedFiles.get(fileId);
        
        if (file) {
            const base64Data = file.data.split(',')[1];
            const buffer = Buffer.from(base64Data, 'base64');
            
            res.writeHead(200, { 
                'Content-Type': file.type,
                'Cache-Control': 'public, max-age=3600'
            });
            res.end(buffer);
        } else {
            res.writeHead(404);
            res.end('File not found');
        }
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

const wss = new WebSocket.Server({ 
    server,
    maxPayload: 100 * 1024 * 1024 // 100MB
});

const clients = new Map();
const calls = new Map();

wss.on('connection', (ws) => {
    let userId = null;
    let userName = null;
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            switch (data.type) {
                case 'join':
                    userId = Date.now().toString();
                    userName = data.username;
                    clients.set(userId, {
                        ws: ws,
                        username: userName,
                        inCall: false
                    });
                    
                    // 新しいユーザーに現在のユーザーリストを送信
                    const userList = Array.from(clients.entries()).map(([id, client]) => ({
                        id: id,
                        username: client.username,
                        inCall: client.inCall
                    }));
                    
                    ws.send(JSON.stringify({
                        type: 'userId',
                        userId: userId
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
                    break;
                    
                case 'message':
                    if (userName) {
                        console.log('Received message from:', userName);
                        console.log('Has file data:', !!data.fileData);
                        console.log('File type:', data.fileType);
                        
                        const messageData = {
                            type: 'message',
                            text: data.text,
                            sender: userName,
                            timestamp: new Date().toISOString(),
                            senderId: userId
                        };
                        
                        // ファイルデータがある場合は追加
                        if (data.fileId && data.fileType) {
                            messageData.fileData = data.fileId;
                            messageData.fileType = data.fileType;
                            console.log('Adding file to broadcast:', data.fileType);
                            console.log('File ID:', data.fileId);
                        } else if (data.fileData && data.fileType) {
                            // 旧形式の互換性のため
                            messageData.fileData = data.fileData;
                            messageData.fileType = data.fileType;
                            console.log('Adding file to broadcast (legacy):', data.fileType);
                        }
                        
                        const broadcastMessage = JSON.stringify(messageData);
                        console.log('Broadcasting message size:', broadcastMessage.length);
                        broadcast(broadcastMessage);
                    }
                    break;
                    
                case 'callUser':
                    const caller = clients.get(userId);
                    const callee = clients.get(data.targetUserId);
                    
                    if (caller && callee && !callee.inCall && !caller.inCall) {
                        // 通話を開始
                        calls.set(userId, data.targetUserId);
                        calls.set(data.targetUserId, userId);
                        
                        caller.inCall = true;
                        callee.inCall = true;
                        
                        // 着信側に通話リクエストを送信
                        callee.ws.send(JSON.stringify({
                            type: 'incomingCall',
                            callerId: userId,
                            callerName: caller.username
                        }));
                        
                        // 全ユーザーに通話状態を更新
                        updateCallStatus();
                    } else {
                        ws.send(JSON.stringify({
                            type: 'callError',
                            message: 'ユーザーは通話できません'
                        }));
                    }
                    break;
                    
                case 'acceptCall':
                    const accepter = clients.get(userId);
                    const callerId = data.callerId;
                    const callerClient = clients.get(callerId);
                    
                    if (accepter && callerClient) {
                        // 発信者に受諾を通知
                        callerClient.ws.send(JSON.stringify({
                            type: 'callAccepted',
                            accepterId: userId
                        }));
                    }
                    break;
                    
                case 'rejectCall':
                    const rejecter = clients.get(userId);
                    const rejectedCallerId = data.callerId;
                    const rejectedCaller = clients.get(rejectedCallerId);
                    
                    if (rejecter && rejectedCaller) {
                        // 通話をキャンセル
                        calls.delete(userId);
                        calls.delete(rejectedCallerId);
                        rejecter.inCall = false;
                        rejectedCaller.inCall = false;
                        
                        rejectedCaller.ws.send(JSON.stringify({
                            type: 'callRejected'
                        }));
                        
                        updateCallStatus();
                    }
                    break;
                    
                case 'webrtcSignal':
                    // WebRTCシグナリングメッセージを相手に転送
                    const targetId = calls.get(userId);
                    const target = clients.get(targetId);
                    
                    if (target) {
                        target.ws.send(JSON.stringify({
                            type: 'webrtcSignal',
                            signal: data.signal,
                            fromUserId: userId
                        }));
                    }
                    break;
                    
                case 'endCall':
                    const ender = clients.get(userId);
                    const endTargetId = calls.get(userId);
                    const endTarget = clients.get(endTargetId);
                    
                    if (ender) {
                        ender.inCall = false;
                        calls.delete(userId);
                    }
                    
                    if (endTarget) {
                        endTarget.inCall = false;
                        calls.delete(endTargetId);
                        
                        endTarget.ws.send(JSON.stringify({
                            type: 'callEnded'
                        }));
                    }
                    
                    updateCallStatus();
                    break;
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });
    
    ws.on('close', () => {
        if (userId && clients.has(userId)) {
            const username = clients.get(userId).username;
            
            // 通話中の場合は終了
            const callPartnerId = calls.get(userId);
            if (callPartnerId) {
                const partner = clients.get(callPartnerId);
                if (partner) {
                    partner.inCall = false;
                    partner.ws.send(JSON.stringify({
                        type: 'callEnded'
                    }));
                }
                calls.delete(userId);
                calls.delete(callPartnerId);
            }
            
            clients.delete(userId);
            
            // 他のユーザーに退出を通知
            broadcast(JSON.stringify({
                type: 'userLeft',
                userId: userId,
                username: username
            }));
            
            updateCallStatus();
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

function updateCallStatus() {
    const userList = Array.from(clients.entries()).map(([id, client]) => ({
        id: id,
        username: client.username,
        inCall: client.inCall
    }));
    
    broadcast(JSON.stringify({
        type: 'userList',
        users: userList
    }));
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Voice chat server is running on http://localhost:${PORT}`);
});