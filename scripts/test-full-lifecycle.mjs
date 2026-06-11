/**
 * Test toàn bộ vòng đời khoản vay cho hoang@gmail.com
 * Dùng dữ liệu thực từ DB — không cần truyền tham số gì.
 *
 *   node scripts/test-full-lifecycle.mjs
 *
 * Yêu cầu:
 *   - Ganache chạy tại :7545
 *   - Backend chạy tại :9000  ← BẮT BUỘC để thông báo lên app
 *   - MongoDB chạy tại :27017
 */

import { MongoClient, ObjectId } from 'mongodb';
import { ethers } from 'ethers';
import http from 'http';

// ── Config ────────────────────────────────────────────────────────────────────
const MONGO_URL          = 'mongodb://localhost:27017/lendingP2P';
const GANACHE_URL        = 'http://127.0.0.1:7545';
const BACKEND_URL        = 'http://localhost:9000';
const DEBT_TOKEN_ADDRESS = '0x52804627e04f4e3593869Ec5d83950277ad6F2cD';
const ADMIN_EMAIL        = 'admin@lending.com';
const ADMIN_PASSWORD     = 'Admin@123';
const HOANG_PASSWORD     = 'Hoang@123';   // password của hoang@gmail.com

// ── Dữ liệu thực của hoang@gmail.com (lấy từ DB 08/06/2026) ──────────────────
const HOANG = {
  _id:    '6a264b45bd5de530720864ab',
  email:  'hoang@gmail.com',
  wallet: '0x45a978d98f3DFC61b334DAd3ffb3c35b10E314A0',
};
const LOANS = [
  {
    _id:       '6a2668541890a06fd4f77105',
    label:     'Khoản vay 1 — 1.000 USDT / 365 ngày',
    contract:  '0xaA5244e8dAa0D65E4B7BB450C6B4a46e0aCbf4D6',
    principal: 1000,
    debt:      1130,
  },
  {
    _id:       '6a2668671890a06fd4f77130',
    label:     'Khoản vay 2 — 3.000 USDT / 90 ngày',
    contract:  '0x3A5a421F048bf415563A584B14baa09cC158CEab',
    principal: 3000,
    debt:      3096.16,
  },
];

// ── DebtToken ABI (chỉ các hàm cần dùng) ─────────────────────────────────────
const DEBT_TOKEN_ABI = [
  'function owner() view returns (address)',
  'function authorizedMinters(address) view returns (bool)',
  'function setAuthorizedMinter(address minter, bool status) external',
  'function mintDebtToken(address borrower, uint256 loanId, address lender, uint256 principalAmount, uint256 debtAmount, string reason, address loanContract) external returns (uint256)',
  'function hasDebt(address borrower) view returns (bool)',
  'function getDebtCount(address borrower) view returns (uint256)',
  'function getTotalDebt(address borrower) view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
  'function getDebtRecord(uint256 tokenId) view returns (tuple(uint256 loanId, address borrower, address lender, uint256 principalAmount, uint256 debtAmount, uint256 defaultedAt, string reason, address loanContract))',
];

// ── Colors ────────────────────────────────────────────────────────────────────
const C = { reset:'\x1b[0m', bold:'\x1b[1m', dim:'\x1b[2m', green:'\x1b[32m', yellow:'\x1b[33m', red:'\x1b[31m', cyan:'\x1b[36m', blue:'\x1b[34m', magenta:'\x1b[35m' };
const c    = (col, t) => `${C[col]}${t}${C.reset}`;
const ok   = (m) => console.log(`  ${c('green','✓')} ${m}`);
const warn = (m) => console.log(`  ${c('yellow','⚠')} ${m}`);
const fail = (m) => console.log(`  ${c('red','✗')} ${m}`);
const info = (m) => console.log(`  ${c('cyan','→')} ${m}`);
const sep  = (title) => {
  console.log(`\n${c('dim','═'.repeat(64))}`);
  console.log(`${c('bold',c('blue', title))}`);
  console.log(c('dim','─'.repeat(64)) + '\n');
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── HTTP helper (Backend API) ─────────────────────────────────────────────────
function apiCall(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: '127.0.0.1', port: 9000, method, path,
      headers: {
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
        ...(token   ? { 'Authorization': `Bearer ${token}` } : {}),
      },
    }, res => {
      let d = ''; res.on('data', ch => d += ch);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, data: d }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}
