const mongoose = require("mongoose");
require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const { errors } = require("celebrate");
const { errorHandler, notFound } = require("./middleware/errorMiddleware");
const path = require("path");
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
const { planCheckCronJob } = require("./services/cornjob.js");
const loan = require("./routes/loan.routes.js");
const { default: router } = require("./routes/instantpayPpiRoutes.js");

const bannerRoutes = require("./routes/bannerRoutes.js");
const blogRoutes = require("./routes/blogRouter.js");
const panroute = require("./routes/pan.routes.js");
const redis = require("./middleware/redis.js");
const app = express();
planCheckCronJob();


const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "https://utility.finuniques.in",
  "https://dev.finuniques.in",
];

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  })
);


app.use(bodyParser.json());
app.use("/uploads", express.static("/var/www/uploads"));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// app.use(apiLogger); 
// app.use((req, res, next) => {
//   const start = Date.now();
//   res.on("finish", () => {
//     const duration = Date.now() - start;
//     if (duration > 500) {
//       console.log(`⚠️ SLOW API: ${req.method} ${req.originalUrl} - ${duration}ms`);
//     } else {
//       console.log(`☺☺ GOOD API RES: ${req.method} ${req.originalUrl} - ${duration}ms`);
//     }
//   });
//   next();
// });


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
app.use("/api/v1/aeps/iservu", require("./routes/Iserveu.js"));
app.use("/api/v1/iserveu/dmt", require("./routes/iserveu.dmt.routes.js"));
app.use("/api/v1/instant/payout", require("./routes/InstantPay.payout.js"));
app.use("/api/v1/iserveu/payout", require("./routes/IserveUpayout.js"));
app.use("/api/InstantPay", require("./routes/InstantPay.eaps.router.js"));
app.use("/api/InstantPay_DMT", require("./routes/InstantPay.dmt.router.js"));
app.use("/api/InstantPay_PPI", router);
app.use("/api/v1/commission", require("./routes/commisionRoutes.js"));
app.use("/api/recharge", rechargeRoute);
app.use("/api/biller", billerRoutes);
app.use("/api/v1/news", NewsRouter);
app.use("/api/v1/getallrole", getAllRole);
app.use("/api/loans", loan);
app.use("/api/assets", require("./routes/device.routes"));
app.use("/api/banners", bannerRoutes);
app.use("/api/blog", blogRoutes);
app.use("/api/pan", panroute);
app.get("/health", (req, res) =>
  res.json({ ip: req.ip, message: "Welcome to the FINUNIQUE api's" })
);

app.get("/health/redis", async (req, res) => {
  if (!redis) {
    return res.json({ redis: "disabled by .env" });
  }
  try {
    const start = Date.now();
    await redis.ping();
    res.json({
      redis: "up",
      latency: `${Date.now() - start}ms`
    });
  } catch {
    res.status(503).json({ redis: "DOWN" });
  }
});

// 🟢 React build (JS/CSS) → cache OK
app.use(
  express.static(path.join(__dirname, "build"), {
    maxAge: "1y",
    immutable: true,
  })
);

app.get("*", (req, res) => {
  res.setHeader(
    "Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.sendFile(path.join(__dirname, "build", "index.html"));
});




mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("Connected to MongoDB");
  })
  .catch((err) => {
    console.error("Error connecting to MongoDB:", err.message);
  });

const PORT = process.env.PORT || 5001;

app.use(errors());
app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
