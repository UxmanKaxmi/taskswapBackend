export default {
  preset: "ts-jest",
  testEnvironment: "node",
  setupFiles: ["<rootDir>/jest.setup.ts"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  moduleFileExtensions: ["ts", "js"],
  moduleNameMapper: {
    "^@app/(.*)$": "<rootDir>/src/app/$1",
    "^@features/(.*)$": "<rootDir>/src/features/$1",
    "^@shared/(.*)$": "<rootDir>/src/shared/$1",
    "^@assets/(.*)$": "<rootDir>/src/assets/$1",
    "^@lib/(.*)$": "<rootDir>/src/lib/$1",
    "^@navigation/(.*)$": "<rootDir>/src/navigation/$1",
    "^@db/(.*)$": "<rootDir>/src/db/$1",
    "^@middleware/(.*)$": "<rootDir>/src/middleware/$1",
    "^@types/(.*)$": "<rootDir>/src/types/$1",
    "^@utils/(.*)$": "<rootDir>/src/utils/$1",
    "^@errors/(.*)$": "<rootDir>/src/errors/$1",
    "^@models/(.*)$": "<rootDir>/src/models/$1",
    "^@config/(.*)$": "<rootDir>/src/config/$1"
  },
};
