import { CommonModule } from '@angular/common';
import { Component, linkedSignal } from '@angular/core';
import { reactiveWritableSignal, removeMany } from '@craft-ng/core';
import { Equal, Expect } from 'test-type';
import {
  CamelCase,
  IsEmptyObject,
  Merge,
  Simplify,
  UnionToTuple,
} from 'type-fest';

@Component({
  selector: 'app-test',
  standalone: true,
  imports: [CommonModule],
  template: ``,
})
export default class TestComponent {
  bingoGrid = [
    ['Component', 'Defer', 'Observable'],
    ['FormControl', '@for', 'ViewChild'],
    ['Interceptor', 'OnPush', 'Hydration'],
  ];
}

type IsAny<T> = 0 extends 1 & T ? true : false;

type IsUnknown<T> = unknown extends T
  ? T extends unknown
    ? true
    : false
  : false;

type IsSameLiteral<A, B> = [A] extends [B]
  ? B extends A
    ? true
    : false
  : false;

type IsRomain<T> = IsSameLiteral<T, 'Romain'>;

type IsSquareMarked<T> = T extends { checked: true } ? true : false;

async function whatCanBeDerived() {
  const _userResponse = await fetch('/api/user').then(
    //    ^?
    (res) => res.json(),
  );

  type IsUserResponseAny = IsAny<typeof _userResponse>;
  //.  ^?

  type IsUserResponseUnknown = IsUnknown<typeof _userResponse>;
  //.  ^?

  type Name = string;
  const _name: Name = 'Romain' as const;
  //.   ^?
  type _IsNameRomain = IsRomain<typeof _name>;
  //.  ^?

  type Square = object;
  const _firstSquare: Square = { word: 'Signals', checked: true };
  //    ^?
  type _IsSquareMarked = IsSquareMarked<typeof _firstSquare>;
  //.  ^?
}

function case2() {
  const _;

  type Name = string;
  const _wrongName = 100 satisfies Name;
  // ❌ Type 'number' does not satisfy the expected type 'string'.

  const _name = 'Romain' satisfies Name;
  //.   ^?
  type _IsNameRomain = IsRomain<typeof _name>;
  //.  ^?

  type Square = object;
  const _firstSquare: Square = { word: 'Signals', checked: true };
  type _FirstSquare = typeof _firstSquare;
  //   ^?
  type _IsSquareMarked = IsSquareMarked<typeof _firstSquare>;
  //.  ^?
}

function f3() {
  const _name = 'Romain';
  //.   ^?
  type _IsNameRomain = IsRomain<typeof _name>;
  //.  ^?

  type Square = object;
  const _firstSquare = {
    word: 'Signals',
    checked: true,
  } as const satisfies Square;
  type _IsSquareMarked = IsSquareMarked<typeof _firstSquare>;
  //.  ^?
}
function f4() {
  type Square = {
    word: string;
    checked: boolean;
  };
  const _firstSquare = {
    word: 'Signals',
    checked: true,
  } satisfies Square;
  type _IsSquareMarked = IsSquareMarked<typeof _firstSquare>;
  //.  ^?
}

function f5() {
  const r;

  type Square = {
    word: string;
    checked: boolean;
  };

  function createSquare<T extends Square>(square: T): T {
    // do some stuff
    return square;
  }

  const _firstSquare = createSquare({ word: 'Signals', checked: true });
  type _IsSquareMarked = IsSquareMarked<typeof _firstSquare>;
  //.  ^?
}

