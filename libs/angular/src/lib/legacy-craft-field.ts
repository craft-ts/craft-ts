import {
  Directive,
  ElementRef,
  inject,
  Injector,
  input,
  OnDestroy,
  OnInit,
  Renderer2,
} from '@angular/core';
import {
  bindCraftField,
  CRAFT_FIELD_CHECKBOX_CONTROL,
  CRAFT_FIELD_VALUE_CONTROL,
  type CraftField,
} from '@craft-ng/core';

/** @deprecated Use the functional `CraftFieldDirective` on Craft nodes. */
@Directive({
  selector: '[craftField]',
  standalone: true,
  exportAs: 'craftField',
})
export class LegacyCraftFieldDirective<T> implements OnInit, OnDestroy {
  readonly craftField = input.required<CraftField<T>>();

  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly renderer = inject(Renderer2);
  private readonly injector = inject(Injector);
  private readonly customValueControl = inject(CRAFT_FIELD_VALUE_CONTROL, {
    optional: true,
    self: true,
  });
  private readonly customCheckboxControl = inject(
    CRAFT_FIELD_CHECKBOX_CONTROL,
    {
      optional: true,
      self: true,
    },
  );
  private cleanup: (() => void) | undefined;

  ngOnInit(): void {
    this.cleanup = bindCraftField(
      this.elementRef.nativeElement,
      this.craftField(),
      this.renderer,
      this.injector,
      this.customValueControl,
      this.customCheckboxControl,
    );
  }

  ngOnDestroy(): void {
    this.cleanup?.();
  }
}
