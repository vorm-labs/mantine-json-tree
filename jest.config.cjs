module.exports = {
  testPathIgnorePatterns: ['/node_modules/', '/examples/'],
  testEnvironment: 'jest-environment-jsdom',
  transform: {
    '^.+\\.tsx?$': 'esbuild-jest',
  },
  testMatch: ['**/?(*.)+(spec|test).ts?(x)'],
  setupFilesAfterEnv: ['./jsdom.mocks.cjs'],
  moduleNameMapper: {
    '\\.(css)$': 'identity-obj-proxy',
  },
};
