const axios = require("axios");
const { encrypt, decrypt } = require("../../utils/encryption");
const Biller = require("../../models/billerModel");
const readExcelFile = require("../../utils/readExcel");

const workingKey = process.env.ENCRYPTION_KEY;
const BBPS_API_URL = process.env.BBPS_API_URL;
const ACCESS_CODE = process.env.ACCESS_CODE;

function generateRequestId() {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let randomPart = "";
  for (let i = 0; i < 27; i++) {
    randomPart += characters.charAt(
      Math.floor(Math.random() * characters.length)
    );
  }

  const now = new Date();
  const year = now.getFullYear() % 10;
  const startOfYear = new Date(now.getFullYear(), 0, 0);
  const diff = now - startOfYear;
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay);
  const hours = now.getHours().toString().padStart(2, "0");
  const minutes = now.getMinutes().toString().padStart(2, "0");

  const requestId = `${randomPart}${year}${dayOfYear
    .toString()
    .padStart(3, "0")}${hours}${minutes}`;
  return requestId;
}

// Upload Excel, Process API and Save to DB
const processBillerData = async (req, res) => {
  try {
    console.log("Uploaded File:", req.file);
    if (!req.file) {
      return res
        .status(400)
        .json({ error: "No file uploaded. Please upload an Excel file." });
    }
    const filePath = req.file.path;

    // ✅ Read billerId from Excel
    const billerIds = readExcelFile(filePath);
    console.log("billerIds", billerIds);
    if (!billerIds.length) {
      return res
        .status(400)
        .json({ error: "No valid billerId found in Excel." });
    }

    console.log(`✅ Total billerIds fetched: ${billerIds.length}`);

    // ✅ Process in batches of 2000
    const batchSize = 1998;
    for (let i = 0; i < billerIds.length; i += batchSize) {
      const batch = billerIds.slice(i, i + batchSize);
      console.log(`Processing batch ${i / batchSize + 1}...`);

      const data = {
        billerId: batch,
      };

      console.log("biller ids in data in batch is :", data);

      const billerData = JSON.stringify(data);
      console.log("Validated Request Data:", billerData);

      // ✅ Encrypt stringified data
      const encryptedData = encrypt(billerData, workingKey);
      console.log("Encrypted Data:", encryptedData);

      // ✅ Send encrypted data to BBPS API
      const bbpsResponse = await axios.post(
        "https://stgapi.billavenue.com/billpay/extMdmCntrl/mdmRequestNew/json",
        encryptedData,
        {
          headers: {
            "Content-Type": "text/plain",
          },
          params: {
            accessCode: ACCESS_CODE,
            requestId: generateRequestId(),
            ver: "1.0",
            instituteId: "FP09",
          },
        }
      );

      console.log("BBPS Response:", bbpsResponse.data);

      if (!bbpsResponse.data) {
        return res
          .status(400)
          .json({ error: "Invalid response from BBPS API" });
      }

      // ✅ Decrypt response data
      const decryptedData = decrypt(bbpsResponse.data, workingKey);
      console.log("Decrypted Data:", decryptedData);
    //   res.json(JSON.parse(decryptedData));

    // ✅ Save decrypted data to MongoDB
    await saveBillerData(decryptedData);

    console.log(`✅ Batch ${i / batchSize + 1} processed and saved successfully.`);
    }

    res.json({ message: "✅ Biller data processed successfully." });
  } catch (error) {
    console.error("❌ Error processing biller data:", error.message);
    res.status(500).json({ error: error.message });
  }
};

// ✅ Function to save biller data to MongoDB
const saveBillerData = async (decryptedData) => {
    try {
      // ✅ Parse the decrypted data
      const data = JSON.parse(decryptedData);
      console.log("data is ", data);
  
      // ✅ Check if 'biller' array exists
      if (!data || !Array.isArray(data.biller) || data.biller.length === 0) {
        console.warn("⚠️ No valid biller data found to insert.");
        return;
      }
  
      // ✅ Extract 'biller' array
      const billerData = data.biller;
      console.log("billerData to be inserted:", billerData);
  
      // ✅ Insert only the 'biller' array into MongoDB
      await Biller.insertMany(billerData, { ordered: false });
      console.log("✅ Biller data inserted successfully into MongoDB.");
    } catch (error) {
      if (error.code === 11000) {
        console.warn("⚠️ Duplicate data skipped.");
      } else {
        console.error("❌ Error saving biller data to MongoDB:", error.message);
      }
    }
  };
 

// ✅ Function to get biller data by category
const getBillerByCategory = async (req, res) => {
  try {
    const { category } = req.params;

    if (!category) {
      return res.status(400).json({ message: "Biller category is required" });
    }

    // ✅ Fetch billerName and billerId based on billerCategory
    const billers = await Biller.find(
      { billerCategory: category },
      { billerName: 1, billerId: 1,billerAliasName:1,billerCategory:1, _id: 0 }
    );

    if (billers.length === 0) {
      return res.status(404).json({ message: "No billers found for this category" });
    }

    res.status(200).json(billers);
  } catch (error) {
    console.error("Error fetching biller data:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};
// ✅ Function to get biller data by billerId
const getBillerById = async (req, res) => {
  try {
    const { billerId } = req.params;

    if (!billerId) {
      return res.status(400).json({ message: "Biller ID is required" });
    }

    // ✅ Fetch biller data based on billerId
    const biller = await Biller.findOne({ billerId });

    if (!biller) {
      return res.status(404).json({ message: "Biller not found" });
    }

    res.status(200).json(biller);
  } catch (error) {
    console.error("Error fetching biller data:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};
  

module.exports = { processBillerData ,getBillerByCategory,getBillerById};
