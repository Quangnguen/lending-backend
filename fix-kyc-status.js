/**
 * Script migration: Đổi kycStatus từ 'pending' -> 'not_started'
 * cho các user chưa thực sự bắt đầu KYC (không có kycVerifiedAt)
 * 
 * Chạy: node fix-kyc-status.js
 */

const mongoose = require('mongoose');

// Đổi connection string nếu khác
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/p2p-lending';

async function migrate() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected!');

  const db = mongoose.connection.db;

  // Tìm users có kycStatus = 'pending' nhưng CHƯA có kycVerifiedAt
  // (tức là chưa thực sự làm KYC, chỉ bị set mặc định sai)
  const result = await db.collection('users').updateMany(
    {
      kycStatus: 'pending',
      kycVerifiedAt: { $exists: false },
    },
    {
      $set: { kycStatus: 'not_started' },
    }
  );

  console.log(`✅ Updated ${result.modifiedCount} users: kycStatus 'pending' → 'not_started'`);

  // Verify
  const remaining = await db.collection('users').countDocuments({ kycStatus: 'pending' });
  console.log(`   Users still with kycStatus='pending' (real pending): ${remaining}`);

  await mongoose.disconnect();
  console.log('Done!');
}

migrate().catch(console.error);
