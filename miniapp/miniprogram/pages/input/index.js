const app = getApp();

Page({
  data: {
    // Top Tab
    currentTab: 'input', // input, route, guide
    navHeight: 20, // default, will update

    // --- MODULE 1: INPUT ---
    map: {
      lat: 30.572269,
      lng: 104.066541,
      scale: 12
    },
    cityQuery: '',
    cityLoading: false,

    originMode: 'location', // 'location' (auto text) | 'manual' (input)
    originAddress: '',
    originQuery: '',
    originPoint: null, // {lat, lng, name, address}
    originSuggestions: [],
    originSuggestTimer: null,

    destQuery: '',
    suggestions: [],
    destSuggestTimer: null,

    places: [], // Core Data: Array of {id, name, address, lat, lng}

    markers: [],

    // --- MODULE 2: ROUTE ---
    routeMap: {
      lat: 30.572269,
      lng: 104.066541,
      scale: 10
    },
    polylines: [],
    allPoints: [], // For include-points
    routeData: {
      totalDistanceText: '',
      totalDurationText: '',
      legs: []
    },

    // --- MODULE 3: GUIDE ---
    guideParams: {
      days: '',
      budget: '',
      vibe: '',
      pace: '正常',
      other: ''
    },
    guideLoading: false,
    guideResult: null // { title, summary, mustDo, tips, planB }
  },

  parseLocationAny(loc) {
    if (!loc) return null;
    if (typeof loc === 'object' && loc.lat != null && loc.lng != null) {
      return { lat: loc.lat, lng: loc.lng };
    }
    if (typeof loc === 'string') {
      const parts = loc.split(',');
      if (parts.length !== 2) return null;
      const a = parseFloat(parts[0]);
      const b = parseFloat(parts[1]);
      if (Number.isNaN(a) || Number.isNaN(b)) return null;
      // Detect order by range
      if (Math.abs(a) <= 90 && Math.abs(b) > 90) {
        return { lat: a, lng: b };
      }
      return { lat: b, lng: a };
    }
    return null;
  },

  onLoad(options = {}) {
    const sys = wx.getWindowInfo();
    this.setData({ navHeight: sys.statusBarHeight + 10 });

    const cached = wx.getStorageSync('input_state');
    if (cached && typeof cached === 'object') {
      this.setData({ ...cached });
      this.updateMarkers();
      return;
    }

    // Init Location
    this.locateCity();
    this.onLocateMe();

    if (options.tab) {
      this.setData({ currentTab: options.tab });
      if (options.tab === 'route') {
        this.generateRoute();
      }
    }
  },

  onHide() {
    this.saveState();
  },

  onUnload() {
    this.saveState();
  },

  saveState() {
    const {
      cityQuery,
      map,
      originMode,
      originAddress,
      originQuery,
      originPoint,
      places
    } = this.data;
    wx.setStorageSync('input_state', {
      cityQuery,
      map,
      originMode,
      originAddress,
      originQuery,
      originPoint,
      places
    });
  },

  // --- TABS / NAV ---
  goTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === 'route') return this.goRoute();
    if (tab === 'guide') return this.goGuide();
    return;
  },

  goRoute() {
    if (!this.data.originPoint || this.data.places.length === 0) {
      wx.showToast({ title: '请先设置起点并添加目的地', icon: 'none' });
      return;
    }
    wx.setStorageSync('route_payload', {
      originPoint: this.data.originPoint,
      places: this.data.places
    });
    wx.redirectTo({ url: '/pages/route/index' });
  },

  goGuide() {
    wx.redirectTo({ url: '/pages/guide/index' });
  },

  // ================= MODULE 1: INPUT =================

  // 1. City Auto Jump
  onCityInput(e) {
    const val = e.detail.value;
    this.setData({ cityQuery: val });

    if (this._cityTimer) clearTimeout(this._cityTimer);
    this._cityTimer = setTimeout(() => {
      if (val.trim()) this.citySearch(val);
    }, 800);
  },

  async citySearch(keyword) {
    this.setData({ cityLoading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'geocode',
        data: { address: keyword }
      });
      if (res.result && res.result.code === 0) {
        const loc = res.result.result.location;
        this.setData({
          'map.lat': loc.lat,
          'map.lng': loc.lng,
          'map.scale': 11
        });
      }
    } catch (e) { console.error(e); }
    finally { this.setData({ cityLoading: false }); }
  },

  // 2. Locate Me
  async onLocateMe() {
    try {
      const res = await wx.getLocation({ type: 'gcj02' });
      // Reverse geocode to get city/address
      const geo = await wx.cloud.callFunction({
        name: 'geocode',
        data: { location: `${res.longitude},${res.latitude}`, type: 'regeo' }
      });

      const address = geo.result && geo.result.code === 0
        ? (geo.result.result.address_component.city || geo.result.result.address)
        : '我的位置';

      const point = {
        lat: res.latitude,
        lng: res.longitude,
        name: '我的位置',
        address: address
      };

      this.setData({
        originPoint: point,
        originAddress: address,
        originMode: 'location',
        cityQuery: geo.result?.result?.address_component?.city || this.data.cityQuery,
        'map.lat': point.lat,
        'map.lng': point.lng,
        'map.scale': 14
      });

      this.updateMarkers();
    } catch (e) {
      wx.showToast({ title: '定位失败', icon: 'none' });
    }
  },

  toggleOriginMode() {
    this.setData({
      originMode: this.data.originMode === 'location' ? 'manual' : 'location'
    });
  },

  onOriginInput(e) {
    const val = e.detail.value;
    this.setData({ originQuery: val });

    if (!val.trim()) {
      this.setData({ originSuggestions: [] });
      return;
    }
    if (this._originTimer) clearTimeout(this._originTimer);
    this._originTimer = setTimeout(() => {
      this.fetchOriginSuggestions(val);
    }, 500);
  },

  async originSearch(keyword) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'geocode',
        data: { address: keyword, city: this.data.cityQuery }
      });
      if (res.result && res.result.code === 0) {
        const loc = res.result.result.location;
        const address = res.result.result.address || keyword;
        const point = {
          lat: loc.lat,
          lng: loc.lng,
          name: keyword,
          address
        };
        this.setData({
          originPoint: point,
          originAddress: address,
          'map.lat': point.lat,
          'map.lng': point.lng,
          'map.scale': 14
        });
        this.updateMarkers();
      }
    } catch (e) {
      console.error(e);
    }
  },

  async fetchOriginSuggestions(keyword) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'inputtips',
        data: { keywords: keyword, city: this.data.cityQuery }
      });
      if (res.result && res.result.code === 0) {
        this.setData({ originSuggestions: res.result.tips || [] });
      }
    } catch (e) {
      console.error(e);
    }
  },

  onSelectOriginSuggestion(e) {
    const idx = e.currentTarget.dataset.index;
    const item = this.data.originSuggestions[idx];
    const loc = this.parseLocationAny(item && item.location);
    if (!item || !loc) return;
    const point = {
      lat: loc.lat,
      lng: loc.lng,
      name: item.title || item.name || '出发点',
      address: item.address || item.title || item.name || ''
    };
    this.setData({
      originPoint: point,
      originAddress: point.address,
      originQuery: point.name,
      originMode: 'location',
      originSuggestions: [],
      'map.lat': point.lat,
      'map.lng': point.lng,
      'map.scale': 14
    });
    this.updateMarkers();
  },

  // 3. Dest Input & Suggestions
  onDestInput(e) {
    const val = e.detail.value;
    this.setData({ destQuery: val });

    if (!val.trim()) {
      this.setData({ suggestions: [] });
      return;
    }

    if (this.data.destSuggestTimer) clearTimeout(this.data.destSuggestTimer);
    this.setData({
      destSuggestTimer: setTimeout(() => {
        this.fetchSuggestions(val);
      }, 300)
    });
  },

  onClearDest() {
    this.setData({ destQuery: '', suggestions: [] });
  },

  async fetchSuggestions(keyword) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'inputtips',
        data: { keywords: keyword, city: this.data.cityQuery }
      });
      if (res.result && res.result.code === 0) {
        this.setData({ suggestions: res.result.tips || [] });
      }
    } catch (e) { console.error(e); }
  },

  // 4. Select & Add (Click to Add)
  onSelectSuggestion(e) {
    const idx = e.currentTarget.dataset.index;
    const item = this.data.suggestions[idx];
    const loc = this.parseLocationAny(item && item.location);
    if (!item || !loc) return;

    const newPlace = {
      id: Date.now(),
      name: item.title || item.name,
      address: item.address || '',
      lat: loc.lat,
      lng: loc.lng
    };

    const list = [...this.data.places, newPlace];
    this.setData({
      places: list,
      destQuery: '',
      suggestions: []
    });

    this.updateMarkers();
  },

  onRemovePlace(e) {
    const id = e.currentTarget.dataset.id;
    const list = this.data.places.filter(p => p.id !== id);
    this.setData({ places: list });
    this.updateMarkers();
  },

  updateMarkers() {
    const markers = [];
    // Origin
    if (this.data.originPoint) {
      markers.push({
        id: 0,
        latitude: this.data.originPoint.lat,
        longitude: this.data.originPoint.lng,
        width: 30, height: 30,
        iconPath: '/images/icons/marker-blue.png',
        callout: { content: '起点', display: 'ALWAYS' }
      });
    }
    // Places
    this.data.places.forEach((p, i) => {
      markers.push({
        id: i + 1,
        latitude: p.lat,
        longitude: p.lng,
        width: 30, height: 30,
        iconPath: '/images/icons/marker-red.png', // Assuming red for dest
        callout: { content: `${i + 1}`, display: 'ALWAYS', borderRadius: 4, padding: 4 }
      });
    });
    this.setData({ markers });
  },

  // Dummy init city search
  locateCity() {
    // Could call geocode(regeo) here too
  },

  // ================= MODULE 2: ROUTE =================
  async generateRoute() {
    if (this.data.places.length === 0 || !this.data.originPoint) {
      return;
    }

    wx.showLoading({ title: '规划中...' });

    try {
      const res = await wx.cloud.callFunction({
        name: 'routeplan',
        data: {
          start: { location: `${this.data.originPoint.lng},${this.data.originPoint.lat}` }, // Assuming routeplan handles standard lat,lng but checking my own implementation I swapped it there
          // Actually my routeplan index.js implementation expects {location: 'lat,lng'} or input string.
          // Wait, earlier I wrote `swap(start.location)`.
          // If I pass from frontend as `${lng},${lat}` (standard map SDK), I need routeplan to be consistent.
          // My routeplan implementation: `const swap = (locStr) => { ... }`. It expects `lng,lat` input and swaps to `lat,lng` for Tencent API.
          // So Frontend MUST pass `lng,lat`.
          points: this.data.places.map(p => ({ location: `${p.lng},${p.lat}` }))
        }
      });

      if (res.result && res.result.code === 0) {
        const data = res.result.data;
        const polyStr = data.legs.map(l => l.polyline).join(';');
        const allPoints = [
          { latitude: this.data.originPoint.lat, longitude: this.data.originPoint.lng },
          ...this.data.places.map(p => ({ latitude: p.lat, longitude: p.lng }))
        ];

        // Parse polyline string into coordinates for map component
        // format: lat,lng;lat,lng...
        const points = polyStr.split(';').map(p => {
          const [lat, lng] = p.split(',');
          return { latitude: parseFloat(lat), longitude: parseFloat(lng) };
        });

        this.setData({
          routeData: data,
          polylines: [{
            points: points,
            color: '#0EA5E9',
            width: 6,
            arrowLine: true
          }],
          allPoints: allPoints,
          // Setup route data with real start/end points object for navigation usage
          'routeData.legs': data.legs.map((l, idx) => {
            // We need coordinate info for navigation. 
            // My routeplan returns start/end NAMES.
            // I should probably map them back to my local places data to get coordinates for navigation button.
            // Or rely on the index.

            // Logic: 0 -> Leg 1 (Origin -> Place 1)
            //        1 -> Leg 2 (Place 1 -> Place 2)

            let startObj, endObj;
            if (idx === 0) {
              startObj = this.data.originPoint;
              endObj = this.data.places[0];
            } else {
              startObj = this.data.places[idx - 1];
              endObj = this.data.places[idx];
            }

            return {
              ...l,
              _start: startObj,
              _end: endObj
            };
          })
        });
      }
    } catch (e) {
      console.error(e);
      wx.showToast({ title: '规划失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  onNavLeg(e) {
    const idx = e.currentTarget.dataset.index;
    const leg = this.data.routeData.legs[idx];
    if (leg && leg._end) {
      wx.openLocation({
        latitude: leg._end.lat,
        longitude: leg._end.lng,
        name: leg._end.name,
        address: leg._end.address
      });
    }
  },

  // ================= MODULE 3: GUIDE =================
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

  async onGenerateGuide() {
    this.setData({ guideLoading: true, guideResult: null });
    try {
      const res = await wx.cloud.callFunction({
        name: 'guide',
        data: this.data.guideParams
      });

      if (res.result && res.result.success) {
        this.setData({ guideResult: res.result.data });
      } else {
        throw new Error(res.result?.error || 'Unknown Error');
      }
    } catch (e) {
      wx.showToast({ title: '生成失败，请重试', icon: 'none' });
      console.error(e);
    } finally {
      this.setData({ guideLoading: false });
    }
  }

});
