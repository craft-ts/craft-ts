import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { demoAccounts } from '../src/shared/accounts';

const target = resolve('.craft/resume.personas.local.json');
await mkdir(resolve('.craft'), { recursive: true });
await writeFile(
  target,
  `${JSON.stringify(
    [
      ...demoAccounts.map((account) => ({
        role: account.role,
        id: account.id,
        params: { email: account.email, password: account.password },
      })),
      { role: 'guest', id: 'guest', params: {} },
    ],
    null,
    2,
  )}\n`,
  { encoding: 'utf8', mode: 0o600 },
);
console.log(`Resume personas written to ${target}`);
