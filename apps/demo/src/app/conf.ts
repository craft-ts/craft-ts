import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

@Component({
  selector: 'app-test',
  standalone: true,
  imports: [CommonModule],
  template: ``,
})
export default class TestComponent {
  bingoGrid = [
    ['Signals', 'Template', 'Router'],
    ['Directive', 'Pipe', 'Service'],
    ['NgZone', 'Inject', 'Standalone'],
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
  const _name: Name = 'Romain';
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

function case2() {
  type Name = string;
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

function _bingoCase() {
  const _player = {
    player: {
      name: 'Player 1',
    },
    bingoGrid: [
      [
        { word: 'Signals', checked: false },
        { word: 'Template', checked: false },
        { word: 'Router', checked: false },
      ],
      [
        { word: 'Directive', checked: false },
        { word: 'Pipe', checked: false },
        { word: 'Service', checked: false },
      ],
      [
        { word: 'NgZone', checked: false },
        { word: 'Inject', checked: false },
        { word: 'Standalone', checked: false },
      ],
    ],
  };
}
