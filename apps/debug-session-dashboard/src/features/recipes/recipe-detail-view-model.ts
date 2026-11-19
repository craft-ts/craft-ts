import type {
  ResumeRecipeDetail,
  ResumeRecipeRunSummary,
} from '../../shared/data-access/session-archive.service';
import { i18n } from '../../shared/util/catalog';
import { isRecord } from '../../shared/util/replay-model';
import { RECIPE_RUN_STATUS } from '../../shared/util/session-lineage';

const dateTime = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

function conditionText(condition: unknown): string {
  if (!isRecord(condition)) return JSON.stringify(condition);
  if (typeof condition['visibleText'] === 'string')
    return i18n.t('conditionVisibleText', { detail: condition['visibleText'] });
  if (typeof condition['route'] === 'string')
    return i18n.t('conditionRoute', { detail: condition['route'] });
  return JSON.stringify(condition);
}

export function recipeStepText(step: Readonly<Record<string, unknown>>): string {
  const type = step['type'];
  if (type === 'network')
    return step['mode'] === 'mocked'
      ? i18n.t('recipeStepMockedNetwork')
      : i18n.t('recipeStepRealNetwork');
  if (type === 'goto' && typeof step['route'] === 'string')
    return i18n.t('recipeStepGoto', { detail: step['route'] });
  if (type === 'handoff')
    return i18n.t('recipeStepHandoff', {
      detail:
        typeof step['message'] === 'string'
          ? step['message']
          : i18n.t('recipeStepHandoffDefault'),
    });
  if (type === 'expect')
    return i18n.t(
      step['level'] === 'essential'
        ? 'recipeStepExpectEssential'
        : 'recipeStepExpect',
      { detail: conditionText(step['condition']) },
    );
  if (type === 'checkpoint') return i18n.t('recipeStepCheckpoint');
  const { type: _type, ...rest } = step;
  return `${String(type)} ${JSON.stringify(rest)}`;
}

export function recipeRunText(run: ResumeRecipeRunSummary): string {
  return [
    dateTime.format(new Date(run.startedAt)),
    RECIPE_RUN_STATUS[run.status] ?? run.status,
    ...(run.currentStep === undefined
      ? []
      : [i18n.t('recipeRunStep', { count: run.currentStep + 1 })]),
    ...(run.failure ? [run.failure.detail] : []),
  ].join(' · ');
}

export function recipeValidationIssues(
  item: ResumeRecipeDetail | undefined,
): string {
  if (!item) return '';
  const issues = [...item.validation.issues];
  const failure = item.runs[0]?.failure;
  if (failure) {
    const step = i18n.t('recipeFailureStep', {
      count: (failure.step ?? 0) + 1,
      detail: failure.detail,
    });
    const repeated = issues.indexOf(failure.detail);
    if (repeated >= 0) issues[repeated] = step;
    else if (!issues.includes(step)) issues.push(step);
  }
  return issues.join(' · ');
}
