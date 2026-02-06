const cloud = require('wx-server-sdk');
const axios = require('axios');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const KEY = process.env.TENCENT_MAP_KEY;
const BASE_URL = 'https://apis.map.qq.com/ws/place/v1/suggestion';

exports.main = async (event, context) => {
  if (!KEY) return { code: -1, msg: 'Missing TENCENT_MAP_KEY' };

  try {
    const { keywords, city } = event;
    if (!keywords) return { code: -1, msg: 'Keywords required' };

    let params = {
      key: KEY,
      keyword: keywords,
      region: city || '',
      region_fix: city ? 1 : 0, // Prefer current city
      policy: 1 // Smart search
    };

    const res = await axios.get(BASE_URL, { params });
    if (res.data.status === 0) {
      return { code: 0, tips: res.data.data };
    } else {
      return { code: res.data.status, msg: res.data.message };
    }
  } catch (e) {
    return { code: -1, msg: e.message };
  }
};
