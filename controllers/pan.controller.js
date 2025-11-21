const panConfig = require("../config/pan.config");
const { runJarAndGenerateRequest } = require("../services/jar.service");
const { signEncryptedRequest } = require("../services/sign.service");
const { generateAutoSubmitHTML } = require("../utils/autoSubmitPage");

exports.createPanRequest = async (req, res) => {
  try {
    // Step 1: JAR Execute
    const jarData = await runJarAndGenerateRequest();
    console.log("JAR DATA:", jarData);

    // Step 2: Signature Generate
    // const signature = signEncryptedRequest(jarData.encryptedRequest);
    const signature = jarData.signature;
    console.log("SIGNATURE:", signature);

    // Step 3: Final JSON
    const finalJson = {
      encryptedRequest: jarData.encryptedRequest,
      Signature: signature,
      entityCode: panConfig.entityCode,
      transactionId: jarData.transactionId,
      authKey: jarData.AuthKey,
    };
    console.log("FINAL JSON:", finalJson);

    // Stringify (Protean expects string)
    const jsonString = JSON.stringify(finalJson);

    // Step 4: HTML Auto-submit Page
    const htmlPage = generateAutoSubmitHTML(panConfig.PAN_API_URL, jsonString);

    res.setHeader("Content-Type", "text/html");
    return res.send(htmlPage);
  } catch (err) {
    console.log(err);
    return res.status(500).json({
      status: "error",
      message: err.toString(),
    });
  }
};
