const { default: axios } = require("axios");

exports.getBbpsServices = async (req, res) => {
  try {
    const response = await axios.get(
      "https://xapi.ecuzen.in/api/bbps/fetch_cats",
      {
        headers: {
          "api-key": process.env.ecuzen_api_key,
        },
      },
    );
    res.status(200).json(response.data);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Failed to fetch BBPS services" });
  }
};

exports.getBbpsBillerDetails = async (req, res) => {
  try {
    const { cat_id } = req.body || {};
    if (!cat_id) {
      return res.status(400).json({ error: "cat_id is required" });
    }
    const response = await axios.post(
      "https://xapi.ecuzen.in/api/bbps/fetch_cat_billers",
      { cat_id },
      {
        headers: {
          "api-key": process.env.ecuzen_api_key,
        },
      },
    );
    res.status(200).json(response.data);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Failed to fetch BBPS biller details" });
  }
};

exports.getBbpsBillerParams = async (req, res) => {
  try {
    const { biller_id } = req.body || {};
    if (!biller_id) {
      return res.status(400).json({ error: "biller_id is required" });
    }
    const response = await axios.post( 
      "https://xapi.ecuzen.in/api/bbps/biller_params",
      { biller_id },
      {
        headers: {
          "api-key": process.env.ecuzen_api_key,
        },
      },
    );
    res.status(200).json(response.data);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Failed to fetch BBPS biller details" });
  }
};
