const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// ファイルアップロード設定
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

// ユーザー管理
const users = new Map();
const messages = [];

// Socket.IO接続
io.on('connection', (socket) => {
  console.log('新しいユーザーが接続しました');

  socket.on('join', (username) => {
    users.set(socket.id, { id: socket.id, username });
    socket.emit('joined', { userId: socket.id, username });
    socket.emit('messageHistory', messages);
    io.emit('userList', Array.from(users.values()));
  });

  socket.on('message', (data) => {
    const message = {
      id: Date.now(),
      userId: socket.id,
      username: users.get(socket.id)?.username || '匿名',
      text: data.text,
      timestamp: new Date().toISOString(),
      type: 'text'
    };
    messages.push(message);
    io.emit('message', message);
  });

  socket.on('audioMessage', (data) => {
    const message = {
      id: Date.now(),
      userId: socket.id,
      username: users.get(socket.id)?.username || '匿名',
      audioUrl: data.audioUrl,
      timestamp: new Date().toISOString(),
      type: 'audio'
    };
    messages.push(message);
    io.emit('message', message);
  });

  socket.on('videoMessage', (data) => {
    const message = {
      id: Date.now(),
      userId: socket.id,
      username: users.get(socket.id)?.username || '匿名',
      videoUrl: data.videoUrl,
      timestamp: new Date().toISOString(),
      type: 'video'
    };
    messages.push(message);
    io.emit('message', message);
  });

  socket.on('privateMessage', (data) => {
    const message = {
      id: Date.now(),
      userId: socket.id,
      username: users.get(socket.id)?.username || '匿名',
      text: data.text,
      timestamp: new Date().toISOString(),
      type: 'text',
      private: true,
      recipientId: data.recipientId
    };
    socket.to(data.recipientId).emit('privateMessage', message);
    socket.emit('privateMessage', { ...message, sent: true });
  });

  socket.on('disconnect', () => {
    users.delete(socket.id);
    io.emit('userList', Array.from(users.values()));
    console.log('ユーザーが切断しました');
  });
});

// ファイルアップロードエンドポイント
app.post('/upload/audio', upload.single('audio'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'ファイルがアップロードされていません' });
  }
  res.json({ url: `/uploads/${req.file.filename}` });
});

app.post('/upload/video', upload.single('video'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'ファイルがアップロードされていません' });
  }
  res.json({ url: `/uploads/${req.file.filename}` });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`サーバーがポート${PORT}で起動しました`);
});