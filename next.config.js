/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,  // 启用 React 严格模式，帮助你捕捉潜在问题
  swcMinify: true,        // 使用 SWC 来进行代码压缩，提升性能
};

module.exports = nextConfig;
