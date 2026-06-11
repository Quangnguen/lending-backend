/**
 * ============================================================
 * DIRECT MINT — Gọi thẳng DebtToken.mintDebtToken() trên Ganache
 * ============================================================
 * Không cần backend chạy. Không cần ORACLE_PRIVATE_KEY đúng.
 * Dùng Ganache unlocked accounts để ký transaction trực tiếp.
 *
 * Cách chạy:
 *   node scripts/direct-mint-debt-token.mjs <borrower-wallet>
 *
 * Ví dụ:
 *   node scripts/direct-mint-debt-token.mjs 0xAbc123...
 *
 * Nếu không truyền wallet, script sẽ dùng accounts[1] của Ganache
 * làm borrower (simulate test).
 * ============================================================
 */

import http from 'http';

const GANACHE_URL        = 'http://127.0.0.1:7545';
const DEBT_TOKEN_ADDRESS = '0x52804627e04f4e3593869Ec5d83950277ad6F2cD';

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m',
  cyan: '\x1b[36m', blue: '\x1b[34m',
};
const c    = (col, t) => `${C[col]}${t}${C.reset}`;
const ok   = (m) => console.log(`  ${c('green','✓')} ${m}`);
const warn = (m) => console.log(`  ${c('yellow','⚠')} ${m}`);
const err  = (m) => console.log(`  ${c('red','✗')} ${m}`);
const info = (m) => console.log(`  ${c('cyan','→')} ${m}`);

