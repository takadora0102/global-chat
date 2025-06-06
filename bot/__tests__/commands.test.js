import fs from 'fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

describe('command exports', () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const commandsDir = path.join(__dirname, '..', 'commands');

  test('each command has data property', async () => {
    const files = await fs.readdir(commandsDir);
    for (const file of files) {
      if (!file.endsWith('.js')) continue;
      const mod = await import(path.join(commandsDir, file));
      expect(mod.default).toBeDefined();
      expect(mod.default.data).toBeDefined();
      if (mod.default.execute !== undefined) {
        expect(typeof mod.default.execute).toBe('function');
      }
    }
  });
});
