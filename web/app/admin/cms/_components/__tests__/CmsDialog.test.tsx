import { act, render, screen } from "@testing-library/react";
import CmsDialog from "../CmsDialog";

jest.mock("mathlive", () => ({}));

it("reserves keyboard space inside a modal and releases the keyboard when closed", async () => {
  const keyboard = Object.assign(new EventTarget(), {
    container: document.body as HTMLElement | null,
    boundingRect: new DOMRect(0, 500, 1000, 300),
    hide: jest.fn(),
  });
  const original = Object.getOwnPropertyDescriptor(globalThis, "mathVirtualKeyboard");
  Object.defineProperty(globalThis, "mathVirtualKeyboard", { configurable: true, value: keyboard });
  try {
    let view!: ReturnType<typeof render>;
    await act(async () => { view = render(<CmsDialog open title="Тапсырма" onClose={jest.fn()}><p>Мәтін</p></CmsDialog>); });
    const dialog = screen.getByRole("dialog", { name: "Тапсырма" });
    keyboard.container = dialog.querySelector("[data-math-virtual-keyboard-container]");
    act(() => { keyboard.dispatchEvent(new Event("geometrychange")); });
    expect(dialog.style.getPropertyValue("--cms-keyboard-height")).toBe("300px");
    await act(async () => { view.rerender(<CmsDialog open={false} title="Тапсырма" onClose={jest.fn()}><p>Мәтін</p></CmsDialog>); });
    expect(keyboard.hide).toHaveBeenCalledTimes(1);
    expect(keyboard.container).toBe(document.body);
  } finally {
    if (original) Object.defineProperty(globalThis, "mathVirtualKeyboard", original);
    else Reflect.deleteProperty(globalThis, "mathVirtualKeyboard");
  }
});
