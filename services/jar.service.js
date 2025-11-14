const { exec } = require("child_process");
const path = require("path");

exports.runJarAndGenerateRequest = () => {
  return new Promise((resolve, reject) => {
    const jarPath = path.join(__dirname, "../jar/EntityRequestUtility.jar");

    exec(`java -jar ${jarPath}`, (error, stdout, stderr) => {
      if (error) {
        return reject("Error executing JAR: " + error);
      }

      try {
        let output = stdout.trim();
        let parsed = JSON.parse(output);

        resolve({
          encryptedRequest: parsed.encryptedRequest,
          authKey: parsed.authKey,
          transactionId: parsed.transactionId,
        });
      } catch (e) {
        reject("Error parsing JAR output: " + e);
      }
    });
  });
};
