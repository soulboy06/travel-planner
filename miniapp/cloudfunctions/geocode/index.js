const cloud = require('wx-server-sdk');
const axios = require('axios'); // Ensure axios is installed or use native https
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// TENCENT MAP KEY should be in Cloud Function Environment Variables
const KEY = process.env.TENCENT_MAP_KEY;
const BASE_URL = 'https://apis.map.qq.com/ws/geocoder/v1/';

exports.main = async (event, context) => {
  if (!KEY) return { code: -1, msg: 'Missing TENCENT_MAP_KEY' };

  try {
    const { address, location, type = 'geo' } = event;
    let params = { key: KEY };

    if (type === 'regeo' && (location || event.latitude)) {
      // Reverse Geocoding
      const lat = location ? location.split(',')[1] : event.latitude;
      const lng = location ? location.split(',')[0] : event.longitude;
      params.location = `${lat},${lng}`;
      // If no location provided, it might fail, but regeo usually implies coordinates
      if (!params.location || params.location === 'undefined,undefined') {
        // If no location, maybe rely on IP? WebService doesn't support IP location easily directly here
        return { code: -1, msg: 'Location required for regeo' };
      }
    } else {
      // Geocoding
      if (!address) return { code: -1, msg: 'Address required' };
      params.address = address;
      if (event.city) params.region = event.city;
    }

    const res = await axios.get(BASE_URL, { params });
    if (res.data.status === 0) {
      return { code: 0, result: res.data.result };
    } else {
      return { code: res.data.status, msg: res.data.message };
    }
  } catch (e) {
    return { code: -1, msg: e.message };
  }
};
