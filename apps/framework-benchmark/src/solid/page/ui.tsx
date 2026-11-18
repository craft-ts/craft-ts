import { cx, glyph, initials } from '../../page-common.js';
import { useCurrentUser, usePage } from './store.js';

export function Icon(props: { name: string }) {
  return (
    <span class={cx('icon', `icon--${props.name}`)} aria-hidden="true">
      {glyph(props.name)}
    </span>
  );
}

export function Badge(props: { tone: string; text: string }) {
  const page = usePage();
  return (
    <span
      class={cx('badge', `badge--${props.tone}`, page.isDark() && 'is-dark')}
    >
      {props.text}
    </span>
  );
}

export function Avatar(props: { name: string; size: string }) {
  const user = useCurrentUser();
  return (
    <span
      class={cx(
        'avatar',
        `avatar--${props.size}`,
        props.name === user.userName() && 'avatar--me',
      )}
      title={props.name}
    >
      {initials(props.name)}
    </span>
  );
}

export function Button(props: { label: string; variant: string; action: any }) {
  const page = usePage();
  return (
    <button
      type="button"
      class={cx('btn', `btn--${props.variant}`, page.isDark() && 'is-dark')}
      onClick={() => page.dispatch(props.action)}
    >
      {props.label}
    </button>
  );
}

export function IconButton(props: {
  icon: string;
  label: string;
  action: any;
  active: boolean;
}) {
  const page = usePage();
  return (
    <button
      type="button"
      class={cx('icon-btn', props.active && 'is-active')}
      title={props.label}
      aria-label={props.label}
      onClick={() => page.dispatch(props.action)}
    >
      <Icon name={props.icon} />
    </button>
  );
}

export function Tag(props: { text: string }) {
  return <span class="tag">{props.text}</span>;
}

export function Timestamp(props: { text: string }) {
  return <span class="timestamp">{props.text}</span>;
}

export function Counter(props: { icon: string; value: number }) {
  return (
    <span class="counter">
      <Icon name={props.icon} />
      <span class="counter__value">{String(props.value)}</span>
    </span>
  );
}
