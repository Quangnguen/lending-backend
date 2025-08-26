# HƯỚng dẫn cài đặt và chạy mongodump để dump dữ liệu

## 1. Cài đặt công cụ mongodump

`mongodump` là một phần của gói `mongodb-org-tools`. Dưới đây là các bước để cài đặt trên Ubuntu:

### Bước 1: Thêm khóa công khai (public key) của MongoDB

Chạy các lệnh sau:

```bash
sudo apt-get install gnupg curl
curl -fsSL https://pgp.mongodb.com/server-7.0.asc | \
   sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg \
   --dearmor
```

### Bước 2: Tạo file danh sách nguồn (source list) cho MongoDB

```bash
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
```

> **Lưu ý:** Nếu dùng Ubuntu 20.04, thay `jammy` bằng `focal`.

### Bước 3: Cập nhật danh sách gói và cài đặt `mongodb-org-tools`

```bash
sudo apt-get update
sudo apt install mongodb-org-tools
```

### Kiểm tra cài đặt

```bash
mongodump --version
```

## 2. Chuẩn bị file `.env`

### Bước 1: Tạo thư mục làm việc

```bash
mkdir ~/mongo_backup
cd ~/mongo_backup
```

### Bước 2: Tạo file `.env`

```bash
nano .env
```

Thêm nội dung sau:

```bash
SOURCE_HOST=192.168.100.160
SOURCE_PORT=30000
SOURCE_USERNAME=admin
SOURCE_PASSWORD=Admin123
SOURCE_DATABASE=maplife
```

### Bước 3: Kiểm tra file `.env`

```bash
ls -l .env
```

## 3. Tạo và cấu hình script `dump.sh`

### Bước 1: Tạo file `dump.sh`

```bash
nano dump.sh
```

Dán nội dung sau:

```bash
#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: File $ENV_FILE not found!"
  exit 1
fi

set -a
. "$ENV_FILE"
set +a

OUTPUT_DIR="$SCRIPT_DIR/data/"
TIMESTAMP=$(date +"%d-%m-%Y_%H-%M-%S")
OUTPUT_FILE="$OUTPUT_DIR$SOURCE_DATABASE-$TIMESTAMP.archive"

mkdir -p "$OUTPUT_DIR"
if [ $? -ne 0 ]; then
  echo "Error: Could not create directory $OUTPUT_DIR."
  exit 1
fi

AUTH_PARAMS=""
if [ -n "$SOURCE_USERNAME" ] && [ -n "$SOURCE_PASSWORD" ]; then
  AUTH_PARAMS="--username $SOURCE_USERNAME --password $SOURCE_PASSWORD --authenticationDatabase admin"
fi

echo "Dumping database with the following parameters:"
echo "Host: $SOURCE_HOST"
echo "Port: $SOURCE_PORT"
echo "Database: $SOURCE_DATABASE"
echo "Output: $OUTPUT_FILE"

tar -czf "$OUTPUT_FILE" --absolute-names "$OUTPUT_DIR"

mongodump \
  --host "$SOURCE_HOST" \
  --port "$SOURCE_PORT" \
  $AUTH_PARAMS \
  --db "$SOURCE_DATABASE" \
  --gzip \
  --archive="$OUTPUT_FILE"

if [ $? -eq 0 ]; then
  echo "Database $SOURCE_DATABASE dumped successfully to $OUTPUT_FILE"
else
  echo "Error: Failed to dump database $SOURCE_DATABASE"
  exit 1
fi
```

### Bước 2: Cấp quyền thực thi

```bash
chmod +x dump.sh
```

## 4. Chạy script để dump dữ liệu

### Bước 1: Đảm bảo cấu trúc thư mục

```
~/mongo_backup/
├── dump.sh
├── .env
```

### Bước 2: Chạy script

```bash
./dump.sh
```

Output mong đợi:

```text
Dumping database with the following parameters:
Host: 192.168.100.160
Port: 30000
Database: maplife
Output: /home/ubuntu/mongo_backup/data/maplife-26-03-2025_14-30-45.archive
Auth: --username admin --password Admin123 --authenticationDatabase admin
Database maplife dumped successfully to /home/ubuntu/mongo_backup/data/maplife-26-03-2025_14-30-45.archive
```

### Bước 3: Kiểm tra file dump

```bash
ls -l ~/mongo_backup/data/
```

## 5. Xử lý lỗi (nếu có)

- **Lỗi `.env not found`**: Kiểm tra file `.env` nằm cùng thư mục với `dump.sh`
  ```bash
  ls -l ~/mongo_backup/.env
  ```
- **Lỗi `MongoDB Unauthorized`**: Kiểm tra username, password, host, port trong `.env`.
- **Lỗi quyền thư mục**: Kiểm tra quyền ghi
  ```bash
  ls -ld ~/mongo_backup
  chmod u+rwx ~/mongo_backup
  ```
