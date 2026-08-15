export type PrimitiveMigrationDiagnosticCode =
  | 'PRIMITIVE_NAME_REQUIRES_REVIEW'
  | 'SIGNAL_FORM_REQUIRES_INSERT_FORM'
  | 'ASYNC_VALIDATOR_REQUIRES_QUERY'
  | 'RX_RESOURCE_REQUIRES_QUERY'
  | 'FORM_TREE_INSERT_EXTRACTION_REQUIRES_REVIEW'
  | 'IMPERATIVE_WORKFLOW_REQUIRES_REVIEW';

export type PrimitiveMigrationDiagnostic = {
  code: PrimitiveMigrationDiagnosticCode;
  filePath: string;
  symbol?: string;
  message: string;
  manual: true;
};
