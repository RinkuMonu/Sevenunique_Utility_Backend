const mongoose = require("mongoose");
require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const { errors } = require("celebrate");
const { errorHandler, notFound } = require("./middleware/errorMiddleware");

const authRoutes = require("./routes/authRoutes");
const KycRoutes = require("./routes/kycRoutes");
const serviceRoutes = require("./routes/serviceRoutes");

const rechargeRoute = require("./routes/rechargeRoute");
const billerRoutes = require("./routes/bbps/billerRoutes");
const servicePlanRoutes = require("./routes/servicePlanRoutes.js");
const apiLogger = require("./middleware/apiLogger.js");
const authenticateToken = require("./middleware/verifyToken.js");
const NewsRouter = require("./routes/news.routes.js");
const { getAllRole } = require("./controllers/permissionByRoleController.js");

const app = express();

app.use(
  cors({
    origin: "*",

    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  })
);

app.use(bodyParser.json());
app.use("/uploads", express.static("uploads"));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// app.use(apiLogger);

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/user", require("./routes/userMetaRoutes.js"));
app.use("/api/kyc", KycRoutes);
app.use("/api/service/plans", servicePlanRoutes);
app.use("/api/permission", require("./routes/permissionByRoleRoutes.js"));

app.use("/api/v1/service", serviceRoutes);
app.use("/api/v1/e-wallet", require("./routes/WalletRoutes.js"));
app.use("/api/v1/payment", require("./routes/mainWalletRoutes.js"));
app.use("/api/v1/query", require("./routes/queryRoutes.js"));
app.use("/api/v1/payment_req", require("./routes/paymentRoutes.js"));
app.use("/api/v1/billAvenue", require("./routes/bbps/billAvenueRoutes.js"));
app.use("/api/v1/bbps", require("./routes/bbpsRoutes.js"));
app.use("/api/v1/s3", require("./routes/sprintRoutes.js"));
app.use("/api/v1/kyc", authenticateToken, require("./routes/kycvideo.js"));
app.use("/api/v1", require("./routes/sprintDmt&AepsRoutes.js"));
app.use("/api/v1", require("./routes/sprintDmt&AepsRoutes.js"));

app.use("/api/v1/commission", require("./routes/commisionRoutes.js"));

app.use("/api/recharge", rechargeRoute);
app.use("/api/biller", billerRoutes);
app.use("/api/v1/news", NewsRouter);
app.use("/api/v1/getallrole", getAllRole);

app.get("/", (req, res) =>
  res.json({ ip: req.ip, message: "Welcome to the API" })
);

mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("Connected to MongoDB");
  })
  .catch((err) => {
    console.error("Error connecting to MongoDB:", err.message);
  });

const PORT = process.env.PORT || 8080;

app.use(errors());
app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
