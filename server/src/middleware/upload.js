import multer from "multer";

// In-memory storage: an uploaded import file is parsed once and discarded,
// no need to write it to disk first. 10MB comfortably covers even a large
// hospital's donor list as CSV or XLSX.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

export const uploadSingleFile = upload.single("file");
