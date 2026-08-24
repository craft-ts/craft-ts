export type CraftCliIo = Readonly<{
  cwd: string;
  write(text: string): void;
  writeError(text: string): void;
}>;

export function processIo(): CraftCliIo {
  return {
    cwd: process.cwd(),
    write: (text) => {
      process.stdout.write(`${text}\n`);
    },
    writeError: (text) => {
      process.stderr.write(`${text}\n`);
    },
  };
}
