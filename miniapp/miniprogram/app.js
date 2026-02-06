// app.js
App({
  onLaunch() {
    this.globalData = {
      // Cloud environment ID
      env: "cloud1-5gdrm24x662638e9",
    };

    if (!wx.cloud) {
      console.error("请使用 2.2.3 或以上的基础库以使用云能力");
    } else {
      wx.cloud.init({
        env: this.globalData.env,
        traceUser: true,
      });
    }

    if (wx.loadFontFace && wx.cloud) {
      const fileList = [
        "cloud://cloud1-5gdrm24x662638e9.636c-cloud1-5gdrm24x662638e9-1400253462/NotoSansSC-Regular.ttf",
        "cloud://cloud1-5gdrm24x662638e9.636c-cloud1-5gdrm24x662638e9-1400253462/NotoSansSC-SemiBold.ttf",
      ];

      wx.cloud
        .getTempFileURL({ fileList })
        .then((res) => {
          const map = {};
          (res.fileList || []).forEach((item) => {
            if (item.fileID && item.tempFileURL) {
              map[item.fileID] = item.tempFileURL;
            }
          });

          const regularUrl = map[fileList[0]];
          const semiboldUrl = map[fileList[1]];

          if (regularUrl) {
            wx.loadFontFace({
              family: "Noto Sans SC",
              source: `url("${regularUrl}")`,
              global: true,
              success: () => {
                console.info("Noto Sans SC regular loaded");
              },
              fail: (err) => {
                console.warn("Load font failed", err);
              },
            });
          }

          if (semiboldUrl) {
            wx.loadFontFace({
              family: "Noto Sans SC",
              source: `url("${semiboldUrl}")`,
              weight: "600",
              global: true,
              success: () => {
                console.info("Noto Sans SC semibold loaded");
              },
              fail: (err) => {
                console.warn("Load font failed", err);
              },
            });
          }
        })
        .catch((err) => {
          console.warn("Get font url failed", err);
        });
    }
  },
});
