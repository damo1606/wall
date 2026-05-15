/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/__tests__"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      { tsconfig: { module: "commonjs", moduleResolution: "node", isolatedModules: true } },
    ],
  },
}
