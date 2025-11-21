const { exec } = require("child_process");
const path = require("path");

exports.runJarAndGenerateRequest = () => {
  return new Promise((resolve, reject) => {
    const jarPath = path.join(process.cwd(), "jar/EntityRequestUtility.jar");
    const javaPath = "C:\\Program Files\\Java\\jdk-25\\bin\\java.exe";

    console.log("USING JAR:", jarPath);
    console.log("USING JAVA:", javaPath);
    console.log("CWD:", process.cwd());

    exec(`"${javaPath}" -jar "${jarPath}"`, (error, stdout, stderr) => {
      if (error) {
        return reject("Error executing JAR: " + stderr || error);
      }

      try {
        console.log("JAR OUTPUT:", stdout);

        let lines = stdout.trim().split("\n");
        let parsed = {};
        console.log("PARSE LINES:", lines);

        lines.forEach((line) => {
          if (line.startsWith("Encryption output:")) {
            parsed.encryptedRequest = line
              .replace("Encryption output: ", "")
              .trim();
          }
          if (line.startsWith("AuthKey:")) {
            parsed.AuthKey = line.replace("AuthKey: ", "").trim();
          }
          if (line.startsWith("TransactionId:")) {
            parsed.transactionId = line.replace("TransactionId: ", "").trim();
          }
          if (line.startsWith("signature:")) {
            parsed.signature = line.replace("signature: ", "").trim();
          }
        });

        resolve(parsed);
      } catch (e) {
        reject("Error parsing JAR output: " + e);
      }
    });
  });
};
