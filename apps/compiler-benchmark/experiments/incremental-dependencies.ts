import ts from 'typescript';

/** Conservative dependencies of a literal reader; no input aliases or escapes. */
export function bindingInputDependencies(
  expression: ts.Expression,
  input: ts.BindingName | undefined,
  checker: ts.TypeChecker,
): { inputs: string[]; stable: boolean } | undefined {
  if (!input || !ts.isIdentifier(input)) return undefined;
  const symbol = checker.getSymbolAtLocation(input);
  if (!symbol) return undefined;
  const deps = new Set<string>();
  let stable = true;
  const unwrap = (node: ts.Expression): ts.Expression => {
    while (
      ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isNonNullExpression(node)
    )
      node = node.expression;
    return node;
  };
  const member = (node: ts.Expression) => {
    if (
      !ts.isPropertyAccessExpression(node) ||
      node.questionDotToken ||
      !ts.isIdentifier(node.expression) ||
      checker.getSymbolAtLocation(node.expression) !== symbol
    )
      return false;
    if (['__proto__', 'constructor', 'prototype'].includes(node.name.text))
      return false;
    deps.add(node.name.text);
    return true;
  };
  const binary = new Set([
    ts.SyntaxKind.PlusToken,
    ts.SyntaxKind.MinusToken,
    ts.SyntaxKind.AsteriskToken,
    ts.SyntaxKind.SlashToken,
    ts.SyntaxKind.PercentToken,
    ts.SyntaxKind.AsteriskAsteriskToken,
    ts.SyntaxKind.EqualsEqualsToken,
    ts.SyntaxKind.EqualsEqualsEqualsToken,
    ts.SyntaxKind.ExclamationEqualsToken,
    ts.SyntaxKind.ExclamationEqualsEqualsToken,
    ts.SyntaxKind.LessThanToken,
    ts.SyntaxKind.LessThanEqualsToken,
    ts.SyntaxKind.GreaterThanToken,
    ts.SyntaxKind.GreaterThanEqualsToken,
    ts.SyntaxKind.AmpersandAmpersandToken,
    ts.SyntaxKind.BarBarToken,
    ts.SyntaxKind.QuestionQuestionToken,
  ]);
  const visit = (value: ts.Expression): boolean => {
    const node = unwrap(value);
    if (
      ts.isStringLiteralLike(node) ||
      ts.isNumericLiteral(node) ||
      [
        ts.SyntaxKind.TrueKeyword,
        ts.SyntaxKind.FalseKeyword,
        ts.SyntaxKind.NullKeyword,
      ].includes(node.kind)
    )
      return true;
    if (member(node)) return true;
    if (ts.isYieldExpression(node))
      return (
        !!node.asteriskToken && !!node.expression && visit(node.expression)
      );
    if (ts.isCallExpression(node))
      return (
        node.arguments.length === 0 &&
        !node.questionDotToken &&
        member(node.expression)
      );
    if (ts.isPropertyAccessExpression(node)) {
      stable = false;
      return !node.questionDotToken && visit(node.expression);
    }
    if (ts.isTemplateExpression(node))
      return node.templateSpans.every((span) => visit(span.expression));
    if (ts.isBinaryExpression(node))
      return (
        binary.has(node.operatorToken.kind) &&
        visit(node.left) &&
        visit(node.right)
      );
    if (ts.isConditionalExpression(node))
      return (
        visit(node.condition) && visit(node.whenTrue) && visit(node.whenFalse)
      );
    if (ts.isPrefixUnaryExpression(node))
      return (
        [
          ts.SyntaxKind.PlusToken,
          ts.SyntaxKind.MinusToken,
          ts.SyntaxKind.ExclamationToken,
          ts.SyntaxKind.TildeToken,
        ].includes(node.operator) && visit(node.operand)
      );
    return false;
  };
  let node = unwrap(expression);
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    if (
      node.parameters.length ||
      node.name ||
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)
    )
      return undefined;
    if (ts.isBlock(node.body)) {
      if (node.body.statements.length !== 1) return undefined;
      const statement = node.body.statements[0];
      if (!ts.isReturnStatement(statement) || !statement.expression)
        return undefined;
      node = statement.expression;
    } else node = node.body;
  }
  return visit(node) ? { inputs: [...deps], stable } : undefined;
}