// ─── JSON-RPC ─────────────────────────────────────────────────────────────────
function rpc(method, params = []) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: '2.0', method, params, id: Date.now() });
    const u = new URL(GANACHE_URL);
    const req = http.request({
      hostname: u.hostname, port: u.port || 7545, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let d = '';
      res.on('data', ch => d += ch);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch { resolve({ result: null, error: { message: 'parse error' } }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── ABI ENCODE ───────────────────────────────────────────────────────────────
function padL(hex, bytes = 32) { return hex.replace('0x','').padStart(bytes*2,'0'); }
function encAddr(a)    { return padL(a.toLowerCase().replace('0x','')); }
function encUint(n)    { return padL(BigInt(n).toString(16)); }
function encBool(v)    { return padL(v ? '1' : '0'); }
function encStr(s)    {
  // encode string: offset(32) + length(32) + data(ceil(len/32)*32)
  const buf  = Buffer.from(s, 'utf8');
  const len  = buf.length;
  const pad  = Math.ceil(len / 32) * 32;
  const data = buf.toString('hex').padEnd(pad * 2, '0');
  return encUint(len) + data;
}

function encodeSetAuthorizedMinter(minterAddr, enabled) {
  // setAuthorizedMinter(address,bool) — selector 0x522ae032
  return '0x522ae032' + encAddr(minterAddr) + encBool(enabled);
}

function encodeMintDebtToken(borrower, loanId, lender, principal, debt, reason, loanContract) {
  // mintDebtToken(address,uint256,address,uint256,uint256,string,address)
  // selector cần tính keccak256 — ta dùng selector đã biết từ ABI
  // Tính: keccak256("mintDebtToken(address,uint256,address,uint256,uint256,string,address)")
  // = 0x7e71e74b (đã tính sẵn)
  const selector = '0x7e71e74b';

  // Dynamic: string ở vị trí 6 (index 5)
  // Offset của string = 7 * 32 = 224 = 0xe0
  const head = [
    encAddr(borrower),    // [0] address borrower
    encUint(loanId),      // [1] uint256 loanId
    encAddr(lender),      // [2] address lender
    encUint(principal),   // [3] uint256 principalAmount
    encUint(debt),        // [4] uint256 debtAmount
    encUint(7 * 32),      // [5] offset of string (7 params * 32 = 0xe0)
    encAddr(loanContract),// [6] address loanContract
  ].join('');

  const tail = encStr(reason);

  return selector + head + tail;
}

async function ethCall(to, data) {
  const res = await rpc('eth_call', [{ to, data }, 'latest']);
  return res.result;
}

async function sendTx(from, to, data) {
  // Ganache unlocks all accounts, no need for private key
  const nonceRes = await rpc('eth_getTransactionCount', [from, 'latest']);
  const gpRes = await rpc('eth_gasPrice');

  let gasLimit = '0x100000';
  try {
    const est = await rpc('eth_estimateGas', [{ from, to, data }]);
    if (est.result) gasLimit = '0x' + Math.ceil(parseInt(est.result, 16) * 1.3).toString(16);
  } catch {}

  const txRes = await rpc('eth_sendTransaction', [{
    from, to, data,
    gas: gasLimit,
    gasPrice: gpRes.result || '0x1',
    nonce: nonceRes.result,
  }]);

  if (txRes.error) throw new Error(txRes.error.message);
  return txRes.result;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ═════════════════════════════════════════════════════════════════════════════
async function main() {
  const borrowerArg = process.argv[2];

  console.log('\n' + c('bold', c('blue','╔════════════════════════════════════════════╗')));
  console.log(       c('bold', c('blue','║   DIRECT MINT DebtToken NFT via Ganache    ║')));
  console.log(       c('bold', c('blue','╚════════════════════════════════════════════╝\n')));

  // ── Kết nối Ganache ──────────────────────────────────────────────────────
  info('Kết nối Ganache...');
  let accounts;
  try {
    const res = await rpc('eth_accounts');
    accounts = res.result;
    if (!accounts?.length) throw new Error('No accounts');
  } catch {
    err(`Không kết nối được Ganache tại ${GANACHE_URL}`);
    err('Khởi động Ganache trước khi chạy script này.');
    process.exit(1);
  }
  ok(`Ganache online — ${accounts.length} accounts`);

  // ── Xác định deployer (owner contract) ───────────────────────────────────
  const ownerData = '0x8da5cb5b'; // owner()
  const ownerRes  = await ethCall(DEBT_TOKEN_ADDRESS, ownerData);
  const owner     = '0x' + (ownerRes || '0'.repeat(64)).slice(-40);
  info(`DebtToken owner: ${c('cyan', owner)}`);

  const ownerAcc = accounts.find(a => a.toLowerCase() === owner.toLowerCase()) || accounts[0];
  ok(`Deployer account: ${c('cyan', ownerAcc)}`);

  // ── Xác định borrower ────────────────────────────────────────────────────
  const borrower = borrowerArg || accounts[1]; // dùng accounts[1] nếu không truyền arg
  const lender   = accounts[2] || accounts[0];

  console.log(c('bold', '\n  Tham số mint:'));
  console.log(`  Borrower:      ${c('cyan', borrower)}`);
  console.log(`  Lender:        ${c('dim',  lender)}`);
  console.log(`  DebtToken:     ${c('dim',  DEBT_TOKEN_ADDRESS)}`);

  if (borrowerArg) {
    ok('Dùng wallet address từ command line arg.');
  } else {
    warn(`Không truyền wallet → dùng accounts[1] = ${accounts[1]} (để test).`);
    warn('Để test với hoang@gmail.com: truyền wallet address của user đó.');
  }

  // ── Step 1: Authorize minter (ownerAcc gọi setAuthorizedMinter) ──────────
  console.log(c('bold', '\n  [1/4] Authorize minter...\n'));

  const checkData = '0x338d7e2e' + encAddr(ownerAcc); // authorizedMinters(address)
  const isMinterRaw = await ethCall(DEBT_TOKEN_ADDRESS, checkData);
  const alreadyMinter = isMinterRaw && isMinterRaw !== ('0x' + '0'.repeat(64));

  if (alreadyMinter) {
    ok(`${ownerAcc} đã là minter — bỏ qua`);
  } else {
    info(`Gọi setAuthorizedMinter(${ownerAcc}, true)...`);
    try {
      const txHash = await sendTx(ownerAcc, DEBT_TOKEN_ADDRESS, encodeSetAuthorizedMinter(ownerAcc, true));
      ok(`Tx: ${c('cyan', txHash)}`);
      await sleep(800);
    } catch (e) {
      err(`setAuthorizedMinter thất bại: ${e.message}`);
      warn('Có thể ownerAcc không phải owner contract. Thử accounts[0]...');
      try {
        await sendTx(accounts[0], DEBT_TOKEN_ADDRESS, encodeSetAuthorizedMinter(ownerAcc, true));
        ok('Thử với accounts[0]: OK');
      } catch (e2) {
        err(`Vẫn thất bại: ${e2.message}`);
        warn('Contract có thể chưa deploy tại địa chỉ này.');
        warn(`Kiểm tra: DEBT_TOKEN_ADDRESS = ${DEBT_TOKEN_ADDRESS}`);
      }
    }
  }

  // ── Step 2: Mint DebtToken ────────────────────────────────────────────────
  console.log(c('bold', '\n  [2/4] Mint DebtToken NFT...\n'));

  const loanId    = 1;                    // fake loanId cho test
  const principal = BigInt('100') * BigInt(10 ** 6); // 100 USDT (6 decimals)
  const debt      = BigInt('120') * BigInt(10 ** 6); // 120 USDT (gốc + lãi)
  const reason    = 'DEFAULTED';
  const loanCtrt  = '0x0000000000000000000000000000000000000000'; // no contract

  const mintData = encodeMintDebtToken(
    borrower,
    loanId,
    lender,
    principal,
    debt,
    reason,
    loanCtrt,
  );

  info(`Gọi mintDebtToken(borrower=${borrower.slice(0,10)}...) từ ${ownerAcc.slice(0,10)}...`);

  let mintTxHash;
  try {
    mintTxHash = await sendTx(ownerAcc, DEBT_TOKEN_ADDRESS, mintData);
    ok(`${c('bold', c('green','Mint thành công!'))} Tx: ${c('cyan', mintTxHash)}`);
    await sleep(1500);
  } catch (e) {
    err(`Mint thất bại: ${e.message}`);

    // Decode lỗi phổ biến
    if (e.message.includes('NotAuthorizedMinter')) {
      warn('→ Wallet này chưa phải authorized minter.');
      warn('  Chạy setAuthorizedMinter thủ công bằng Ganache console.');
    } else if (e.message.includes('revert')) {
      warn('→ Contract revert. Kiểm tra:');
      warn('  1. borrower address hợp lệ (không phải 0x0)');
      warn('  2. Contract đúng địa chỉ');
    }
    process.exit(1);
  }

  // ── Step 3: Verify balanceOf ──────────────────────────────────────────────
  console.log(c('bold', '\n  [3/4] Verify on-chain...\n'));

  // balanceOf(address): selector 0x70a08231
  const balData = '0x70a08231' + encAddr(borrower);
  const balRes  = await ethCall(DEBT_TOKEN_ADDRESS, balData);
  const balance = parseInt(balRes || '0x0', 16);

  if (balance > 0) {
    ok(`${c('bold', c('green', `balanceOf(${borrower.slice(0,10)}...) = ${balance}`))}`);
    ok('DebtToken NFT đã được ghi nhận trên blockchain!');
  } else {
    warn(`balanceOf = 0. Tx có thể chưa confirm xong.`);
    warn(`Tx hash: ${mintTxHash}`);
  }

  // ── Step 4: Lấy thông tin token vừa mint ─────────────────────────────────
  console.log(c('bold', '\n  [4/4] Thông tin DebtToken:\n'));

  // tokenOfOwnerByIndex(borrower, 0): selector 0x2f745c59
  const tokenIdxData = '0x2f745c59' + encAddr(borrower) + encUint(balance - 1);
  const tokenIdRes   = await ethCall(DEBT_TOKEN_ADDRESS, tokenIdxData);
  const tokenId      = tokenIdRes ? parseInt(tokenIdRes, 16) : null;

  if (tokenId != null && tokenId > 0) {
    ok(`Token ID: ${c('yellow', tokenId)}`);

    // getDebtRecord(tokenId): selector 0x7d5f3bb2
    const recData = '0x7d5f3bb2' + encUint(tokenId);
    const recRes  = await ethCall(DEBT_TOKEN_ADDRESS, recData);

    if (recRes && recRes.length > 10) {
      // Decode ABI-encoded struct
      const hex = recRes.replace('0x', '');
      const decodedLoanId  = parseInt(hex.slice(0, 64), 16);
      const decodedBorrower = '0x' + hex.slice(64 + 24, 128);  // address (20 bytes, padded)
      const decodedPrincipal = parseInt(hex.slice(256, 320), 16) / 1e6;
      const decodedDebt      = parseInt(hex.slice(320, 384), 16) / 1e6;
      const decodedAt        = parseInt(hex.slice(384, 448), 16);

      console.log(c('bold', '  ┌─────────────────────────────────────────┐'));
      console.log(c('bold', '  │         DebtToken Record On-Chain       │'));
      console.log(c('bold', '  ├─────────────────────────────────────────┤'));
      console.log(`  │ Token ID:     ${c('yellow', tokenId)}`);
      console.log(`  │ Loan ID:      ${decodedLoanId}`);
      console.log(`  │ Principal:    ${c('red', decodedPrincipal + ' USDT')}`);
      console.log(`  │ Debt Amount:  ${c('red', decodedDebt + ' USDT')}`);
      console.log(`  │ Reason:       ${c('red', reason)}`);
      if (decodedAt > 0) {
        console.log(`  │ Defaulted At: ${new Date(decodedAt * 1000).toLocaleString('vi-VN')}`);
      }
      console.log(c('bold', '  └─────────────────────────────────────────┘'));
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n' + c('dim','─'.repeat(60)));
  console.log(c('bold', c('green', '\n✅ Mint NFT hoàn tất!\n')));
  console.log(c('bold', 'Người dùng khác có thể kiểm tra on-chain:'));
  console.log(c('dim', `  Ganache RPC (balanceOf):
    curl -X POST ${GANACHE_URL} \\
      -H 'Content-Type: application/json' \\
      -d '{"jsonrpc":"2.0","method":"eth_call","params":[{"to":"${DEBT_TOKEN_ADDRESS}","data":"0x70a08231${encAddr(borrower)}"},"latest"],"id":1}'
  `));
  console.log(c('dim', `  Backend API:
    GET ${('http://localhost:9000')}/loans/debt/check/${borrower}
  `));
  console.log(c('bold', `  → Ai có địa chỉ ví của borrower đều verify được nợ xấu này!\n`));
}

main().catch(e => {
  console.error(`\n${c('red','FATAL')}: ${e.message}`);
  process.exit(1);
});
