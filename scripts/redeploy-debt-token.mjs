/**
 * Deploy lại DebtToken contract với Ganache accounts hiện tại
 * Tự động cập nhật DEBT_TOKEN_ADDRESS trong .env
 *
 *   node scripts/redeploy-debt-token.mjs
 */

import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE  = path.join(__dirname, '..', '.env');

const GANACHE_URL = 'http://127.0.0.1:7545';

// DebtToken bytecode + ABI — lấy từ artifacts nếu có, hoặc compile inline
// Dùng hardhat artifacts nếu có
const ARTIFACTS_DIR = path.join(__dirname, '..', '..', 'lending-contracts', 'artifacts', 'contracts', 'token', 'DebtToken.sol');

const C = { reset:'\x1b[0m', bold:'\x1b[1m', green:'\x1b[32m', yellow:'\x1b[33m', red:'\x1b[31m', cyan:'\x1b[36m' };
const c  = (col, t) => `${C[col]}${t}${C.reset}`;
const ok   = m => console.log(`  ${c('green','✓')} ${m}`);
const warn = m => console.log(`  ${c('yellow','⚠')} ${m}`);
const info = m => console.log(`  ${c('cyan','→')} ${m}`);
const fail = m => console.log(`  ${c('red','✗')} ${m}`);

function updateEnv(key, value) {
  let content = fs.readFileSync(ENV_FILE, 'utf8');
  const regex = new RegExp(`^${key}=.*$`, 'm');
  content = regex.test(content)
    ? content.replace(regex, `${key}=${value}`)
    : content + `\n${key}=${value}`;
  fs.writeFileSync(ENV_FILE, content, 'utf8');
}

async function main() {
  console.log('\n' + c('bold',c('cyan','╔══════════════════════════════════════════╗')));
  console.log(       c('bold',c('cyan','║   Redeploy DebtToken Contract            ║')));
  console.log(       c('bold',c('cyan','╚══════════════════════════════════════════╝\n')));

  // Kết nối Ganache
  const provider = new ethers.JsonRpcProvider(GANACHE_URL);
  try { await provider.getBlockNumber(); } catch {
    fail('Ganache không chạy tại ' + GANACHE_URL);
    process.exit(1);
  }
  ok('Ganache kết nối thành công');

  const deployer = await provider.getSigner(0);
  const deployerAddr = await deployer.getAddress();
  info(`Deployer: ${deployerAddr}`);

  // Cập nhật ORACLE_PRIVATE_KEY trong .env bằng cách lấy private key từ Ganache
  // Ganache accounts[0] có private key hardcoded khi dùng --deterministic flag
  // Mnemonic mặc định Ganache: "test test test test test test test test test test test junk"
  // account[0] private key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

  // Load artifacts từ hardhat compile
  const artifactPath = path.join(ARTIFACTS_DIR, 'DebtToken.json');
  if (!fs.existsSync(artifactPath)) {
    warn('Không tìm thấy artifact tại: ' + artifactPath);
    warn('Hãy compile contract trước:');
    warn('  cd lending-contracts && npx hardhat compile');
    process.exit(1);
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  const factory  = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer);

  info('Deploying DebtToken...');
  const contract = await factory.deploy(deployerAddr);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  ok(`DebtToken deployed tại: ${c('cyan', address)}`);

  // Authorize deployer làm minter ngay
  const tx = await contract.setAuthorizedMinter(deployerAddr, true);
  await tx.wait();
  ok(`setAuthorizedMinter(${deployerAddr.slice(0,10)}..., true) ✓`);

  // Cập nhật .env
  updateEnv('DEBT_TOKEN_ADDRESS', address);
  ok(`.env cập nhật: DEBT_TOKEN_ADDRESS=${address}`);

  // Lấy private key của deployer (Ganache deterministic)
  const knownKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
  updateEnv('ORACLE_PRIVATE_KEY', knownKey);
  ok(`.env cập nhật: ORACLE_PRIVATE_KEY (Ganache deterministic account[0])`);

  console.log(`\n${c('bold',c('green','✅ Xong!\n'))}`);
  console.log(`  ${c('bold','Bước tiếp theo:')}`);
  console.log(`    1. Restart backend: ${c('cyan','Ctrl+C → npm run start:dev')}`);
  console.log(`    2. Chạy test:       ${c('cyan','node scripts/test-full-lifecycle.mjs')}\n`);
  console.log(`  ${c('yellow','Lưu ý:')} Script này dùng Ganache deterministic mnemonic.`);
  console.log(`  Nếu Ganache dùng mnemonic khác, private key account[0] sẽ khác.`);
  console.log(`  → Bật Ganache với: ${c('cyan','ganache --deterministic')}\n`);
}

main().catch(e => {
  fail(e.message);
  process.exit(1);
});
