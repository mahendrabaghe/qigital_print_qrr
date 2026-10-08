// Runs before each test file (before any module import evaluates env.ts).
process.env.NODE_ENV = 'test';
process.env.DEMO_DELAY_MS = '200';
process.env.FILE_STORAGE_DIR = './storage/test';
