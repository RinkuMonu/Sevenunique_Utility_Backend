const xlsx = require("xlsx");

const readExcelFile = (filePath) => {
  try {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0]; // Read first sheet
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
    
    // Extract billerId only
    const billerIds = data.map((row) => row.billerId).filter(Boolean);
    return billerIds;
  } catch (error) {
    console.error("❌ Error reading Excel file:", error.message);
    throw error;
  }
};

module.exports = readExcelFile;
