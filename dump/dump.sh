#!/bin/bash

# Lấy đường dẫn thư mục chứa file dump.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Đường dẫn đến file .env (cùng thư mục với dump.sh)
ENV_FILE="$SCRIPT_DIR/.env"

# Kiểm tra xem file .env có tồn tại không
if [ ! -f "$ENV_FILE" ]; then
  echo "Error: File $ENV_FILE not found!"
  exit 1
fi

# Đọc các biến từ file .env
set -a
. "$ENV_FILE"
set +a

# Đặt OUTPUT_DIR là thư mục 'data' trong SCRIPT_DIR
OUTPUT_DIR="$SCRIPT_DIR/data/"

# --- THÊM PHẦN XÓA FILE CŨ TRONG THƯ MỤC DATA ---
if [ -d "$OUTPUT_DIR" ]; then
  echo "Cleaning up existing files in $OUTPUT_DIR..."
  rm -f "$OUTPUT_DIR"*  # Xóa tất cả file trong thư mục
  if [ $? -ne 0 ]; then
    echo "Warning: Could not delete files in $OUTPUT_DIR (check permissions)"
  fi
fi

# Tạo tên file với định dạng ngày-tháng-năm_giờ-phút-giây
TIMESTAMP=$(date +"%d-%m-%Y_%H-%M-%S")
OUTPUT_FILE="$OUTPUT_DIR$SOURCE_DATABASE-$TIMESTAMP.archive"

# Đảm bảo OUTPUT_DIR kết thúc bằng dấu /
case "$OUTPUT_DIR" in
  */) ;;
  *) OUTPUT_DIR="$OUTPUT_DIR/";;
esac

# Tạo thư mục 'data' nếu chưa tồn tại
mkdir -p "$OUTPUT_DIR"
if [ $? -ne 0 ]; then
  echo "Error: Could not create directory $OUTPUT_DIR. Please check permissions."
  exit 1
fi

# Authentication parameters (optional)
AUTH_PARAMS=""
if [ -n "$SOURCE_USERNAME" ] && [ -n "$SOURCE_PASSWORD" ]; then
  AUTH_PARAMS="--username $SOURCE_USERNAME --password $SOURCE_PASSWORD --authenticationDatabase admin"
else
  echo "Warning: Username or password not set in $ENV_FILE"
fi

# In thông tin để debug
echo "Dumping database with the following parameters:"
echo "Host: $SOURCE_HOST"
echo "Port: $SOURCE_PORT"
echo "Database: $SOURCE_DATABASE"
echo "Output: $OUTPUT_FILE"
echo "Auth: $AUTH_PARAMS"

# Dump the source database
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
