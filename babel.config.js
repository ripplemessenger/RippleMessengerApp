module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      "module:@react-native/babel-preset",
      // NativeWind v4: transforms className -> style lookup.
      // (withNativeWind in metro.config.js only processes the CSS, it does NOT
      // transform JSX — without this, className props are silently ignored)
      // Inline preset instead of 'nativewind/babel': that preset also loads
      // 'react-native-worklets/plugin' (reanimated 4), which is not installed —
      // this project uses reanimated 3 with 'react-native-reanimated/plugin'.
      {
        plugins: [
          require("react-native-css-interop/dist/babel-plugin").default,
          [
            "@babel/plugin-transform-react-jsx",
            { runtime: "automatic", importSource: "react-native-css-interop" },
          ],
        ],
      },
    ],
    plugins: [
      // MUST be last for reanimated worklets
      "react-native-reanimated/plugin",
    ],
  };
};