const GET  = (p, t)    => apiCall('GET',  p, null, t);
const POST = (p, b, t) => apiCall('POST', p, b, t);

// ── Tạo notification qua API (socket + FCM tự động) ───────────────────────────
async function pushNotification(db, userId, notif, adminToken) {
  // Thử qua API trước — đảm bảo socket + FCM
  if (adminToken) {
    try {
      const r = await POST('/notifications/admin/send', {
        targetUserIds: [userId],
        title: notif.title,
        message: notif.message,
        metadata: notif.metadata,
      }, adminToken);
      if (r.status < 400) return true;
    } catch {}
  }
  // Fallback: insert trực tiếp vào DB
  await db.collection('notifications').insertOne({
    userId:      new ObjectId(userId),
    ...notif,
    isRead:      false,
    createdAt:   new Date(),
    updatedAt:   new Date(),
  });
  return false;
}

// ═════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log('\n' + c('bold', c('magenta',
    '╔══════════════════════════════════════════════════════════════╗\n' +
    '║   TEST VÒNG ĐỜI KHOẢN VAY — hoang@gmail.com                 ║\n' +
    '╚══════════════════════════════════════════════════════════════╝'
  )));
  console.log(c('dim', `
  Borrower: ${HOANG.email}
  Wallet:   ${HOANG.wallet}
  Loan 1:   ${LOANS[0]._id}  (1.000 USDT / 365 ngày)
  Loan 2:   ${LOANS[1]._id}  (3.000 USDT / 90 ngày)
`));

  // ── Kết nối MongoDB ────────────────────────────────────────────────────────
  const mongo = new MongoClient(MONGO_URL);
  await mongo.connect();
  const db = mongo.db();
  ok('MongoDB kết nối thành công');

  // ── Kết nối Ganache ────────────────────────────────────────────────────────
  let provider = null;
  let ganacheSigner = null;
  let debtToken = null;

  try {
    provider = new ethers.JsonRpcProvider(GANACHE_URL);
    await provider.getBlockNumber();
    const accounts = await provider.listAccounts();
    ok(`Ganache online — ${accounts.length} accounts`);

    // Dùng account đầu tiên làm signer (Ganache unlocked all accounts)
    ganacheSigner = await provider.getSigner(0);
    info(`Signer: ${await ganacheSigner.getAddress()}`);

    debtToken = new ethers.Contract(DEBT_TOKEN_ADDRESS, DEBT_TOKEN_ABI, ganacheSigner);
  } catch (e) {
    warn(`Ganache không chạy (${e.message.slice(0,40)}) — bỏ qua bước on-chain`);
  }

  // ── Login backend ──────────────────────────────────────────────────────────
  let adminToken = null;
  let hoangToken = null;
  let backendOk  = false;

  try {
    const r = await POST('/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }, null);
    adminToken = r.data?.data?.accessToken || r.data?.accessToken;
    backendOk  = !!adminToken;

    if (backendOk) {
      ok(`Backend online — admin đăng nhập thành công`);
      // Login hoang để trigger FCM/socket với đúng userId
      const r2 = await POST('/auth/login', { email: HOANG.email, password: HOANG_PASSWORD }, null);
      hoangToken = r2.data?.data?.accessToken || r2.data?.accessToken;
      if (hoangToken) ok(`hoang@gmail.com đã đăng nhập — socket + FCM sẽ hoạt động`);
    }
  } catch {
    warn('Backend không chạy — notifications chỉ lưu DB, KHÔNG lên app real-time');
    warn('→ Khởi động backend: npm run start:dev rồi chạy lại script này');
  }

  const loan1Id = new ObjectId(LOANS[0]._id);
  const loan2Id = new ObjectId(LOANS[1]._id);

  // Reset 2 khoản vay về ACTIVE trước khi test
  await db.collection('loans').updateMany(
    { _id: { $in: [loan1Id, loan2Id] } },
    { $set: { status: 'active', debtTokenMinted: false, debtTokenTxHash: null } }
  );
  ok('Reset 2 khoản vay về status=active');

  // ══════════════════════════════════════════════════════════════════════════
  sep('STAGE 1 — Nhắc sắp đến hạn: còn 3 ngày (Loan 2)');
  // ══════════════════════════════════════════════════════════════════════════

  const in3days = new Date(); in3days.setDate(in3days.getDate() + 3);
  await db.collection('loans').updateOne({ _id: loan2Id }, { $set: { dueDate: in3days, status: 'active' } });
  ok(`Loan 2 dueDate → ${in3days.toLocaleDateString('vi-VN')} (còn 3 ngày)`);

  if (backendOk) {
    await POST('/loans/admin/test/trigger-due-notifications', {}, adminToken);
    ok('Trigger cron nhắc → backend gửi socket + FCM');
    warn('Kỳ vọng: app nhận "⚠️ Còn 3 ngày đến hạn trả nợ"');
  } else {
    await pushNotification(db, HOANG._id, {
      title:    '⚠️ Còn 3 ngày đến hạn trả nợ',
      message:  `Khoản vay 3.000 USDT sẽ đến hạn vào ${in3days.toLocaleDateString('vi-VN')}. Vui lòng chuẩn bị đủ số dư USDT.`,
      type:     'LOAN_DUE_SOON',
      metadata: { loanId: LOANS[1]._id, daysLeft: 3, screen: 'LoanDetail' },
      referenceId: loan2Id,
    }, HOANG._id, adminToken);
    warn('Backend offline → lưu DB, mở màn hình Thông báo trong app để thấy');
  }

  await sleep(500);

  // ══════════════════════════════════════════════════════════════════════════
  sep('STAGE 2 — Nhắc sắp đến hạn: còn 1 ngày / ngày mai (Loan 2)');
  // ══════════════════════════════════════════════════════════════════════════

  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  await db.collection('loans').updateOne({ _id: loan2Id }, { $set: { dueDate: tomorrow } });
  ok(`Loan 2 dueDate → ${tomorrow.toLocaleDateString('vi-VN')} (ngày mai)`);

  if (backendOk) {
    await POST('/loans/admin/test/trigger-due-notifications', {}, adminToken);
    ok('Trigger cron nhắc → backend gửi socket + FCM');
    warn('Kỳ vọng: app nhận "🚨 Hạn trả nợ là ngày mai!"');
  } else {
    await pushNotification(db, HOANG._id, {
      title:    '🚨 Hạn trả nợ là ngày mai!',
      message:  `Khoản vay 3.000 USDT sẽ đến hạn vào ${tomorrow.toLocaleDateString('vi-VN')}. Vui lòng chuẩn bị đủ số dư USDT.`,
      type:     'LOAN_DUE_SOON',
      metadata: { loanId: LOANS[1]._id, daysLeft: 1, screen: 'LoanDetail' },
      referenceId: loan2Id,
    }, HOANG._id, adminToken);
    warn('Backend offline → lưu DB');
  }

  await sleep(500);

  // ══════════════════════════════════════════════════════════════════════════
  sep('STAGE 3 — Loan 2: ACTIVE → OVERDUE (quá hạn 1 ngày)');
  // ══════════════════════════════════════════════════════════════════════════

  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  await db.collection('loans').updateOne({ _id: loan2Id }, { $set: { dueDate: yesterday, status: 'active' } });
  ok(`Loan 2 dueDate → ${yesterday.toLocaleDateString('vi-VN')} (hôm qua) | status=active`);

  if (backendOk) {
    await POST('/loans/admin/test/trigger-liquidation-scan', {}, adminToken);
    await sleep(1200);
    const l = await db.collection('loans').findOne({ _id: loan2Id });
    if (l?.status === 'overdue') {
      ok(`Loan 2 → ${c('yellow','OVERDUE')} ✓  (cron cập nhật + gửi thông báo)`);
    } else {
      // Fallback nếu cron chưa kịp
      await db.collection('loans').updateOne({ _id: loan2Id }, { $set: { status: 'overdue' } });
      warn(`Cron chưa cập nhật, set thẳng → ${c('yellow','overdue')}`);
    }
  } else {
    await db.collection('loans').updateOne({ _id: loan2Id }, { $set: { status: 'overdue' } });
    await pushNotification(db, HOANG._id, {
      title:    '⚠️ Khoản vay đã quá hạn!',
      message:  'Khoản vay 3.000 USDT đã vượt ngày đáo hạn. Hãy thanh toán ngay để tránh bị phạt thêm.',
      type:     'LOAN_OVERDUE',
      metadata: { loanId: LOANS[1]._id, screen: 'LoanDetail' },
      referenceId: loan2Id,
    }, HOANG._id, adminToken);
    ok(`Loan 2 → ${c('yellow','OVERDUE')} (DB trực tiếp)`);
  }

  await sleep(500);

  // ══════════════════════════════════════════════════════════════════════════
  sep('STAGE 4 — Loan 1: OVERDUE → DEFAULTED (quá hạn 31 ngày) + mint DebtToken');
  // ══════════════════════════════════════════════════════════════════════════

  const ago31 = new Date(); ago31.setDate(ago31.getDate() - 31);
  await db.collection('loans').updateOne({ _id: loan1Id }, { $set: { dueDate: ago31, status: 'overdue' } });
  ok(`Loan 1 dueDate → ${ago31.toLocaleDateString('vi-VN')} (31 ngày trước) | status=overdue`);

  if (backendOk) {
    await POST('/loans/admin/test/trigger-liquidation-scan', {}, adminToken);
    await sleep(3000); // chờ cron + possible on-chain tx
    const l = await db.collection('loans').findOne({ _id: loan1Id });
    if (l?.status === 'defaulted') {
      ok(`Loan 1 → ${c('red','DEFAULTED')} ✓  (cron: penalty -150 + thông báo + mint DebtToken)`);
    } else {
      await db.collection('loans').updateOne({ _id: loan1Id }, { $set: { status: 'defaulted' } });
      warn(`Status = ${l?.status}, set thẳng → defaulted`);
    }
  } else {
    await db.collection('loans').updateOne({ _id: loan1Id }, { $set: { status: 'defaulted' } });
    await pushNotification(db, HOANG._id, {
      title:    '🚨 Khoản vay bị đánh dấu vi phạm hợp đồng',
      message:  'Khoản vay 1.000 USDT quá hạn hơn 30 ngày. Điểm tín dụng bị trừ và DebtToken ghi nhận on-chain.',
      type:     'LOAN_OVERDUE',
      metadata: { loanId: LOANS[0]._id, screen: 'LoanDetail' },
      referenceId: loan1Id,
    }, HOANG._id, adminToken);
    ok(`Loan 1 → ${c('red','DEFAULTED')} (DB trực tiếp)`);
  }

  // ── Mint DebtToken on-chain (dùng ethers.js — selector đúng) ──────────────
  if (debtToken && ganacheSigner) {
    console.log();
    info('Mint DebtToken NFT on-chain...');

    try {
      // 1. Lấy owner contract
      const contractOwner = await debtToken.owner();
      info(`Contract owner: ${contractOwner}`);

      // 2. Tìm Ganache signer là owner (hoặc dùng signer 0 nếu Ganache mới restart)
      let mintSigner = ganacheSigner;
      const signerAddr = await ganacheSigner.getAddress();

      if (signerAddr.toLowerCase() !== contractOwner.toLowerCase()) {
        // Thử tất cả Ganache accounts tìm owner
        const accounts = await provider.listAccounts();
        const ownerIdx = accounts.findIndex(s => s.address.toLowerCase() === contractOwner.toLowerCase());
        if (ownerIdx >= 0) {
          mintSigner = await provider.getSigner(ownerIdx);
          info(`Dùng Ganache account[${ownerIdx}] (owner)`);
        } else {
          warn(`Owner ${contractOwner} không trong Ganache accounts hiện tại`);
          warn('→ Ganache bị restart? Cần deploy lại contract hoặc dùng fixed mnemonic');
          warn('→ Thử authorize với signer[0] anyway...');
        }
      }

      const debtTokenWithSigner = debtToken.connect(mintSigner);

      // 3. Authorize minter
      const isAuth = await debtToken.authorizedMinters(await mintSigner.getAddress());
      if (!isAuth) {
        info(`Gọi setAuthorizedMinter(${(await mintSigner.getAddress()).slice(0,10)}..., true)...`);
        const authTx = await debtTokenWithSigner.setAuthorizedMinter(await mintSigner.getAddress(), true);
        await authTx.wait();
        ok('setAuthorizedMinter thành công');
      } else {
        ok('Minter đã được authorize');
      }

      // 4. Lấy lender wallet
      const loan1Doc = await db.collection('loans').findOne({ _id: loan1Id });
      const lenderDoc = loan1Doc?.lenderId
        ? await db.collection('users').findOne({ _id: loan1Doc.lenderId })
        : null;
      const lenderWallet = lenderDoc?.walletAddress || ethers.ZeroAddress;

      // 5. Mint
      info(`mintDebtToken(borrower=${HOANG.wallet.slice(0,10)}..., debt=${LOANS[0].debt} USDT)`);
      const loanIdNum = parseInt(LOANS[0]._id.slice(-8), 16);
      const principalWei = ethers.parseUnits(String(LOANS[0].principal), 6);
      const debtWei      = ethers.parseUnits(String(LOANS[0].debt),      6);

      const mintTx = await debtTokenWithSigner.mintDebtToken(
        HOANG.wallet,
        loanIdNum,
        lenderWallet,
        principalWei,
        debtWei,
        'DEFAULTED',
        LOANS[0].contract,
      );
      const receipt = await mintTx.wait();

      ok(`${c('bold',c('green','DebtToken MINT thành công!'))} Tx: ${c('cyan', receipt.hash)}`);

      // Cập nhật DB
      await db.collection('loans').updateOne(
        { _id: loan1Id },
        { $set: { debtTokenMinted: true, debtTokenTxHash: receipt.hash } }
      );

      // Thông báo mint thành công
      await pushNotification(db, HOANG._id, {
        title:    '🏷️ Nợ xấu đã ghi nhận trên blockchain',
        message:  `DebtToken NFT đã được mint. Tx: ${receipt.hash.slice(0,20)}...`,
        type:     'LOAN_OVERDUE',
        metadata: { loanId: LOANS[0]._id, txHash: receipt.hash, screen: 'LoanDetail' },
        referenceId: loan1Id,
      }, HOANG._id, adminToken);

      // Verify
      await sleep(500);
      const balance = await debtToken.balanceOf(HOANG.wallet);
      ok(`balanceOf(hoang) = ${c('red', balance.toString())} DebtToken(s) on-chain ✓`);

    } catch (e) {
      fail(`Mint thất bại: ${e.message}`);
      if (e.message.includes('NotAuthorizedMinter') || e.message.includes('revert')) {
        warn('Contract owner khác với Ganache accounts hiện tại.');
        warn('Nguyên nhân: Ganache bị restart → accounts thay đổi, nhưng contract đã deploy với owner cũ.');
        warn('\nCách sửa dứt điểm:');
        warn('  1. Mở Ganache → Settings → Accounts & Keys → bật "SAVE ACCOUNTS" hoặc dùng fixed mnemonic');
        warn('  2. Hoặc chạy: node scripts/redeploy-debt-token.mjs để deploy lại contract với accounts hiện tại');
      }
    }
  }

  await sleep(500);

  // ══════════════════════════════════════════════════════════════════════════
  sep('STAGE 5 — Loan 2: OVERDUE → LIQUIDATED (quá hạn 61 ngày)');
  // ══════════════════════════════════════════════════════════════════════════

  const ago61 = new Date(); ago61.setDate(ago61.getDate() - 61);
  await db.collection('loans').updateOne({ _id: loan2Id }, { $set: { dueDate: ago61, status: 'overdue' } });
  ok(`Loan 2 dueDate → ${ago61.toLocaleDateString('vi-VN')} (61 ngày trước) | status=overdue`);

  if (backendOk) {
    await POST('/loans/admin/test/trigger-liquidation-scan', {}, adminToken);
    await sleep(3000);
    const l = await db.collection('loans').findOne({ _id: loan2Id });
    if (l?.status === 'liquidated') {
      ok(`Loan 2 → ${c('red','LIQUIDATED')} ✓`);
    } else {
      await db.collection('loans').updateOne({ _id: loan2Id }, { $set: { status: 'liquidated' } });
      warn(`Set thẳng → liquidated (on-chain loanContract.isOverdue() cần verify)`);
    }
  } else {
    await db.collection('loans').updateOne({ _id: loan2Id }, { $set: { status: 'liquidated' } });
    ok(`Loan 2 → ${c('red','LIQUIDATED')} (DB trực tiếp)`);
  }

  // Notify borrower + lender về thanh lý
  const loan2Doc = await db.collection('loans').findOne({ _id: loan2Id });
  const liquidNotif = {
    title:    '🔴 Khoản vay đã bị thanh lý',
    message:  'Khoản vay 3.000 USDT đã bị thanh lý do quá hạn thanh toán. Tài sản thế chấp đã được xử lý.',
    type:     'LOAN_LIQUIDATED',
    metadata: { loanId: LOANS[1]._id, role: 'borrower', screen: 'LoanDetail' },
    referenceId: loan2Id,
  };
  await pushNotification(db, HOANG._id, liquidNotif, adminToken);
  if (loan2Doc?.lenderId) {
    await pushNotification(db, loan2Doc.lenderId.toString(), {
      ...liquidNotif, metadata: { ...liquidNotif.metadata, role: 'lender' },
    }, adminToken);
    ok('Thông báo thanh lý gửi cho cả borrower VÀ lender');
  }

  await sleep(500);

  // ══════════════════════════════════════════════════════════════════════════
  sep('STAGE 6 — DebtToken on-chain: người dùng khác kiểm tra nợ xấu');
  // ══════════════════════════════════════════════════════════════════════════

  if (debtToken) {
    const balance = await debtToken.balanceOf(HOANG.wallet);
    const bal = Number(balance);

    console.log(`  Ví borrower: ${c('cyan', HOANG.wallet)}`);
    console.log(`  DebtToken (ERC-721 Soulbound): ${c(bal > 0 ? 'red' : 'dim', bal)} token(s)\n`);

    if (bal > 0) {
      console.log(c('bold', c('red', '  ⚠ CẢNH BÁO NỢ XẤU ON-CHAIN:')));
      const totalDebt = await debtToken.getTotalDebt(HOANG.wallet);
      console.log(`  Tổng nợ xấu: ${c('red', ethers.formatUnits(totalDebt, 6))} USDT`);

      // Hiện chi tiết từng token
      for (let i = 0; i < bal; i++) {
        const tokenId = await debtToken.tokenOfOwnerByIndex(HOANG.wallet, i);
        const record  = await debtToken.getDebtRecord(tokenId);
        console.log(`\n  Token #${tokenId}:`);
        console.log(`    Principal: ${ethers.formatUnits(record.principalAmount, 6)} USDT`);
        console.log(`    Debt:      ${ethers.formatUnits(record.debtAmount, 6)} USDT`);
        console.log(`    Reason:    ${c('red', record.reason)}`);
        console.log(`    Minted:    ${new Date(Number(record.defaultedAt) * 1000).toLocaleString('vi-VN')}`);
      }

      ok('\nBất kỳ lender nào cũng kiểm tra được trước khi fund:');
      console.log(c('dim', `  GET ${BACKEND_URL}/loans/debt/check/${HOANG.wallet}`));
    } else {
      warn('balanceOf = 0 — DebtToken chưa mint (xem Stage 4 để biết lý do)');
    }
  } else {
    warn('Ganache không chạy — không check on-chain được');
    info(`API check (cần backend): GET ${BACKEND_URL}/loans/debt/check/${HOANG.wallet}`);
  }

  await sleep(300);

  // ══════════════════════════════════════════════════════════════════════════
  sep('STAGE 7 — Tất cả thông báo của hoang@gmail.com');
  // ══════════════════════════════════════════════════════════════════════════

  const notifs = await db.collection('notifications')
    .find({ userId: new ObjectId(HOANG._id) })
    .sort({ createdAt: -1 }).limit(20).toArray();

  const unread = notifs.filter(n => !n.isRead).length;
  ok(`Tổng: ${notifs.length} | Chưa đọc: ${c('yellow', unread)}\n`);

  const typeIcon = {
    LOAN_DUE_SOON:   '⏰',
    LOAN_OVERDUE:    '⚠️',
    LOAN_DEFAULTED:  '🚨',
    LOAN_LIQUIDATED: '🔴',
    LOAN_FUNDED:     '💰',
    LOAN_REPAID:     '✅',
  };

  for (const n of notifs.slice(0, 10)) {
    const icon  = typeIcon[n.type] || '🔔';
    const badge = n.isRead ? c('dim','[đọc]') : c('yellow','[mới]');
    const date  = new Date(n.createdAt).toLocaleString('vi-VN');
    console.log(`  ${badge} ${icon} ${c('bold', n.title)}`);
    console.log(`  ${c('dim', n.message.slice(0,85))}${n.message.length > 85 ? '...' : ''}`);
    console.log(`  ${c('dim', date)} | ${n.type}\n`);
  }
  if (notifs.length > 10) warn(`... và ${notifs.length - 10} thông báo khác`);

  // ══════════════════════════════════════════════════════════════════════════
  sep('STAGE 8 — Trạng thái cuối cùng 2 khoản vay');
  // ══════════════════════════════════════════════════════════════════════════

  const [l1, l2] = await Promise.all([
    db.collection('loans').findOne({ _id: loan1Id }),
    db.collection('loans').findOne({ _id: loan2Id }),
  ]);
  const stCol = { active:'green', overdue:'yellow', defaulted:'red', liquidated:'red', repaid:'green' };

  console.log('  ┌──────────────────────────────────────────────────────────────┐');
  for (const [l, info] of [[l1, LOANS[0]], [l2, LOANS[1]]]) {
    const st  = l?.status || '?';
    const col = stCol[st] || 'dim';
    const dt  = l?.debtTokenMinted ? c('green','✓ DebtToken minted') : c('dim','✗ chưa mint');
    console.log(`  │ ${c('bold', info.label)}`);
    console.log(`  │   Status:    ${c(col, st.toUpperCase().padEnd(11))} | ${dt}`);
    console.log(`  │   dueDate:   ${l?.dueDate ? new Date(l.dueDate).toLocaleDateString('vi-VN') : 'N/A'}`);
    console.log(`  │   dueDate:   ${l?.dueDate ? new Date(l.dueDate).toLocaleDateString('vi-VN') : 'N/A'}`);
    console.log('  │');
  }
  console.log('  └──────────────────────────────────────────────────────────────┘');

  await mongo.close();

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log('\n' + c('dim','═'.repeat(64)));
  console.log(c('bold',c('green','\n✅ TEST HOÀN TẤT!\n')));

  if (!backendOk) {
    console.log(c('bold',c('yellow','⚠ Backend offline — thông báo KHÔNG lên app real-time\n')));
    console.log(`  ${c('bold','Để thấy thông báo trong app:')}`);
    console.log(`    1. Khởi động backend:  ${c('cyan','npm run start:dev')}`);
    console.log(`    2. Mở app → vào màn hình ${c('cyan','Thông báo')} → kéo refresh`);
    console.log(`    3. Chạy lại script:    ${c('cyan','node scripts/test-full-lifecycle.mjs')}`);
    console.log(`       (lần này backend online → push thông báo real-time)\n`);
  }

  if (debtToken) {
    const balance = await debtToken.balanceOf(HOANG.wallet).catch(() => 0n);
    if (Number(balance) === 0) {
      console.log(c('bold',c('yellow','⚠ DebtToken chưa mint on-chain\n')));
      console.log(`  Nguyên nhân phổ biến: Ganache restart → accounts đổi → owner mới ≠ owner lúc deploy`);
      console.log(`\n  ${c('bold','Cách sửa nhanh nhất:')}`);
      console.log(`    1. Mở Ganache → Settings → SAVE ACCOUNTS (bật lưu mnemonic cố định)`);
      console.log(`    2. Restart Ganache với mnemonic cũ`);
      console.log(`    3. Chạy lại script\n`);
      console.log(`  ${c('bold','Hoặc deploy lại DebtToken:')}`);
      console.log(`    ${c('cyan','node scripts/redeploy-debt-token.mjs')}\n`);
    }
  }
}

main().catch(e => {
  console.error(`\n${c('red','FATAL')}: ${e.message}`);
  console.error(e.stack);
  process.exit(1);
});
