const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/simple-media-chat.html') {
        fs.readFile(path.join(__dirname, 'simple-media-chat.html'), (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading simple-media-chat.html');
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

const wss = new WebSocket.Server({ 
    server,
    maxPayload: 100 * 1024 * 1024 // 100MB
});

const clients = new Set();

wss.on('connection', (ws) => {
    clients.add(ws);
    console.log('New client connected. Total clients:', clients.size);
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('Received message type:', data.type);
            
            if (data.type === 'message') {
                // 全クライアントにブロードキャスト
                const broadcastData = JSON.stringify(data);
                console.log('Broadcasting message from:', data.username);
                console.log('Has file:', !!data.fileData);
                console.log('File type:', data.fileType);
                
                clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(broadcastData);
                    }
                });
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });
    
    ws.on('close', () => {
        clients.delete(ws);
        console.log('Client disconnected. Total clients:', clients.size);
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

const PORT = process.env.PORT || 3002;
server.listen(PORT, () => {
    console.log(`Media chat server is running on http://localhost:${PORT}`);
});