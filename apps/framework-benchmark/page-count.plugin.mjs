// Vite plugin used only by the instance-counting build of page-lab.mjs. It
// wraps every component of the "page" fixtures so that each instantiation
// increments window.__components[<component name>]. It never runs in the
// timing builds.
const craftHeader = `import { craftComponent as __craftComponent } from '@craft-ts/component';
const __countedComponent = (name, ...rest) => {
  const component = __craftComponent(name, ...rest);
  return new Proxy(component, {
    apply(target, self, args) {
      const counts = (globalThis.__components ??= {});
      counts[name] = (counts[name] ?? 0) + 1;
      return Reflect.apply(target, self, args);
    },
  });
};
`;
const solidHeader = `const __countedSolid = (name, component) => (props) => {
  const counts = (globalThis.__components ??= {});
  counts[name] = (counts[name] ?? 0) + 1;
  return component(props);
};
`;

export function componentCounter() {
  return {
    name: 'page-component-counter',
    enforce: 'pre',
    transform(code, id) {
      const path = id.split('?')[0].replaceAll('\\', '/');
      if (/\/src\/craft-page\/[^/]+\.ts$/.test(path) && code.includes('craftComponent(')) {
        return {
          code: craftHeader + code.replaceAll(/\bcraftComponent\(/g, '__countedComponent('),
          map: null,
        };
      }
      if (/\/src\/solid\/page\/[^/]+\.tsx$/.test(path)) {
        const names = [];
        const body = code.replaceAll(
          /^(export )?function ([A-Z]\w*)\(/gm,
          (_, exported, name) => {
            names.push([name, Boolean(exported)]);
            return `function __c_${name}(`;
          },
        );
        if (names.length === 0) return null;
        const tail = names
          .map(
            ([name, exported]) =>
              `${exported ? 'export ' : ''}const ${name} = __countedSolid('${name}', __c_${name});`,
          )
          .join('\n');
        return { code: `${solidHeader}${body}\n${tail}\n`, map: null };
      }
      return null;
    },
  };
}
