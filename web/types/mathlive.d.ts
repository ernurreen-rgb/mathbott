declare module "mathlive" {
  export class MathfieldElement extends HTMLElement {
    value: string;
    setValue(value: string): void;
    getValue(): string;
    addEventListener(
      type: string,
      listener: (event: any) => void
    ): void;
  }
}

