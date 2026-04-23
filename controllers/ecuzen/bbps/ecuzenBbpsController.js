const { default: axios } = require("axios");

exports.getBbpsServices = async(req, res) => {
  try {
    const res=await axios.get("https://xapi.ecuzen.in/api/bbps/fetch_cats")
    console.log(res.data)
  } catch (err) {
    console.log(err);
  }
};
