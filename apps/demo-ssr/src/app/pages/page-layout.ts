import {
  div,
  h1,
  p,
  section,
  type CraftNodeChildren,
} from '@craft-ts/component';

export function page(
  eyebrow: string,
  title: string,
  intro: string,
  content: CraftNodeChildren,
) {
  return section({ class: 'route-page' }, [
    div({ class: 'hero' }, [
      p({ class: 'eyebrow' }, eyebrow),
      h1(title),
      p({ class: 'intro' }, intro),
    ]),
    content,
  ]);
}
