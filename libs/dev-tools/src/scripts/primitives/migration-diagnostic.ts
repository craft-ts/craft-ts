export type PrimitiveMigrationDiagnosticCode =
  | 'SIGNAL_FORM_REQUIRES_INSERT_FORM'
  | 'ASYNC_VALIDATOR_REQUIRES_QUERY'
  | 'RX_RESOURCE_REQUIRES_QUERY'
  | 'IMPERATIVE_WORKFLOW_REQUIRES_REVIEW';

export type PrimitiveMigrationDiagnostic = {
  code: PrimitiveMigrationDiagnosticCode;
  filePath: string;
  symbol?: string;
  message: string;
  manual: true;
};
