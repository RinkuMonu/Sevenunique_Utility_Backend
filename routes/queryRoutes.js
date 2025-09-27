const express = require("express");
const router = express.Router();

const formController = require("../controllers/queryController.js");
const upload = require("../utils/uplods.js");
const authenticateToken = require("../middleware/verifyToken.js");

router.post(
  "/",
  authenticateToken,
  upload.single("qureyPhoto"),
  formController.createForm
);

router.get("/", authenticateToken, formController.getAllForms);

router.get("/:id", formController.getFormById);

router.put("/:id", formController.updateForm);

router.delete("/:id", formController.deleteForm);

module.exports = router;
