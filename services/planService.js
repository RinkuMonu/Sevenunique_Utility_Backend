

const axios = require('axios');

const fetchPlanType = async(op_id, cir_id, plan_type) =>{
    try {
    
        const url = `https://alpha3.mobikwik.com/recharge/v1/rechargePlansAPI/${op_id}/${cir_id}/${plan_type}`;
    
       
        const response = await axios.get(url, {
          headers: {
            'Content-Type': 'application/json',
            'X-Mclient': '14',  
          }
        });
    
      
        if (response.data.success) {
          return response.data.data.plans;
        } else {
          throw new Error('No plans available for the specified operator and circle');
        }
      } catch (error) {
        throw error;
      }
}

const fetchPlans = async (op_id, cir_id) => {
  try {
    
    const url = `https://alpha3.mobikwik.com/recharge/v1/rechargePlansAPI/${op_id}/${cir_id}`;

   
    const response = await axios.get(url, {
      headers: {
        'Content-Type': 'application/json',
        'X-Mclient': '14',  
      }
    });

  
    if (response.data.success) {
      return response.data.data.plans;
    } else {
      throw new Error('No plans available for the specified operator and circle');
    }
  } catch (error) {
    throw error;
  }
};

module.exports = { fetchPlans, fetchPlanType };
