Page({
  data: {
    guideParams: {
      days: '',
      budget: '',
      vibe: '',
      pace: '正常',
      other: ''
    },
    guideContextSummary: '',
    guideLoading: false,
    guideResult: null
  },

  onShow() {
    this.loadGuideContext();
  },

  goInput() {
    wx.redirectTo({ url: '/pages/input/index' });
  },

  goRoute() {
    wx.redirectTo({ url: '/pages/route/index' });
  },

  onGuideInput(e) {
    const field = e.currentTarget.dataset.field;
    const val = e.detail.value;
    this.setData({
      [`guideParams.${field}`]: val
    });
  },

  setGuidePace(e) {
    this.setData({ 'guideParams.pace': e.currentTarget.dataset.val });
  },

  loadGuideContext() {
    const routePayload = wx.getStorageSync('route_payload') || {};
    const inputState = wx.getStorageSync('input_state') || {};
    const origin = routePayload.originPoint || inputState.originPoint || null;
    const routePlaces = Array.isArray(routePayload.places) ? routePayload.places : [];
    const inputPlaces = Array.isArray(inputState.places) ? inputState.places : [];
    const destinations = routePlaces.length > 0 ? routePlaces : inputPlaces;
    const city = (inputState.cityQuery || '').trim();

    const originLabel = origin ? (origin.name || origin.address || '未命名起点') : '未设置';
    const destLabels = destinations
      .map((p) => p && (p.name || p.address))
      .filter(Boolean);
    const summary = [
      city ? `城市：${city}` : '',
      `起点：${originLabel}`,
      `目的地：${destLabels.length > 0 ? destLabels.join('、') : '未选择'}`
    ].filter(Boolean).join(' ｜ ');

    this._guideContext = { city, origin, destinations };
    this.setData({ guideContextSummary: summary });
  },

  normalizeList(value) {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value
        .map((item) => {
          if (typeof item === 'string') return item.trim();
          if (item && typeof item === 'object') {
            const day = item.day ? String(item.day).trim() : '';
            const stops = Array.isArray(item.stops)
              ? item.stops.map((s) => String(s || '').trim()).filter(Boolean).join(' -> ')
              : '';
            const notes = item.notes ? String(item.notes).trim() : '';
            return [day, stops, notes].filter(Boolean).join('：');
          }
          return '';
        })
        .filter(Boolean);
    }
    if (typeof value === 'string') {
      return value
        .split(/\r?\n|；|;/g)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [];
  },

  normalizeGuideResult(raw = {}) {
    const itinerary = this.normalizeList(raw.itinerary || raw.plan);
    const mustDo = this.normalizeList(raw.mustDo);
    const tips = this.normalizeList(raw.tips);
    const keyPoints = this.normalizeList(raw.keyPoints);
    return {
      title: raw.title || '未命名攻略',
      summary: raw.summary || '',
      itinerary,
      mustDo,
      tips,
      keyPoints,
      planB: raw.planB || ''
    };
  },

  async onGenerateGuide() {
    this.loadGuideContext();
    const ctx = this._guideContext || { city: '', origin: null, destinations: [] };
    this.setData({ guideLoading: true, guideResult: null });
    try {
      const res = await wx.cloud.callFunction({
        name: 'guide',
        data: {
          days: this.data.guideParams.days,
          budget: this.data.guideParams.budget,
          vibe: this.data.guideParams.vibe,
          pace: this.data.guideParams.pace,
          note: this.data.guideParams.other,
          city: ctx.city,
          origin: ctx.origin
            ? {
                name: ctx.origin.name || '',
                address: ctx.origin.address || '',
                lat: ctx.origin.lat,
                lng: ctx.origin.lng
              }
            : null,
          destinations: (ctx.destinations || []).map((p) => ({
            name: p.name || '',
            address: p.address || '',
            lat: p.lat,
            lng: p.lng
          }))
        }
      });

      if (res.result && res.result.success) {
        this.setData({ guideResult: this.normalizeGuideResult(res.result.data) });
      } else {
        const errMsg =
          res.result?.error ||
          res.result?.raw?.error?.message ||
          res.result?.raw?.message ||
          'Unknown Error';
        throw new Error(errMsg);
      }
    } catch (e) {
      wx.showToast({ title: `生成失败：${e.message}`, icon: 'none' });
      console.error(e);
    } finally {
      this.setData({ guideLoading: false });
    }
  }
});
