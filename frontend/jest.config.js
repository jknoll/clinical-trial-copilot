/** @type {import('jest').Config} */
module.exports = {
  testMatch: ["**/e2e/**/*.e2e.test.ts"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          module: "commonjs",
          moduleResolution: "node",
          esModuleInterop: true,
          target: "ES2020",
        },
      },
    ],
  },
  testTimeout: 30000,
};
