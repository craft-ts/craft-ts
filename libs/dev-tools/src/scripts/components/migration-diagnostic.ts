export type ComponentMigrationDiagnosticCode =
  | 'NAME_NOT_DEDUCIBLE'
  | 'TEMPLATE_MERGE_MANUAL';

export type ComponentMigrationDiagnostic = {
  code: ComponentMigrationDiagnosticCode;
  filePath: string;
  message: string;
  manual: true;
};
