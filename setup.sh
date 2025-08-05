#!/bin/bash

echo "チャットアプリのセットアップを開始します..."

# package.jsonの作成
cat > package.json << EOL
{
  "name": "chat-app",
  "version": "1.0.0",
  "description": "チャットアプリケーション with SQLite",
  "main": "chat-server.js",
  "scripts": {
    "start": "node chat-server.js",
    "dev": "nodemon chat-server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "sqlite3": "^5.1.6",
    "ws": "^8.14.2",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
EOL

# 依存関係のインストール
echo "依存関係をインストールしています..."
npm install

echo ""
echo "セットアップが完了しました！"
echo ""
echo "サーバーを起動するには以下のコマンドを実行してください："
echo "  npm start"
echo ""
echo "開発モード（自動再起動）で起動する場合："
echo "  npm run dev"
echo ""
echo "ブラウザで http://localhost:3001 にアクセスしてください"