function _bingoCase1() {
  type PlayerCard = {
    playerName: string;
    bingoGrid: [
      [string, string, string],
      [string, string, string],
      [string, string, string],
    ]; // tuple
  };

  function _bingoGame<
    const AnnouncedWords extends string[],
    const PlayerCards extends PlayerCard[],
  >(_announcedWords: AnnouncedWords, _playerCards: PlayerCards): void {
    // do some stuff
    return {} as any;
  }

  const __game = _bingoGame(
    [
      'Component', // 1 / 2
      'Defer', // 1
      'Observable', // 1 / 2
      'FormControl', // 1 / 2
      '@for', // 1
      'ViewChild', // 1 / 2
      'Input', // 2
      'Output',
    ],
    [
      {
        playerName: 'Player 1',
        bingoGrid: [
          ['Component', 'Defer', 'Observable'],
          ['FormControl', '@for', 'ViewChild'],
          ['Interceptor', 'OnPush', 'Hydration'],
        ],
      },
      {
        playerName: 'Player 2',
        bingoGrid: [
          ['Component', 'Module', 'Observable'],
          ['FormControl', 'HttpClient', 'ViewChild'],
          ['Input', 'Service', 'OnInit'],
        ],
      },
    ],
  );

  type _GameScoresWithoutWinner = Expect<
    Equal<
      typeof __game,
      {
        player1: 6;
        player2: 5;
      }
    >
  >;

  // vitest: expectTypeOf(_game).toEqualTypeOf<{
  //   player1: 6;
  //   player2: 5;
  // }>();

  type BingoGridToUnionWords<BingoGrid extends PlayerCard['bingoGrid']> =
    BingoGrid[number][number];

  type _BingoGridToUnionTest = Expect<
    Equal<
      BingoGridToUnionWords<
        [
          ['Component', 'Defer', 'Observable'],
          ['FormControl', '@for', 'ViewChild'],
          ['Interceptor', 'OnPush', 'Hydration'],
        ]
      >,
      | 'Component'
      | 'Defer'
      | 'Observable'
      | 'FormControl'
      | '@for'
      | 'ViewChild'
      | 'Interceptor'
      | 'OnPush'
      | 'Hydration'
    >
  >;

  type ExtractAnnouncedWordsUnionInBingoGridUnion<
    AnnouncedWordsUnion extends string,
    BingoGridUnion extends string,
  > = Extract<BingoGridUnion, AnnouncedWordsUnion>;

  type _PickAnnouncedWordsInFlatBingoGridTest = Expect<
    Equal<
      ExtractAnnouncedWordsUnionInBingoGridUnion<
        'Component' | 'Defer' | 'Observable',
        'Component' | 'Defer' | 'Observable' | 'NotAnnounced'
      >,
      'Component' | 'Defer' | 'Observable'
    >
  >;

  // UnionToTuple from type-fest
  type GetBingoScore<
    AnnouncedWords extends string[],
    BingoGrid extends PlayerCard['bingoGrid'],
  > = UnionToTuple<
    ExtractAnnouncedWordsUnionInBingoGridUnion<
      AnnouncedWords[number],
      BingoGridToUnionWords<BingoGrid>
    >
  >['length'];

  type _ScoreShouldBe2 = Expect<
    Equal<
      GetBingoScore<
        ['word1', 'word2', 'anotherWord'],
        [
          ['word1', 'word2', 'Observable'],
          ['FormControl', '@for', 'ViewChild'],
          ['Interceptor', 'OnPush', 'Hydration'],
        ]
      >,
      2
    >
  >;

  // CamelCase from type-fest
  type _PlayerNameToCamelCase = Expect<Equal<CamelCase<'Player 1'>, 'player1'>>;

  function __bingoGame<
    const AnnouncedWords extends string[],
    const PlayerCards extends PlayerCard[],
  >(
    _announcedWords: AnnouncedWords,
    _playerCards: PlayerCards,
  ): {
    [Key in PlayerCards[number]['playerName'] as CamelCase<Key>]: GetBingoScore<
      AnnouncedWords,
      PlayerCards[number]['bingoGrid']
    >;
  } {
    // do some stuff
    return {} as any;
  }

  type ___GameScoresResult = typeof _game;

  type ___GameScoresWithoutWinner = Expect<
    Equal<
      typeof _game,
      {
        player1: 6;
        player2: 5;
      }
    >
  >;

  const ___game = __bingoGame(
    [
      'Component', // 1 / 2
      'Defer', // 1
      'Observable', // 1 / 2
      'FormControl', // 1 / 2
      '@for', // 1
      'ViewChild', // 1 / 2
      'Input', // 2
      'Output',
    ],
    [
      {
        playerName: 'Player 1',
        bingoGrid: [
          ['Component', 'Defer', 'Observable'],
          ['FormControl', '@for', 'ViewChild'],
          ['Interceptor', 'OnPush', 'Hydration'],
        ],
      },
      {
        playerName: 'Player 2',
        bingoGrid: [
          ['Component', 'Module', 'Observable'],
          ['FormControl', 'HttpClient', 'ViewChild'],
          ['Input', 'Service', 'OnInit'],
        ],
      },
    ],
  );

  const _game = bingoGame(
    [
      'Component', // 1 / 2
      'Defer', // 1
      'Observable', // 1 / 2
      'FormControl', // 1 / 2
      '@for', // 1
      'ViewChild', // 1 / 2
      'Input', // 2
      'Output',
    ],
    [
      {
        playerName: 'Player 1',
        bingoGrid: [
          ['Component', 'Defer', 'Observable'],
          ['FormControl', '@for', 'ViewChild'],
          ['Interceptor', 'OnPush', 'Hydration'],
        ],
      },
      {
        playerName: 'Player 2',
        bingoGrid: [
          ['Component', 'Module', 'Observable'],
          ['FormControl', 'HttpClient', 'ViewChild'],
          ['Input', 'Service', 'OnInit'],
        ],
      },
    ],
  );

  type RecursiveScoreByPlayer<
    AnnouncedWords extends string[],
    PlayerCards extends PlayerCard[],
    Acc = {},
  > = PlayerCards extends [infer FirstCard, ...infer RestCards]
    ? FirstCard extends PlayerCard
      ? RestCards extends PlayerCard[]
        ? RecursiveScoreByPlayer<
            AnnouncedWords,
            RestCards,
            Merge<
              Acc,
              {
                [Key in FirstCard['playerName'] as CamelCase<Key>]: GetBingoScore<
                  AnnouncedWords,
                  FirstCard['bingoGrid']
                >;
              }
            >
          >
        : never
      : never
    : Acc;

  type _RecursiveScoreByPlayerDebug<
    AnnouncedWords extends string[],
    PlayerCards extends PlayerCard[],
    Acc = {},
  > = PlayerCards extends [infer FirstCard, ...infer RestCards]
    ? FirstCard extends PlayerCard
      ? RestCards extends PlayerCard[]
        ? RecursiveScoreByPlayer<
            AnnouncedWords,
            RestCards,
            Merge<
              Acc,
              {
                [Key in FirstCard['playerName'] as CamelCase<Key>]: GetBingoScore<
                  AnnouncedWords,
                  FirstCard['bingoGrid']
                >;
              }
            >
          >
        : 'never1'
      : 'never2'
    : Acc;

  type _RecursiveScoreByPlayerWIP<
    AnnouncedWords extends string[],
    PlayerCards extends PlayerCard[],
    Acc = {},
  > = PlayerCards extends [infer FirstCard, ...infer RestCards]
    ? _RecursiveScoreByPlayerWIP<
        AnnouncedWords,
        RestCards,
        Merge<
          Acc,
          {
            [Key in FirstCard['playerName'] as CamelCase<Key>]: GetBingoScore<
              AnnouncedWords,
              FirstCard['bingoGrid']
            >;
          }
        >
      >
    : Acc;

  function bingoGame<
    const AnnouncedWords extends string[],
    const PlayerCards extends PlayerCard[],
  >(
    _announcedWords: AnnouncedWords,
    _playerCards: PlayerCards,
  ): RecursiveScoreByPlayer<AnnouncedWords, PlayerCards> {
    // do some stuff
    return {} as any;
  }

  type _GameScoresWithoutWinnerSuccess = Expect<
    Equal<
      typeof _game,
      {
        player1: 6;
        player2: 5;
      }
    >
  >;
}

