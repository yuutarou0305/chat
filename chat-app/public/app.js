const socket = io();

let currentUserId = null;
let currentUsername = null;
let selectedRecipientId = null;
let mediaRecorder = null;
let recordedChunks = [];
let recordingStartTime = null;
let recordingInterval = null;

// DOM要素
const loginContainer = document.getElementById('loginContainer');
const chatContainer = document.getElementById('chatContainer');
const usernameInput = document.getElementById('usernameInput');
const joinButton = document.getElementById('joinButton');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const messagesDiv = document.getElementById('messages');
const userList = document.getElementById('userList');
const currentUserSpan = document.getElementById('currentUser');
const recordAudioButton = document.getElementById('recordAudioButton');
const recordVideoButton = document.getElementById('recordVideoButton');
const uploadButton = document.getElementById('uploadButton');
const fileInput = document.getElementById('fileInput');
const recordingControls = document.getElementById('recordingControls');
const stopRecordingButton = document.getElementById('stopRecordingButton');
const recordingStatus = document.getElementById('recordingStatus');
const recordingTime = document.getElementById('recordingTime');

// イベントリスナー
joinButton.addEventListener('click', join);
usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') join();
});

sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

recordAudioButton.addEventListener('click', () => startRecording('audio'));
recordVideoButton.addEventListener('click', () => startRecording('video'));
stopRecordingButton.addEventListener('click', stopRecording);
uploadButton.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleFileUpload);

// 参加処理
function join() {
    const username = usernameInput.value.trim();
    if (username) {
        socket.emit('join', username);
    }
}

// メッセージ送信
function sendMessage() {
    const text = messageInput.value.trim();
    if (text) {
        if (selectedRecipientId) {
            socket.emit('privateMessage', { text, recipientId: selectedRecipientId });
        } else {
            socket.emit('message', { text });
        }
        messageInput.value = '';
    }
}

// 録音/録画開始
async function startRecording(type) {
    try {
        const constraints = type === 'audio' 
            ? { audio: true } 
            : { audio: true, video: true };
        
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        mediaRecorder = new MediaRecorder(stream);
        recordedChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };
        
        mediaRecorder.onstop = async () => {
            const blob = new Blob(recordedChunks, {
                type: type === 'audio' ? 'audio/webm' : 'video/webm'
            });
            
            await uploadRecording(blob, type);
            
            stream.getTracks().forEach(track => track.stop());
            recordingControls.style.display = 'none';
            clearInterval(recordingInterval);
        };
        
        mediaRecorder.start();
        recordingStatus.textContent = type === 'audio' ? '録音中...' : '録画中...';
        recordingControls.style.display = 'flex';
        recordingStartTime = Date.now();
        updateRecordingTime();
        recordingInterval = setInterval(updateRecordingTime, 100);
        
    } catch (error) {
        console.error('録音/録画エラー:', error);
        alert('録音/録画を開始できませんでした。マイクやカメラのアクセスを許可してください。');
    }
}

// 録音/録画停止
function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
}

// 録音時間更新
function updateRecordingTime() {
    const elapsed = Date.now() - recordingStartTime;
    const seconds = Math.floor(elapsed / 1000);
    const minutes = Math.floor(seconds / 60);
    const displaySeconds = seconds % 60;
    recordingTime.textContent = `${minutes}:${displaySeconds.toString().padStart(2, '0')}`;
}

// 録音/録画アップロード
async function uploadRecording(blob, type) {
    const formData = new FormData();
    formData.append(type, blob, `${type}-${Date.now()}.webm`);
    
    try {
        const response = await fetch(`/upload/${type}`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (type === 'audio') {
            socket.emit('audioMessage', { audioUrl: data.url });
        } else {
            socket.emit('videoMessage', { videoUrl: data.url });
        }
    } catch (error) {
        console.error('アップロードエラー:', error);
        alert('ファイルのアップロードに失敗しました。');
    }
}

// ファイルアップロード処理
async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const type = file.type.startsWith('audio/') ? 'audio' : 'video';
    const formData = new FormData();
    formData.append(type, file);
    
    try {
        const response = await fetch(`/upload/${type}`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (type === 'audio') {
            socket.emit('audioMessage', { audioUrl: data.url });
        } else {
            socket.emit('videoMessage', { videoUrl: data.url });
        }
    } catch (error) {
        console.error('アップロードエラー:', error);
        alert('ファイルのアップロードに失敗しました。');
    }
    
    fileInput.value = '';
}

// メッセージ表示
function displayMessage(message, isPrivate = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    
    if (message.userId === currentUserId || message.sent) {
        messageDiv.classList.add('own');
    }
    
    if (isPrivate) {
        messageDiv.classList.add('private-message');
    }
    
    const headerDiv = document.createElement('div');
    headerDiv.className = 'message-header';
    const time = new Date(message.timestamp).toLocaleTimeString('ja-JP', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    headerDiv.textContent = `${message.username} - ${time}`;
    if (isPrivate) {
        headerDiv.textContent += ' (プライベート)';
    }
    messageDiv.appendChild(headerDiv);
    
    if (message.type === 'text') {
        const textDiv = document.createElement('div');
        textDiv.className = 'message-text';
        textDiv.textContent = message.text;
        messageDiv.appendChild(textDiv);
    } else if (message.type === 'audio') {
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.src = message.audioUrl;
        messageDiv.appendChild(audio);
    } else if (message.type === 'video') {
        const video = document.createElement('video');
        video.controls = true;
        video.src = message.videoUrl;
        video.style.maxWidth = '100%';
        messageDiv.appendChild(video);
    }
    
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// ユーザーリスト更新
function updateUserList(users) {
    userList.innerHTML = '';
    users.forEach(user => {
        const li = document.createElement('li');
        li.textContent = user.username;
        if (user.id === currentUserId) {
            li.textContent += ' (自分)';
        }
        li.addEventListener('click', () => {
            if (user.id !== currentUserId) {
                selectedRecipientId = user.id;
                alert(`${user.username}にプライベートメッセージを送信します`);
            }
        });
        userList.appendChild(li);
    });
}

// Socket.IOイベント
socket.on('joined', (data) => {
    currentUserId = data.userId;
    currentUsername = data.username;
    currentUserSpan.textContent = `ログイン中: ${currentUsername}`;
    loginContainer.style.display = 'none';
    chatContainer.style.display = 'flex';
});

socket.on('message', (message) => {
    displayMessage(message);
});

socket.on('privateMessage', (message) => {
    displayMessage(message, true);
});

socket.on('messageHistory', (messages) => {
    messagesDiv.innerHTML = '';
    messages.forEach(message => {
        displayMessage(message, message.private);
    });
});

socket.on('userList', (users) => {
    updateUserList(users);
});