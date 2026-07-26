export type ComponentMigrationDiagnosticCode = 'NAME_NOT_DEDUCIBLE';

export type ComponentMigrationDiagnostic = {
  code: ComponentMigrationDiagnosticCode;
  filePath: string;
  message: string;
  manual: true;
};