function _bingoCase2() {
  type PlayerCard = {
    playerName: string;
    bingoGrid: [
      [string, string, string],
      [string, string, string],
      [string, string, string],
    ]; // tuple
  };

  const _game = bingoGame(
    [
      'Component',
      'Defer',
      'Observable',
      'FormControl',
      '@for',
      'ViewChild',
      'Input',
      'Output',
      'Interceptor',
      'OnPush',
      'Hydration',
    ],
    [
      {
        playerName: 'Player 1',
        bingoGrid: [
          ['Component', 'Defer', 'Observable'],
          ['FormControl', '@for', 'ViewChild'],
          ['Interceptor', 'OnPush', 'Hydration'],
        ],
      },
      {
        playerName: 'Player 2',
        bingoGrid: [
          ['Component', 'Module', 'Observable'],
          ['FormControl', 'HttpClient', 'ViewChild'],
          ['Input', 'Service', 'OnInit'],
        ],
      },
    ],
  );

  const _gameWithoutWinner = bingoGame(
    [
      'Component',
      'Defer',
      'Observable',
      'FormControl',
      '@for',
      'ViewChild',
      'Input',
      'Output',
      'Interceptor',
      'OnPush',
      'Hydration',
    ],
    [
      {
        playerName: 'Player 1',
        bingoGrid: [
          ['Component', 'Defer', 'Observable'],
          ['FormControl', '@for', 'ViewChild'],
          ['Interceptors', 'OnPush', 'Hydration'],
        ],
      },
      {
        playerName: 'Player 2',
        bingoGrid: [
          ['Component', 'Module', 'Observable'],
          ['FormControl', 'HttpClient', 'ViewChild'],
          ['Input', 'Service', 'OnInit'],
        ],
      },
    ],
  );
  // UnionToTuple from type-fest
  type GetBingoScore<
    AnnouncedWords extends string[],
    BingoGrid extends PlayerCard['bingoGrid'],
  > = UnionToTuple<
    ExtractAnnouncedWordsUnionInBingoGridUnion<
      AnnouncedWords[number],
      BingoGridToUnionWords<BingoGrid>
    >
  >['length'];

  type ExtractAnnouncedWordsUnionInBingoGridUnion<
    AnnouncedWordsUnion extends string,
    BingoGridUnion extends string,
  > = Extract<BingoGridUnion, AnnouncedWordsUnion>;

  type BingoGridToUnionWords<BingoGrid extends PlayerCard['bingoGrid']> =
    BingoGrid[number][number];

  type RecursiveScoreByPlayer<
    AnnouncedWords extends string[],
    PlayerCards extends PlayerCard[],
    Acc = {},
  > = PlayerCards extends [infer FirstCard, ...infer RestCards]
    ? FirstCard extends PlayerCard
      ? RestCards extends PlayerCard[]
        ? RecursiveScoreByPlayer<
            AnnouncedWords,
            RestCards,
            Merge<
              Acc,
              {
                [Key in FirstCard['playerName'] as CamelCase<Key>]: GetBingoScore<
                  AnnouncedWords,
                  FirstCard['bingoGrid']
                >;
              }
            >
          >
        : never
      : never
    : Acc;

  function _bingoGame<
    const AnnouncedWords extends string[],
    const PlayerCards extends PlayerCard[],
    const ScoresByPlayer = RecursiveScoreByPlayer<AnnouncedWords, PlayerCards>,
    const Winner = {
      [PlayName in keyof ScoresByPlayer]: ScoresByPlayer[PlayName] extends 9
        ? PlayName
        : never;
    },
  >(
    _announcedWords: AnnouncedWords,
    _playerCards: PlayerCards,
  ): ScoresByPlayer & {
    _debug: Winner;
  } {
    // do some stuff
    return {} as any;
  }

  function bingoGame<
    const AnnouncedWords extends string[],
    const PlayerCards extends PlayerCard[],
    const ScoresByPlayer = RecursiveScoreByPlayer<AnnouncedWords, PlayerCards>,
    const Winner = {
      [PlayName in keyof ScoresByPlayer as ScoresByPlayer[PlayName] extends 9
        ? PlayName
        : never]: ScoresByPlayer[PlayName] extends 9 ? PlayName : never;
    },
  >(
    _announcedWords: AnnouncedWords,
    _playerCards: PlayerCards,
  ): Merge<
    ScoresByPlayer,
    IsEmptyObject<Winner> extends true
      ? {}
      : {
          winner: `${Winner[keyof Winner] & string} wins`;
        }
  > & {
    _debug: Winner;
  } {
    // do some stuff
    return {} as any;
  }

  type _GameScoresWithWinner = Expect<
    Equal<
      typeof _game,
      {
        player1: 9;
        player2: 5;
        winner: 'player1 wins';
      }
    >
  >;
  type _GameScoresWithoutWinner = Expect<
    Equal<
      typeof _gameWithoutWinner,
      {
        player1: 8;
        player2: 5;
      }
    >
  >;
}

