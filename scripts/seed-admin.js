// scripts/seed-admin.js
// Script tạo tài khoản admin trong MongoDB cho Admin Dashboard
// Chạy: node scripts/seed-admin.js

const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');

const MONGO_URL = 'mongodb://localhost:27017/lendingP2P';
const SALT_ROUNDS = 10;

const adminAccounts = [
  {
    email: 'admin@loanmanager.com',
    password: 'admin123',
    fullName: 'System Administrator',
    phone: '0900000001',
    role: 'admin',
    status: 'active',
    isVerified: true,
    gender: 'male',
    kycStatus: 'verified',
    creditScore: 850,
    reputationScore: 100,
    balance: { $numberDecimal: '0' },
    totalBorrowed: { $numberDecimal: '0' },
    totalLent: { $numberDecimal: '0' },
    successfulLoans: 0,
    defaultedLoans: 0,
    country: 'Vietnam',
  },
  {
    email: 'verifier@loanmanager.com',
    password: 'verifier123',
    fullName: 'KYC Verifier',
    phone: '0900000002',
    role: 'admin', // Backend dùng role 'admin' cho cả verifier
    status: 'active',
    isVerified: true,
    gender: 'female',
    kycStatus: 'verified',
    creditScore: 800,
    reputationScore: 100,
    balance: { $numberDecimal: '0' },
    totalBorrowed: { $numberDecimal: '0' },
    totalLent: { $numberDecimal: '0' },
    successfulLoans: 0,
    defaultedLoans: 0,
    country: 'Vietnam',
  },
];

async function seed() {
  const client = new MongoClient(MONGO_URL);

  try {
    await client.connect();
    console.log('✅ Đã kết nối MongoDB:', MONGO_URL);

    const db = client.db();
    const usersCollection = db.collection('users');

    for (const account of adminAccounts) {
      // Kiểm tra đã tồn tại chưa
      const existing = await usersCollection.findOne({ email: account.email });
      if (existing) {
        console.log(`⚠️  ${account.email} đã tồn tại (id: ${existing._id}) — bỏ qua`);
        
        // Cập nhật role thành admin nếu chưa đúng
        if (existing.role !== 'admin') {
          await usersCollection.updateOne(
            { _id: existing._id },
            { $set: { role: 'admin', isVerified: true } }
          );
          console.log(`   → Đã cập nhật role thành admin`);
        }
        continue;
      }

      // Hash password
      const passwordHash = await bcrypt.hash(account.password, SALT_ROUNDS);

      const doc = {
        ...account,
        passwordHash,
        avatarUrl: 'https://i.pinimg.com/736x/cd/74/c6/cd74c6ecffb83116692ca51da358284e.jpg',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      delete doc.password;

      const result = await usersCollection.insertOne(doc);
      console.log(`✅ Tạo ${account.email} (role: ${account.role}) — id: ${result.insertedId}`);
    }

    // Hiển thị tổng số users
    const count = await usersCollection.countDocuments();
    console.log(`\n📊 Tổng số users trong DB: ${count}`);
    
    // Hiển thị tất cả admins
    const admins = await usersCollection.find({ role: 'admin' }).toArray();
    console.log(`👑 Admin accounts: ${admins.length}`);
    admins.forEach(a => console.log(`   - ${a.email} (${a.fullName})`));

  } catch (error) {
    console.error('❌ Lỗi:', error.message);
  } finally {
    await client.close();
  }
}

seed();
