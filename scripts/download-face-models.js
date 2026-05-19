/**
 * Script tải face-api.js models về thư mục /models/face-api
 * Chạy 1 lần duy nhất: node scripts/download-face-models.js
 */
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const MODELS_DIR = path.join(__dirname, '..', 'models', 'face-api');

// Model files từ vladmandic/face-api (GitHub raw)
const BASE_URL =
  'https://raw.githubusercontent.com/vladmandic/face-api/master/model/';

const MODEL_FILES = [
  // Face Detection (SSD MobileNet)
  'ssd_mobilenetv1_model-weights_manifest.json',
  'ssd_mobilenetv1_model-shard1',
  'ssd_mobilenetv1_model-shard2',

  // Face Landmarks 68 points
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model-shard1',

  // Face Recognition (FaceNet descriptor)
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model-shard1',
  'face_recognition_model-shard2',
];

// Tạo thư mục nếu chưa có
if (!fs.existsSync(MODELS_DIR)) {
  fs.mkdirSync(MODELS_DIR, { recursive: true });
  console.log(`✅ Created directory: ${MODELS_DIR}`);
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    // Kiểm tra file đã tồn tại
    if (fs.existsSync(dest)) {
      console.log(`  ⏭️  Already exists: ${path.basename(dest)}`);
      return resolve();
    }

    const file = fs.createWriteStream(dest);
    const protocol = url.startsWith('https') ? https : http;

    const request = protocol.get(url, (response) => {
      // Xử lý redirect
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        fs.unlinkSync(dest);
        return downloadFile(response.headers.location, dest)
          .then(resolve)
          .catch(reject);
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        return reject(new Error(`HTTP ${response.statusCode} for ${url}`));
      }

      const totalBytes = parseInt(response.headers['content-length'] || '0');
      let downloadedBytes = 0;

      response.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        if (totalBytes > 0) {
          const pct = Math.round((downloadedBytes / totalBytes) * 100);
          process.stdout.write(
            `\r  ⬇️  ${path.basename(dest)}: ${pct}% (${(downloadedBytes / 1024 / 1024).toFixed(1)}MB)`,
          );
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log(`\n  ✅ Downloaded: ${path.basename(dest)}`);
        resolve();
      });
    });

    request.on('error', (err) => {
      file.close();
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      reject(err);
    });

    file.on('error', (err) => {
      file.close();
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      reject(err);
    });
  });
}

async function main() {
  console.log('🚀 Downloading face-api.js models...');
  console.log(`📁 Target directory: ${MODELS_DIR}\n`);

  let success = 0;
  let failed = 0;

  for (const filename of MODEL_FILES) {
    const url = BASE_URL + filename;
    const dest = path.join(MODELS_DIR, filename);

    try {
      await downloadFile(url, dest);
      success++;
    } catch (err) {
      console.error(`\n  ❌ Failed: ${filename} — ${err.message}`);
      failed++;
    }
  }

  console.log(`\n════════════════════════════════`);
  console.log(`✅ Success: ${success}/${MODEL_FILES.length} files`);
  if (failed > 0) {
    console.log(`❌ Failed:  ${failed} files — check your internet connection`);
    process.exit(1);
  } else {
    console.log(`🎉 All models ready! You can now start the backend.`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
