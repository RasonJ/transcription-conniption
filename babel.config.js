module.exports = function (api) {
  const isTest = api.env("test");
  return {
    presets: [["babel-preset-expo", { unstable_transformImportMeta: true }]],
    plugins: isTest ? [require.resolve("./babel/jestDynamicImport")] : [],
  };
};
