// Multer config for the complaint filing form's supporting attachment.
// Files are stored on local disk under server/uploads/ with a randomized
// filename; the original name/mimetype/size are recorded in the complaints row.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB, matches the form's stated limit

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).slice(0, 10);
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error('Unsupported file type. Allowed: JPG, PNG, WEBP, PDF, DOC, DOCX.'));
    }
    return cb(null, true);
  },
});

module.exports = { upload, UPLOAD_DIR, MAX_SIZE_BYTES };
