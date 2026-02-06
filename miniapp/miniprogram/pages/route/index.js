Page({
  data: {
    routeMap: { lat: 30.572269, lng: 104.066541, scale: 12 },
    markers: [],
    polylines: [],
    allPoints: [],
    routeData: {
      totalDistanceText: '',
      totalDurationText: '',
      legs: []
    },
    originPoint: null,
    places: []
  },
  TENCENT_REFERER: 'travel-planner',

  onShow() {
    const payload = wx.getStorageSync('route_payload');
    if (!payload || !payload.originPoint || !payload.places || payload.places.length === 0) {
      wx.showToast({ title: '请先设置起点并添加目的地', icon: 'none' });
      return;
    }

    this.setData({
      originPoint: payload.originPoint,
      places: payload.places,
      'routeMap.lat': payload.originPoint.lat,
      'routeMap.lng': payload.originPoint.lng,
      'routeMap.scale': 12
    });

    this.updateMarkers();
    this.generateRoute();
  },

  goInput() {
    wx.redirectTo({ url: '/pages/input/index' });
  },

  goGuide() {
    wx.redirectTo({ url: '/pages/guide/index' });
  },

  normalizePoint(raw) {
    if (!raw) return null;
    let lat = raw.lat !== undefined ? raw.lat : raw.latitude;
    let lng = raw.lng !== undefined ? raw.lng : raw.longitude;

    if ((!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) && typeof raw.location === 'string') {
      const parts = raw.location.split(',');
      if (parts.length === 2) {
        const a = Number(parts[0]);
        const b = Number(parts[1]);
        if (Number.isFinite(a) && Number.isFinite(b)) {
          // 通常 location 是 "lng,lat"
          if (Math.abs(a) > 90 && Math.abs(b) <= 90) {
            lng = a;
            lat = b;
          } else if (Math.abs(a) <= 90 && Math.abs(b) > 90) {
            lat = a;
            lng = b;
          } else {
            // 无法可靠判断时默认按 "lng,lat"
            lng = a;
            lat = b;
          }
        }
      }
    }

    return {
      ...raw,
      lat: Number(lat),
      lng: Number(lng)
    };
  },

  isValidLatLngPoint(p) {
    if (!p) return false;
    const normalized = this.normalizePoint(p);
    const lat = normalized?.lat;
    const lng = normalized?.lng;
    return (
      Number.isFinite(Number(lat)) &&
      Number.isFinite(Number(lng)) &&
      Math.abs(Number(lat)) <= 90 &&
      Math.abs(Number(lng)) <= 180
    );
  },

  getArrivalPlaces() {
    const { routeData, places } = this.data;
    const fromLegs = (routeData?.legs || [])
      .map((leg) => {
        if (!leg) return null;
        const p = leg._end || leg.end;
        return this.normalizePoint(p);
      })
      .filter((p) => this.isValidLatLngPoint(p));
    if (fromLegs.length > 0) return fromLegs;

    const fromOrdered = (routeData?.orderedPlaces || [])
      .map((p) => this.normalizePoint(p))
      .filter((p) => this.isValidLatLngPoint(p));
    if (fromOrdered.length > 0) return fromOrdered;

    return (places || [])
      .map((p) => this.normalizePoint(p))
      .filter((p) => this.isValidLatLngPoint(p));
  },

  updateMarkers() {
    const markers = [];
    const { originPoint } = this.data;
    const arrivalPlaces = this.getArrivalPlaces();
    
    // 起点标记（无数字）
    if (originPoint) {
      markers.push({
        id: 0,
        latitude: Number(originPoint.lat),
        longitude: Number(originPoint.lng),
        width: 30,
        height: 30,
        iconPath: '/images/icons/marker-blue.png',
        callout: { content: '起点', display: 'ALWAYS' }
      });
    }
    
    if (arrivalPlaces.length > 0) {
      arrivalPlaces.forEach((p, i) => {
        const lat = Number(p.lat !== undefined ? p.lat : p.latitude);
        const lng = Number(p.lng !== undefined ? p.lng : p.longitude);
        markers.push({
          id: i + 1,
          latitude: lat,
          longitude: lng,
          width: 30,
          height: 30,
          iconPath: '/images/icons/marker-red.png'
        });
      });
    }
    
    this.setData({ markers });
  },

  parsePolyline(poly = null) {
    if (!poly) return [];
    const isValid = (p) =>
      p &&
      !Number.isNaN(p.latitude) &&
      !Number.isNaN(p.longitude) &&
      Math.abs(p.latitude) <= 90 &&
      Math.abs(p.longitude) <= 180;
    if (Array.isArray(poly)) {
      return poly.map((p) => ({
        latitude: p.lat,
        longitude: p.lng
      })).filter(isValid);
    }
    if (typeof poly === 'string') {
      if (poly.indexOf(',') >= 0) {
        return poly.split(';').map((p) => {
          const [lat, lng] = p.split(',');
          return { latitude: parseFloat(lat), longitude: parseFloat(lng) };
        }).filter(isValid);
      }
      const nums = poly.split(';').map(n => parseFloat(n)).filter(n => !Number.isNaN(n));
      const pts = [];
      for (let i = 0; i < nums.length - 1; i += 2) {
        pts.push({ latitude: nums[i], longitude: nums[i + 1] });
      }
      return pts.filter(isValid);
    }
    return [];
  },

  async generateRoute() {
    if (!this.data.originPoint || this.data.places.length === 0) return;
    wx.showLoading({ title: '规划中…' });
    try {
      const res = await wx.cloud.callFunction({
        name: 'routeplan',
        data: {
          start: { location: `${this.data.originPoint.lng},${this.data.originPoint.lat}`, name: '起点' },
          points: this.data.places.map(p => ({ location: `${p.lng},${p.lat}`, name: p.name })),
          optimize: true
        }
      });

      if (res.result && res.result.code === 0) {
        const data = res.result.data;
        const orderedRaw = data.orderedPlaces || this.data.places;
        const ordered = orderedRaw
          .map((p) => this.normalizePoint(p))
          .filter((p) => this.isValidLatLngPoint(p));

        const legs = data.legs.map((l, idx) => {
          // 直接使用云函数返回的 start 和 end（它们已经包含 lat/lng）
          const start = l.start;
          const end = l.end;
          
          // 多来源兜底，避免后端字段差异导致 NaN
          const startPoint =
            this.normalizePoint(start) ||
            this.normalizePoint(this.data.originPoint) ||
            this.data.originPoint;

          const endPoint =
            this.normalizePoint(end) ||
            this.normalizePoint(ordered[idx]) ||
            this.normalizePoint(this.data.places[idx]) ||
            null;
          
          return {
            ...l,
            start: { name: startPoint?.name || '起点', address: startPoint?.address || '' },
            end: { name: endPoint?.name || '目的地', address: endPoint?.address || '' },
            _start: startPoint,
            _end: endPoint,
            _polyline: this.parsePolyline(l.polylinePoints || l.polyline)
          };
        });

        const arrivalPlaces =
          legs.map((l) => l._end).filter((p) => this.isValidLatLngPoint(p)).length > 0
            ? legs.map((l) => l._end).filter((p) => this.isValidLatLngPoint(p))
            : ordered.filter((p) => this.isValidLatLngPoint(p));
        const allPoints = [
          { latitude: this.data.originPoint.lat, longitude: this.data.originPoint.lng },
          ...arrivalPlaces.map((p) => ({ latitude: p.lat, longitude: p.lng }))
        ];

        const polyPoints = legs.reduce((acc, l) => acc.concat(l._polyline || []), []);
        const safePoly = polyPoints.filter((p) =>
          Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180
        );

        this.setData({
          routeData: { ...data, legs, orderedPlaces: arrivalPlaces },
          places: arrivalPlaces,
          allPoints,
          polylines: safePoly.length > 0 ? [{
            points: safePoly,
            color: '#0EA5E9',
            width: 6,
            arrowLine: true
          }] : []
        }, () => {
          // 确保 setData 完成后再更新标记
          this.updateMarkers();
          wx.setStorageSync('route_payload', {
            originPoint: this.data.originPoint,
            places: arrivalPlaces
          });
        });
      } else {
        wx.showToast({ title: '规划失败', icon: 'none' });
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
    if (leg) {
      const candidates = [
        leg._end,
        leg.end,
        this.data.routeData?.orderedPlaces?.[idx],
        this.data.places?.[idx],
        (this.data.places || []).find(
          (p) => p && (p.name === leg?.end?.name || p.name === leg?._end?.name)
        )
      ];
      const to = candidates
        .map((p) => this.normalizePoint(p))
        .find((p) => this.isValidLatLngPoint(p));

      if (to) {
        // 使用微信内置地图打开位置，用户可以选择使用腾讯地图/高德地图/百度地图导航
        wx.openLocation({
          latitude: Number(to.lat),
          longitude: Number(to.lng),
          name: to.name || '目的地',
          address: to.address || '',
          scale: 16,
          success: () => {
            console.info('Open location success');
          },
          fail: (err) => {
            console.error('Open location failed:', err);
            wx.showToast({ title: '打开地图失败', icon: 'none' });
          }
        });
        return;
      }
      
      // 调试信息
      console.error('Invalid coordinates candidates:', candidates);
      wx.showToast({ title: '当前路段坐标无效', icon: 'none' });
    }
  }
});
