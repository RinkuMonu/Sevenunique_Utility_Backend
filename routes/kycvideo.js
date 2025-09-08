const express = require("express");
const multer = require("multer");
const path = require("path");
const User = require("../models/userModel");
const KYCRequest = require("../models/kycmodels");
 
const router = express.Router();
 
// multer config
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });
 
// 1. Request KYC
router.post("/request", async (req, res) => {
  const kyc = await KYCRequest.create({ user: req?.user?.id });
  await kyc.save();
  res.json({ message: "KYC requested", kyc });
});
 
// 2. Approve request (admin)
router.patch("/approve/:id", async (req,res,next) => {
  const { id } = req.params;
  const { scheduledTime } = req.body;
  try{

      const kyc = await KYCRequest.findOneAndUpdate({user:id}, {
        status: "approved",
        scheduledTime
      }, { new: true });
      res.json({ message: "KYC approved", kyc });
  }
  catch(Error){
     next(Error)
  }
});
 
// 3. Create room (admin)
router.patch("/create-room/:id", async (req, res) => {
  const { id } = req.params;
  const roomLink = `https://meet.jit.si/kyc-room-${id}`;
  const kyc = await KYCRequest.findByIdAndUpdate(id, {
    roomLink,
    status: "room_created"
  }, { new: true });
  res.json({ message: "Room created", kyc });
});
 
// 4. Upload screenshot (agent)
router.post("/upload-screenshot", upload.single("screenshot"), async (req, res) => {
  const { userId } = req.body;
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });
 
  const user = await User.findById(userId);
  user.documents.push(req.file.path);
  await user.save();
 
  res.json({ message: "Screenshot uploaded", path: req.file.path });
});
 
// 5. Get all requests (admin)
router.get("/all", async (req, res) => {
  const data = await KYCRequest.find().populate("user");
  res.json(data);
});

 router.get("/user/:id", async (req, res) => {
  const { id } = req.params;
    console.log(id)
  try {
    const kyc = await KYCRequest.findOne({ user: id })
      .sort({ createdAt: -1 }) // In case there are multiple
      .populate("user");

    if (!kyc) {
      return res.status(404).json({ message: "No KYC request found" });
    }

    res.json({ kyc });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});
module.exports = router;