function _bingoCase3() {
  type PlayerCard = {
    playerName: string;
    bingoGrid: [
      [string, string, string],
      [string, string, string],
      [string, string, string],
    ]; // tuple
  };

  const _gameWithWinner = bingoGame({
    announcedWords: [
      'Component',
      'Defer',
      'Observable',
      'FormControl',
      '@for',
      'ViewChild',
      'Input',
      'Output',
      'Interceptor',
      'OnPush',
      'Hydration',
    ],
    playerCards: [
      {
        playerName: 'Player 1',
        bingoGrid: [
          ['Component', 'Defer', 'Observable'],
          ['FormControl', '@for', 'ViewChild'],
          ['Interceptor', 'OnPush', 'Hydration'],
        ],
      },
      {
        playerName: 'Player 2',
        bingoGrid: [
          ['Component', 'Module', 'Observable'],
          ['FormControl', 'HttpClient', 'ViewChild'],
          ['Input', 'Service', 'OnInit'],
        ],
      },
    ],
  });

  const _gameWithWinnerSuccess = bingoGame({
    announcedWords: [
      'Component',
      'Defer',
      'Observable',
      'FormControl',
      '@for',
      'ViewChild',
      'Input',
      'Output',
      'Interceptor',
      'OnPush',
      'Hydration',
    ],
    playerCards: [
      {
        playerName: 'Player 1',
        bingoGrid: [
          ['Component', 'Defer', 'Observable'],
          ['FormControl', '@for', 'ViewChild'],
          ['Interceptor', 'OnPush', 'Hydration'],
        ],
      },
      {
        playerName: 'Player 2',
        bingoGrid: [
          ['Component', 'Module', 'Observable'],
          ['FormControl', 'HttpClient', 'ViewChild'],
          ['Input', 'Service', 'OnInit'],
        ],
      },
    ],
    reward: 'une baguette',
  });

  const _gameWithoutWinner = bingoGame({
    announcedWords: [
      'Component',
      'Defer',
      'Observable',
      'FormControl',
      '@for',
      'ViewChild',
      'Input',
      'Output',
      'Interceptor',
      'OnPush',
      'Hydration',
    ],
    playerCards: [
      {
        playerName: 'Player 1',
        bingoGrid: [
          ['Component', 'Defer', 'Observable'],
          ['FormControl', '@for', 'ViewChild'],
          ['Interceptors', 'OnPush', 'Hydration'],
        ],
      },
      {
        playerName: 'Player 2',
        bingoGrid: [
          ['Component', 'Module', 'Observable'],
          ['FormControl', 'HttpClient', 'ViewChild'],
          ['Input', 'Service', 'OnInit'],
        ],
      },
    ],
  });
  // UnionToTuple from type-fest
  type GetBingoScore<
    AnnouncedWords extends string[],
    BingoGrid extends PlayerCard['bingoGrid'],
  > = UnionToTuple<
    ExtractAnnouncedWordsUnionInBingoGridUnion<
      AnnouncedWords[number],
      BingoGridToUnionWords<BingoGrid>
    >
  >['length'];

  type ExtractAnnouncedWordsUnionInBingoGridUnion<
    AnnouncedWordsUnion extends string,
    BingoGridUnion extends string,
  > = Extract<BingoGridUnion, AnnouncedWordsUnion>;

  type BingoGridToUnionWords<BingoGrid extends PlayerCard['bingoGrid']> =
    BingoGrid[number][number];

  type RecursiveScoreByPlayer<
    AnnouncedWords extends string[],
    PlayerCards extends PlayerCard[],
    Acc = {},
  > = PlayerCards extends [infer FirstCard, ...infer RestCards]
    ? FirstCard extends PlayerCard
      ? RestCards extends PlayerCard[]
        ? RecursiveScoreByPlayer<
            AnnouncedWords,
            RestCards,
            Merge<
              Acc,
              {
                [Key in FirstCard['playerName'] as CamelCase<Key>]: GetBingoScore<
                  AnnouncedWords,
                  FirstCard['bingoGrid']
                >;
              }
            >
          >
        : never
      : never
    : Acc;

  function bingoGame<
    const AnnouncedWords extends string[],
    const PlayerCards extends PlayerCard[],
    const ScoresByPlayer = RecursiveScoreByPlayer<AnnouncedWords, PlayerCards>,
    const Winner = {
      [PlayName in keyof ScoresByPlayer as ScoresByPlayer[PlayName] extends 9
        ? PlayName
        : never]: ScoresByPlayer[PlayName] extends 9 ? PlayName : never;
    },
    const HasWinner = IsEmptyObject<Winner> extends false ? true : false,
  >({
    announcedWords,
    playerCards,
  }: Merge<
    {
      announcedWords: AnnouncedWords;
      playerCards: PlayerCards;
    },
    HasWinner extends true
      ? {
          reward: string;
        }
      : {
          reward?: never;
        }
  >): Merge<
    ScoresByPlayer,
    HasWinner extends true
      ? {
          winner: `${Winner[keyof Winner] & string} wins`;
        }
      : {}
  > {
    // do some stuff
    console.log('announcedWords', announcedWords);
    console.log('playerCards', playerCards);
    return {} as any;
  }

  type _GameScoresWithWinner = Expect<
    Equal<
      typeof _gameWithWinnerSuccess,
      {
        player1: 9;
        player2: 5;
        winner: 'player1 wins';
      }
    >
  >;
  type _GameScoresWithoutWinner = Expect<
    Equal<
      typeof _gameWithoutWinner,
      {
        player1: 8;
        player2: 5;
      }
    >
  >;
}

function linkedSignalLimits() {
  const usersQuery = {} as any;
  const bulkDelete = {} as any;

  const _selectedIds = reactiveWritableSignal([] as string[], (sync) => ({
    resetWhenCurrentPageIsResolved: sync(
      usersQuery.currentPageStatus, // Signal<ResourceStatus>
      ({ params, current }) => (params === 'resolved' ? [] : current),
    ),
    resetWhenBulkDeleteIsResolved: sync(
      bulkDelete.status, // Signal<ResourceStatus>
      ({ params, current }) => (params === 'resolved' ? [] : current),
    ),
  }));
}
