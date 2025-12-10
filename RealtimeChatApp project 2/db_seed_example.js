// db_seed_example.js - seed two example users (alice, bob)
const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');

(async () => {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('realtime_chat_app');
  const users = db.collection('users');
  await users.deleteMany({});
  await users.insertMany([
    { username: 'alice', passwordHash: await bcrypt.hash('password', 10) },
    { username: 'bob',   passwordHash: await bcrypt.hash('password', 10) },
  ]);
  console.log('seeded users: alice / bob (password)');
  await client.close();
  process.exit(0);
})();
