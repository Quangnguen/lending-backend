# Map Life Backend

<p align="center">
  <img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" />
</p>

<p align="center">
  Backend API cho hệ thống Map Life được xây dựng với NestJS framework
</p>

## 📋 Mô tả dự án

Map Life Backend là một RESTful API được phát triển bằng NestJS, TypeScript và MongoDB. Hệ thống cung cấp các tính năng chia sẻ khoảng khắc và nhiều tính năng khác cho ứng dụng chia sẻ vị trí hành trình.

### ✨ Tính năng chính

- 🔐 **Xác thực và phân quyền**: JWT, Google OAuth, 2FA
- 💳 **Thanh toán**: Tích hợp VNPay, MoMo, ZaloPay
- 📧 **Email**: Gửi email thông báo, xác thực
- 💬 **Chat**: WebSocket real-time chat, chatbot AI
- 📊 **Dashboard**: Thống kê, báo cáo
- 🌐 **File Upload**: Cloudinary, AWS S3/R2
- 🚦 **Rate Limiting**: Redis-based throttling
- 📝 **Logging**: Morgan logging với file rotation

## 🛠️ Công nghệ sử dụng

- **Framework**: NestJS 11.x
- **Language**: TypeScript
- **Database**: MongoDB với Mongoose
- **Cache**: Redis
- **Authentication**: JWT, Passport
- **File Storage**: Cloudinary, AWS S3/R2
- **Email**: Nodemailer
- **WebSocket**: Socket.IO
- **AI**: Google Gemini, OpenAI
- **Process Manager**: PM2
- **Documentation**: Swagger/OpenAPI

## 📦 Cài đặt

### Yêu cầu hệ thống

- Node.js >= 18.x
- npm >= 9.x
- MongoDB >= 5.x
- Redis >= 6.x

### 1. Clone repository

```bash
git clone <repository-url>
cd map-life-backend
```

### 2. Cài đặt dependencies

```bash
npm install --force
```

### 3. Cấu hình môi trường

Sao chép file `.env.example` thành `.env` và cập nhật các giá trị:

```bash
cp .env.example .env
```

Chỉnh sửa file `.env` với thông tin cấu hình của bạn:

```env
# Config app
PORT=9000
NODE_ENV=development
TZ=Asia/Ho_Chi_Minh
FRONTEND_DOMAIN=http://localhost:3000
SOCKET_URL=http://localhost:3000

# Config database
DATABASE_TYPE=mongodb
DATABASE_HOST=localhost
DATABASE_PORT=27017
DATABASE_NAME=base
DATABASE_USERNAME=admin
DATABASE_PASSWORD=your_password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Auth
AUTH_ACCESS_SECRET=your_access_secret
AUTH_REFRESH_SECRET=your_refresh_secret
# ... các cấu hình khác
```

## 🚀 Chạy ứng dụng

### Development mode

```bash
# Chạy với watch mode (tự động restart khi có thay đổi)
npm run start:dev

# Hoặc chạy bình thường
npm run start
```

### Production mode

```bash
# Build ứng dụng
npm run build

# Chạy production
npm run start:prod
```

### Sử dụng PM2 (Production)

```bash
# Cài đặt PM2 globally
npm install -g pm2

# Build ứng dụng
npm run build

# Chạy với PM2
pm2 start ecosystem.config.js

# Các lệnh PM2 hữu ích
pm2 status          # Xem trạng thái
pm2 logs            # Xem logs
pm2 restart all     # Restart tất cả
pm2 stop all        # Dừng tất cả
pm2 delete all      # Xóa tất cả process
```
