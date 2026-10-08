import {
  button,
  craftComponent,
  div,
  ifNode,
  p,
  section,
  strong,
  heading,
} from '@craft-ts/component';
import {
  craftService,
  craftMethod,
  CraftRouter,
  queryParams,
  craftComputed,
  craftException,
} from '@craft-ts/core';
import { example } from '../../shared/example.style';

function formatParseException(exception: {
  _tag: string;
  payload: { error: unknown };
}) {
  return `${exception._tag}: ${exception.payload.error}`;
}

export const { ExceptionQueryParamsView, provideExceptionQueryParamsView } =
  craftService(
    { name: 'exceptionQueryParamsView', providedIn: 'toProvide' },
    function* () {
      const router = yield* CraftRouter(undefined, ({ navigate }) => ({
        navigate,
      }));
      yield* queryParams(
        'modeQueryParams',
        {
          state: {
            mode: {
              fallbackValue: 'fallbackValue',
              codec: {
                // The runtime accepts a CraftException as a decode result and
                // records it in `exceptions().parse`; the cast keeps the public
                // decoded state limited to the successful domain value.
                decode: (value: string) => {
                  if (value !== 'success') {
                    return craftException(
                      { _tag: 'UNEXPECTED_ERROR' },
                      { error: new Error(`Invalid mode: ${value}`) },
                    );
                  }
                  return 'success';
                },
                encode: String,
              },
            },
          },
        },
        function* ({ exceptions }) {
          return {
            hasParseException: yield* craftComputed(
              'hasParseException',
              function* () {
              return (yield* exceptions()).parse.mode !== undefined;
              },
            ),
            parseExceptionMessage: yield* craftComputed(
              'parseExceptionMessage',
              function* () {
              const exception = (yield* exceptions()).parse.mode;
              return exception ? formatParseException(exception) : '';
              },
            ),
          };
        },
      );
      yield* craftMethod('navigate', function* (mode: string) {
        void router.navigate({
          to: 'exception-query-params',
          //@ts-expect-error intentional to demonstrate the example
          queryParams: { mode },
          queryParamsHandling: 'merge',
        });
      });
    },
  );

const ExceptionQueryParamsComponent = craftComponent(
  'ExceptionQueryParamsComponent',
  {
    providers: [provideExceptionQueryParamsView()],
  },
  () => section({ class: example.card }, [
        heading({ class: example.subtitle }, 'QueryParams decode exception'),
        div({ class: example.row }, [
          button(
            'success',
            {
              class: example.button,
              type: 'button',
              *click() {
                yield* ExceptionQueryParamsView.navigate('success');
              },
            },
            'Navigate success',
          ),
          button(
            'exception',
            {
              class: example.button,
              type: 'button',
              *click() {
                yield* ExceptionQueryParamsView.navigate('exception');
              },
            },
            'Navigate exception',
          ),
        ]),
        p([
          strong('Parsed value: '),
          function* () {
            return String((yield* ExceptionQueryParamsView.modeQueryParams()).mode);
          },
        ]),
        ifNode(
          ExceptionQueryParamsView.modeQueryParams.hasParseException,
          () => p([strong('Exception: '), ExceptionQueryParamsView.modeQueryParams.parseExceptionMessage]),
          () => p([strong('Exception: '), 'none']),
        ),
      ]),
);

export default ExceptionQueryParamsComponent;
