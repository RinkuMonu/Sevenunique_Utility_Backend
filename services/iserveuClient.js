const axios = require("axios");
const { encryptObject, decryptToObject, buildHeaderSecrets } = require("./iserveuCrypto");

const ISU = axios.create({
  baseURL: process.env.ISU_BASE_URL,
  timeout: 20000,
  headers: { "Content-Type": "application/json" },
});

// generic encrypted POST
async function postEncrypted(endpoint, payload) {
  const header_secrets = buildHeaderSecrets();
  const body = { RequestData: encryptObject(payload) };
  console.log(body);

  console.log({
    header_secrets,
    pass_key: process.env.ISU_PASS_KEY,
  },);

  const { data, status } = await ISU.post(endpoint, body, {
    headers: {
      header_secrets,
      pass_key: process.env.ISU_PASS_KEY,
    },
  });

  // Only success responses are encrypted as per docs; others may be plain JSON
  if (data?.ResponseData) {
    const dec = decryptToObject(data.ResponseData);
    return { status, data: dec };
  }
  // fallback for non-encrypted error JSON
  return { status, data };
}

module.exports = { postEncrypted };
