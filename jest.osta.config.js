/** @type {import('jest').Config} */
const base = require("./jest.config.js");

module.exports = {
  ...base,
  setupFilesAfterEnv: [...(base.setupFilesAfterEnv ?? []), "<rootDir>/jest.osta.setup.js"],
  testMatch: ["**/__tests__/integration/osta/**/*.test.ts"],
  testPathIgnorePatterns: ["/node_modules/"],
};
