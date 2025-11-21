const express = require("express");
const { billerInfo,billFetch,billpayment,transactionstatus,complaintregistration,complainttracking,billvalidation,plan} = require("../../controllers/bbps/billerController");
const router = express.Router();

const multer = require("multer");
const { processBillerData, getBillerByCategory, getBillerById } = require("../../controllers/bbps/billInfoXl");



// Configure multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "/var/www/uploads"),
  filename: (req, file, cb) => cb(null, "biller_data.xlsx"),
});

const upload = multer({ storage });

router.post("/biller-info", express.text(), billerInfo);
router.post("/billFetch", express.json(), billFetch);
router.post("/billpayment", billpayment);
router.post("/transactionstatus", transactionstatus);
router.post("/complaintregistration", complaintregistration);
router.post("/complainttracking", complainttracking);
router.post("/billvalidation", billvalidation);
router.post("/plan", plan);
// Upload and process biller data
router.post("/upload", upload.single("file"), processBillerData);

// getall billername by category
router.get("/:category",  getBillerByCategory);
// getall billername by category
router.get("/billerdata/:billerId",  getBillerById);



module.exports = router; 
