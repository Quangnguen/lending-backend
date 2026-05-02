# P2P Lending Backend (Lending-BE)

API server cho nền tảng cho vay ngang hàng (Peer-to-Peer Lending) với tích hợp blockchain.

## 🏗️ Kiến Trúc

```
NestJS Backend ↔ MongoDB (Dữ liệu off-chain)
      ↕
Ethereum Blockchain (Smart Contracts - Ganache/Sepolia)
      ↕
React Native Mobile App
```

## 🛠️ Tech Stack

- **Framework**: NestJS (Node.js)
- **Database**: MongoDB + Mongoose
- **Cache**: Redis (Throttle, Session)
- **Blockchain**: ethers.js v6 + Ganache
- **Authentication**: JWT (Access + Refresh tokens)
- **File Storage**: Cloudinary
- **Email**: SMTP (Gmail)
- **API Docs**: Swagger UI
- **Scheduling**: @nestjs/schedule (Cron jobs)

## 📁 Cấu Trúc Dự Án

```
src/
├── components/           # Feature modules
│   ├── auth/             # Đăng ký, Đăng nhập, OTP
│   ├── user/             # Quản lý người dùng
│   ├── kyc/              # eKYC (FPT.AI integration)
│   ├── loan/             # Quản lý khoản vay
│   ├── blockchain/       # Kết nối blockchain, Event listener
│   ├── credit/           # Credit scoring (Open Banking)
│   ├── openbanking/      # VietQR + Mock banking services
│   ├── file/             # Upload & quản lý file (Cloudinary)
│   ├── mail/             # Gửi email (SMTP)
│   ├── cron/             # Scheduled tasks (sync blockchain, check overdue)
│   └── contact/          # Liên hệ
├── config/               # App, Auth, Database, OpenBanking config
├── constant/             # Enums + Constants
├── core/                 # Guards, Pipes, Filters, Middlewares
├── database/
│   ├── schemas/          # Mongoose models (20+ schemas)
│   └── repository/       # Base repository pattern
├── helpers/              # Utility helpers
├── i18n/                 # Internationalization (vi, en)
├── utils/                # Common utilities
└── views/                # EJS templates (email)
```

## 🚀 Cài Đặt & Chạy

### 1. Yêu cầu
- Node.js >= 18
- MongoDB (local hoặc Atlas)
- Redis
- Ganache (cho blockchain development)

### 2. Cài đặt
```bash
npm install
```

### 3. Cấu hình `.env`
```env
# App
PORT=9000
NODE_ENV=development

# Database
DATABASE_URL=mongodb://localhost:27017/lendingP2P

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Auth
AUTH_ACCESS_SECRET=your-secret
AUTH_ACCESS_TOKEN_EXPIRES_IN=7d

# Blockchain
BLOCKCHAIN_RPC_URL=http://127.0.0.1:7545
BLOCKCHAIN_CHAIN_ID=1337
P2P_LENDING_ADDRESS=0x...    # Deploy contract rồi copy address
MOCKUSDT_ADDRESS=0x...

# KYC
FPT_AI_API_KEY=your-api-key

# Email
SEND_MAIL_USERNAME=your@gmail.com
SEND_MAIL_PASSWORD=your-app-password
```

### 4. Chạy
```bash
# Development
npm run start:dev

# Production
npm run build
npm run start:prod
```

### 5. API Docs
Truy cập: `http://localhost:9000/api/swagger-docs`

## 📋 API Endpoints Chính

### Auth
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| POST | `/api/auth/register` | Đăng ký |
| POST | `/api/auth/login` | Đăng nhập |
| POST | `/api/auth/verify-otp` | Xác thực OTP |

### Loans
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| POST | `/api/loans/requests` | Tạo yêu cầu vay |
| GET | `/api/loans/requests` | DS yêu cầu vay của tôi |
| GET | `/api/loans/requests/pending` | DS marketplace (cho lender) |
| POST | `/api/loans/requests/:id/fund` | Cấp vốn |
| POST | `/api/loans/:id/repay` | Trả nợ |
| GET | `/api/loans/stats` | Thống kê (admin) |

### Blockchain
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/loans/blockchain/status` | Trạng thái kết nối blockchain |
| GET | `/api/loans/blockchain/loan/:address` | On-chain status khoản vay |
| GET | `/api/loans/blockchain/tx/:txHash` | Verify giao dịch |
| POST | `/api/loans/blockchain/sync-all` | Đồng bộ toàn bộ |

### KYC
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| POST | `/api/kyc/ocr-id-card` | OCR CMND/CCCD (FPT.AI) |
| POST | `/api/kyc/face-match` | Face matching |
| POST | `/api/kyc/verify` | Submit verification |

## ⚙️ Blockchain Integration

### Event Listener
Backend tự động lắng nghe các events từ smart contracts:
- `LoanRequestCreated` — Yêu cầu vay mới trên blockchain
- `LoanMatched` — Khoản vay được cấp vốn
- `LoanRepaid` — Đã trả nợ
- `LoanLiquidated` — Tài sản bị thanh lý

### Cron Jobs
| Job | Tần suất | Mô tả |
|-----|----------|-------|
| `syncBlockchainLoans` | 5 phút | Đồng bộ on-chain → MongoDB |
| `checkOverdueLoans` | 30 phút | Kiểm tra khoản vay quá hạn |
| `logBlockchainHealth` | 1 giờ | Health check blockchain |

## 🧪 Testing

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Coverage
npm run test:cov
```

## 📝 Lưu Ý

1. **Ganache** phải chạy trước khi start Backend để blockchain connected
2. Deploy smart contracts trước, copy addresses vào `.env`
3. Redis phải chạy cho throttle guard hoạt động
4. FPT_AI_API_KEY cần đăng ký tại https://fpt.ai
