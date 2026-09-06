import multer from "multer";

// In-memory storage: an uploaded import file is parsed once and discarded,
// no need to write it to disk first. 10MB comfortably covers even a large
// hospital's donor list as CSV or XLSX.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

export const uploadSingleFile = upload.single("file");

// "Get Verified" flow (donor mobile app): 2 ID photos + 5 guided face-angle
// photos, all required in one submission — same memory storage as above,
// they're read straight into donor_verifications as bytea rather than ever
// touching disk (see migration 012 for why).
export const uploadVerificationFiles = upload.fields([
  { name: "idFront", maxCount: 1 },
  { name: "idBack", maxCount: 1 },
  { name: "face_front", maxCount: 1 },
  { name: "face_left", maxCount: 1 },
  { name: "face_right", maxCount: 1 },
  { name: "face_up", maxCount: 1 },
  { name: "face_down", maxCount: 1 },
]);
