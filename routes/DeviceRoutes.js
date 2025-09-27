const router = require("express").Router();
const categoryCtrl = require("../controllers/deviceCategoryController");
const modelCtrl = require("../controllers/deviceModelController");
const requestCtrl = require("../controllers/deviceRequestController");
const { isAdmin, isRetailer, auth } = require("../middleware/auth");

// 🔹 Category CRUD
router.post("/categories", auth, isAdmin, categoryCtrl.createCategory);
router.get("/categories", auth, categoryCtrl.getCategories);
router.put("/categories/:id", auth, isAdmin, categoryCtrl.updateCategory);
router.delete("/categories/:id", auth, isAdmin, categoryCtrl.deleteCategory);

// 🔹 Model CRUD
router.post("/models", auth, isAdmin, modelCtrl.createModel);
router.get("/models/:categoryId", auth, modelCtrl.getModelsByCategory);
router.put("/models/:id", auth, isAdmin, modelCtrl.updateModel);
router.delete("/models/:id", auth, isAdmin, modelCtrl.deleteModel);

// 🔹 Request CRUD
router.post("/requests", auth, isRetailer, requestCtrl.createRequest);
router.get("/requests", auth, requestCtrl.getRequests); // admin all, retailer own
router.post("/requests/:id/approve", auth, isAdmin, requestCtrl.approveRequest);
router.post("/requests/:id/reject", auth, isAdmin, requestCtrl.rejectRequest);

module.exports = router;
