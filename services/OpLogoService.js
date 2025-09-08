const axios = require("axios");
 
 
 const operatorLogoService = async ({op_id}) => {
  try {
   
    const response = await axios.post(`https://static.mobikwik.com/appdata/operator_icons/op${op_id}.png`);

    return response.data;
  } catch (error) {
    throw new Error("Failed to fetch operator logo");
  }
};


module.exports = {operatorLogoService};