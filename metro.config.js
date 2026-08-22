const { withNativeWind } = require("nativewind/metro");
const { getDefaultConfig } = require("@react-native/metro-config");

const path = require("path");

module.exports = withNativeWind(
  (() => {
    const config = getDefaultConfig(__dirname);
    // Node.js polyfills for Hermes - map Node built-ins to our shims
    config.resolver.extraNodeModules = {
      crypto: path.resolve(__dirname, "src/polyfills/crypto.js"),
      buffer: path.resolve(__dirname, "node_modules/buffer/"),
    };
    return config;
  })(),
  {
    input: "./src/global.css",
  },
);
