export default {
  transform: {},
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  modulePathIgnorePatterns: ['<rootDir>/Vemata', '<rootDir>/frontend-workspace', '<rootDir>/node_modules'],
  watchPathIgnorePatterns: ['<rootDir>/Vemata', '<rootDir>/frontend-workspace']
};
