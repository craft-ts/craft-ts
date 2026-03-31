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
