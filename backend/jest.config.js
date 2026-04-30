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
  ],
};
