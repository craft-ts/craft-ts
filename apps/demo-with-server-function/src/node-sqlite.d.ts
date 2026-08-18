declare module 'node:sqlite' {
  export class DatabaseSync {
    constructor(filename: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }

  export class StatementSync {
    all(...parameters: readonly unknown[]): readonly unknown[];
  }
}
