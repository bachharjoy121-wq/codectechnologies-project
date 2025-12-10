// server.js
// Node + Express + Socket.io server (no package.json required to run)
// Requires: express, socket.io, mongodb, bcrypt (install instructions below)

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcrypt');
const { MongoClient, ObjectId } = require('mongodb');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
const DB_NAME = 'realtime_chat_app';
const ENC_SECRET = process.env.ENC_SECRET || 'replace_this_with_a_strong_secret_change_it';

// AES-256-GCM encrypt/decrypt helpers
function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const key = crypto.createHash('sha256').update(ENC_SECRET).digest();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}
function decrypt(data) {
  try {
    const b = Buffer.from(data, 'base64');
    const iv = b.slice(0, 12);
    const tag = b.slice(12, 28);
    const encrypted = b.slice(28);
    const key = crypto.createHash('sha256').update(ENC_SECRET).digest();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (e) {
    return null;
  }
}

(async () => {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);

  app.use(express.static('public'));
  app.use(express.json());

  // Connect MongoDB
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  const usersCol = db.collection('users');
  const convCol = db.collection('conversations');
  const msgsCol = db.collection('messages');

  // Simple REST endpoints for auth & listing users
  app.post('/api/register', async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });
    const exists = await usersCol.findOne({ username });
    if (exists) return res.status(409).json({ error: 'username taken' });
    const hash = await bcrypt.hash(password, 10);
    const user = { username, passwordHash: hash, createdAt: new Date() };
    const r = await usersCol.insertOne(user);
    res.json({ ok: true, id: r.insertedId.toString(), username });
  });

  app.post('/api/login', async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });
    const user = await usersCol.findOne({ username });
    if (!user) return res.status(401).json({ error: 'invalid credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });
    const token = crypto.randomBytes(16).toString('hex');
    await usersCol.updateOne({ _id: user._id }, { $set: { sessionToken: token, lastLogin: new Date() } });
    res.json({ ok: true, token, id: user._id.toString(), username: user.username });
  });

  // endpoint to list users (safe projection)
  app.get('/api/users', async (req, res) => {
    const users = await usersCol.find({}, { projection: { passwordHash: 0, sessionToken: 0 } }).toArray();
    res.json(users.map(u => ({ _id: u._id.toString(), username: u.username })));
  });

  // Socket.io state maps
  const socketToUser = new Map();
  const userToSockets = new Map();

  function markUserOnline(userId, socketId) {
    socketToUser.set(socketId, userId);
    const s = userToSockets.get(userId) || new Set();
    s.add(socketId);
    userToSockets.set(userId, s);
    io.emit('user_online', { userId });
  }
  function markUserOffline(socketId) {
    const userId = socketToUser.get(socketId);
    socketToUser.delete(socketId);
    if (!userId) return;
    const s = userToSockets.get(userId);
    if (s) {
      s.delete(socketId);
      if (s.size === 0) {
        userToSockets.delete(userId);
        io.emit('user_offline', { userId });
      } else {
        userToSockets.set(userId, s);
      }
    }
  }

  io.on('connection', (socket) => {
    console.log('socket connected', socket.id);

    socket.on('authenticate', async ({ token }) => {
      if (!token) return socket.emit('auth_error');
      const user = await usersCol.findOne({ sessionToken: token });
      if (!user) return socket.emit('auth_error');
      socket.userId = user._id.toString();
      socket.username = user.username;
      markUserOnline(socket.userId, socket.id);
      socket.emit('auth_ok', { userId: socket.userId, username: socket.username });
    });

    socket.on('join_conv', async ({ convId }) => {
      if (!socket.userId) return socket.emit('not_authed');
      socket.join(convId);
      const msgs = await msgsCol.find({ convId }).sort({ createdAt: 1 }).limit(200).toArray();
      const decrypted = msgs.map(m => ({
        ...m,
        _id: m._id.toString(),
        text: decrypt(m.textEncrypted),
        createdAt: m.createdAt
      }));
      socket.emit('conv_history', { convId, messages: decrypted });
    });

    socket.on('create_conv', async ({ title, participantIds }) => {
      if (!socket.userId) return socket.emit('not_authed');
      const conv = { title: title || null, participants: participantIds || [socket.userId], createdAt: new Date() };
      const r = await convCol.insertOne(conv);
      socket.emit('conv_created', { convId: r.insertedId.toString(), conv });
    });

    socket.on('send_message', async ({ convId, text }) => {
      if (!socket.userId) return socket.emit('not_authed');
      const encrypted = encrypt(text);
      const msg = { convId, senderId: socket.userId, textEncrypted: encrypted, createdAt: new Date(), readBy: [socket.userId] };
      const r = await msgsCol.insertOne(msg);
      const out = { _id: r.insertedId.toString(), convId, senderId: socket.userId, text, createdAt: msg.createdAt, readBy: msg.readBy };
      io.to(convId).emit('new_message', out);
    });

    socket.on('mark_read', async ({ convId, messageId }) => {
      if (!socket.userId) return socket.emit('not_authed');
      await msgsCol.updateOne({ _id: new ObjectId(messageId) }, { $addToSet: { readBy: socket.userId } });
      io.to(convId).emit('message_read', { messageId, userId: socket.userId });
    });

    socket.on('disconnect', () => {
      console.log('socket disconnected', socket.id);
      markUserOffline(socket.id);
    });
  });

  server.listen(PORT, () => {
    console.log('Server listening on', PORT);
  });
})();
