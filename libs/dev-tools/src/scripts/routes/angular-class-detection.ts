import { Node, type ClassDeclaration, type SourceFile } from 'ts-morph';

const ANGULAR_DECORATORS = new Set([
  'Component',
  'Directive',
  'Injectable',
  'Pipe',
]);

export function findAngularDecoratedClass(sourceFile: SourceFile): {
  className?: string;
  skipped: boolean;
} {
  const classes = sourceFile
    .getClasses()
    .filter((declaration) => declaration.getDecorators().some(isAngularDecorator));
  if (classes.length > 1) return { skipped: true };
  const classDeclaration = classes[0];
  if (!classDeclaration) return { skipped: false };
  const className = classDeclaration.getName();
  return className ? { className, skipped: false } : { skipped: true };
}

function isAngularDecorator(decorator: ReturnType<ClassDeclaration['getDecorators']>[number]): boolean {
  const expression = decorator.getExpression();
  const name = Node.isCallExpression(expression)
    ? expression.getExpression().getText()
    : expression.getText();
  return ANGULAR_DECORATORS.has(name.split('.').at(-1) ?? name);
}
