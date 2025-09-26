const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create directories if they don't exist
const imageDir = path.join(__dirname, '../../uploads/post-images');
const videoDir = path.join(__dirname, '../../uploads/post-videos');

if (!fs.existsSync(imageDir)) {
  fs.mkdirSync(imageDir, { recursive: true });
}
if (!fs.existsSync(videoDir)) {
  fs.mkdirSync(videoDir, { recursive: true });
}

// Dynamic storage based on file type
const dynamicStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Determine destination based on field name
    if (file.fieldname === 'video') {
      cb(null, videoDir);
    } else {
      cb(null, imageDir);
    }
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, uniqueName);
  }
});

// File filter for both images and videos
const fileFilter = (req, file, cb) => {
  if (file.fieldname === 'video') {
    // Video validation
    const allowedVideoTypes = /mp4|avi|mov|wmv|flv|webm|mkv/;
    const extname = allowedVideoTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = file.mimetype.startsWith('video/');

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only video files are allowed for video field!'), false);
    }
  } else {
    // Image validation
    const allowedImageTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedImageTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedImageTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed for images field!'), false);
    }
  }
};

// Combined upload for both images and video
const combinedUpload = multer({
  storage: dynamicStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit per file
    files: 11 // 10 images + 1 video
  }
}).fields([
  { name: 'images', maxCount: 10 },
  { name: 'video', maxCount: 1 }
]);

// Individual upload configurations
const imageUpload = multer({
  storage: multer.diskStorage({
    destination: imageDir,
    filename: function (req, file, cb) {
      const ext = path.extname(file.originalname);
      const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
      cb(null, uniqueName);
    }
  }),
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit for images
    files: 10 // Maximum 10 images
  }
});

const videoUpload = multer({
  storage: multer.diskStorage({
    destination: videoDir,
    filename: function (req, file, cb) {
      const ext = path.extname(file.originalname);
      const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
      cb(null, uniqueName);
    }
  }),
  fileFilter: (req, file, cb) => {
    const allowedTypes = /mp4|avi|mov|wmv|flv|webm|mkv/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = file.mimetype.startsWith('video/');

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only video files are allowed!'), false);
    }
  },
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit for videos
    files: 1 // Only 1 video per post
  }
});

// Export different upload configurations
module.exports = {
  imageUpload: imageUpload.array('images', 10),
  videoUpload: videoUpload.single('video'),
  combinedUpload,
  imageUploadSingle: imageUpload.single('image'), // For backward compatibility
  videoUploadSingle: videoUpload.single('video')
}; 