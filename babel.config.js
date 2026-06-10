module.exports = function (api) {
  api.cache(true);
  return {
    // babel-preset-expo (SDK 54) auto-applies the reanimated/worklets plugin.
    // NativeWind v4 requires jsxImportSource + its babel preset so `className`
    // props are compiled into styles.
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
  };
};
