import { emitKeypressEvents } from 'node:readline';

import type { CreateAgent } from '../scripts/create/create-project.js';

export const CREATE_AGENT_OPTIONS: readonly {
  readonly value: CreateAgent;
  readonly label: string;
}[] = [
  { value: 'codex', label: 'Codex' },
  { value: 'cursor', label: 'Cursor' },
  { value: 'claude-code', label: 'Claude Code' },
];

export type InteractiveOption<Value extends string> = {
  readonly value: Value;
  readonly label: string;
};

type Key = {
  readonly name?: string;
  readonly ctrl?: boolean;
};

export type AgentSelectorInput = NodeJS.ReadStream & {
  setRawMode(mode: boolean): NodeJS.ReadStream;
};

type AgentSelectorOutput = Pick<NodeJS.WriteStream, 'write'>;

type SelectorInput = AgentSelectorInput;

function selectValuesInteractively<Value extends string>(
  options: readonly InteractiveOption<Value>[],
  title: string,
  initialSelection: readonly Value[],
  multiple: boolean,
  input: SelectorInput,
  output: AgentSelectorOutput,
  minimumSelection = 0,
): Promise<readonly Value[]> {
  const selected = new Set<Value>(initialSelection);
  let cursor = Math.max(
    0,
    options.findIndex((option) => selected.has(option.value)),
  );
  let rendered = false;

  const render = (): void => {
    if (rendered) output.write(`\u001b[${options.length + 1}A`);
    output.write(`${title}\n`);
    for (const [index, option] of options.entries()) {
      const pointer = index === cursor ? '❯' : ' ';
      const marker = multiple
        ? `${selected.has(option.value) ? '[x]' : '[ ]'} `
        : '';
      output.write(`${pointer} ${marker}${option.label}\n`);
    }
    rendered = true;
  };

  return new Promise<readonly Value[]>((resolve, reject) => {
    const wasRaw = input.isRaw ?? false;
    const finish = (result: readonly Value[]): void => {
      input.removeListener('keypress', onKeypress);
      input.setRawMode(wasRaw);
      input.pause();
      output.write('\n');
      resolve(result);
    };
    const cancel = (): void => {
      input.removeListener('keypress', onKeypress);
      input.setRawMode(wasRaw);
      input.pause();
      output.write('\n');
      reject(new Error('Interactive selection cancelled.'));
    };
    const onKeypress = (_input: string, key: Key): void => {
      if (key.ctrl && key.name === 'c') {
        cancel();
        return;
      }
      if (key.name === 'up') {
        cursor = (cursor - 1 + options.length) % options.length;
        render();
        return;
      }
      if (key.name === 'down') {
        cursor = (cursor + 1) % options.length;
        render();
        return;
      }
      if (multiple && key.name === 'space') {
        const value = options[cursor].value;
        if (selected.has(value)) {
          if (selected.size > minimumSelection) selected.delete(value);
        } else selected.add(value);
        render();
        return;
      }
      if (key.name === 'return' || key.name === 'enter') {
        finish(
          multiple
            ? options
                .map((option) => option.value)
                .filter((value) => selected.has(value))
            : [options[cursor].value],
        );
      }
    };

    try {
      emitKeypressEvents(input);
      input.setRawMode(true);
      input.setEncoding('utf8');
      input.resume();
      input.on('keypress', onKeypress);
      render();
    } catch (error) {
      cancel();
      reject(error);
    }
  });
}

export function selectOptionInteractively<Value extends string>(
  options: readonly InteractiveOption<Value>[],
  title: string,
  initialValue: Value,
  input: AgentSelectorInput = process.stdin as AgentSelectorInput,
  output: AgentSelectorOutput = process.stdout,
): Promise<Value> {
  return selectValuesInteractively(
    options,
    title,
    [initialValue],
    false,
    input,
    output,
  ).then(([value]) => value);
}

export function selectOptionsInteractively<Value extends string>(
  options: readonly InteractiveOption<Value>[],
  title: string,
  initialSelection: readonly Value[],
  input: AgentSelectorInput = process.stdin as AgentSelectorInput,
  output: AgentSelectorOutput = process.stdout,
  minimumSelection = 0,
): Promise<readonly Value[]> {
  return selectValuesInteractively(
    options,
    title,
    initialSelection,
    true,
    input,
    output,
    minimumSelection,
  );
}

/**
 * Let a user select the integrations for which project skills are generated.
 * The input is deliberately kept injectable so the keyboard state machine can
 * be exercised without spawning a terminal in tests.
 */
export function selectAgentsInteractively(
  input: AgentSelectorInput = process.stdin as AgentSelectorInput,
  output: AgentSelectorOutput = process.stdout,
  initialSelection: readonly CreateAgent[] = ['codex'],
): Promise<readonly CreateAgent[]> {
  return selectOptionsInteractively(
    CREATE_AGENT_OPTIONS,
    'Select agent skills (↑/↓ move, Space toggle, Enter confirm):',
    initialSelection,
    input,
    output,
  );
}
