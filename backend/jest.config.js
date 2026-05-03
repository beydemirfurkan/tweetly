const moduleNameMapper = {
  '^@domain/(.*)$': '<rootDir>/src/domain/$1',
  '^@common/(.*)$': '<rootDir>/src/common/$1',
  '^@persistence/(.*)$': '<rootDir>/src/persistence/$1',
  '^@/(.*)$': '<rootDir>/src/$1',
};

module.exports = {
  projects: [
    {
      displayName: 'unit',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testRegex: '.*\\.spec\\.ts$',
      rootDir: '.',
      roots: ['<rootDir>/src'],
      moduleFileExtensions: ['js', 'json', 'ts'],
      moduleNameMapper,
      transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
      setupFiles: ['<rootDir>/src/test/setup.ts'],
      coverageDirectory: '<rootDir>/coverage',
      collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.spec.ts',
        '!src/**/*.module.ts',
        '!src/main.ts',
        '!src/persistence/migrations/**',
      ],
      coverageThreshold: {
        global: { statements: 70, branches: 55, functions: 70, lines: 70 },
      },
    },
    {
      displayName: 'integration',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testRegex: '.*\\.spec\\.ts$',
      rootDir: '.',
      roots: ['<rootDir>/test/integration'],
      moduleFileExtensions: ['js', 'json', 'ts'],
      moduleNameMapper,
      transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
      setupFiles: ['<rootDir>/test/integration/setup.ts'],
      maxWorkers: 1,
    },
  ],
  testTimeout: 60000,
};
