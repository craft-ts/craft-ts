import {
  div,
  h1,
  p,
  section,
  type CraftNodeChildren,
} from '@craft-ts/component';
import { page as pageStyle } from '../ssr-lab.style';

export function page(
  eyebrow: string,
  title: string,
  intro: string,
  content: CraftNodeChildren,
) {
  return section({ class: pageStyle.root }, [
    div({ class: pageStyle.hero }, [
      p({ class: pageStyle.eyebrow }, eyebrow),
      h1({ class: pageStyle.title }, title),
      p({ class: pageStyle.intro }, intro),
    ]),
    content,
  ]);
}
