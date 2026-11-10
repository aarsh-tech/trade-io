/**
 * Local-only unit tests for the Stocks-in-Play margin sizing (test/ is outside src/, so the server build never sees it).
 * Run from apps/auth-service:  npx jest -c test/jest.sip.config.js
 */
module.exports = {
  rootDir: '..',
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        module: 'commonjs',
        target: 'ES2021',
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        skipLibCheck: true,
        strictNullChecks: false,
        noImplicitAny: false,
        types: ['jest', 'node'],
      },
    }],
  },
};
