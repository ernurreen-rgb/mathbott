import { fireEvent, render, screen } from "@testing-library/react";
import Icon, { ContentIcon } from "../Icon";
import IconPicker from "../IconPicker";

it("keeps decorative icons out of a control's accessible name", () => {
  render(<button><Icon name="plus" />Модуль қосу</button>);
  expect(screen.getByRole("button", { name: "Модуль қосу" })).toBeInTheDocument();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});

it("gives a standalone icon a readable accessible label", () => {
  render(<Icon name="trophy" label="Жетістік" />);
  expect(screen.getByRole("img", { name: "Жетістік" })).toHaveAttribute("focusable", "false");
});

it("renders existing achievement data through the shared icon system", () => {
  const { container } = render(<ContentIcon value="🔥" size={40} />);
  expect(container.querySelector("svg")).toHaveAttribute("data-icon", "flame");
  expect(container.querySelector("svg")).toHaveAttribute("width", "40");
});

it.each(["unknown", "constructor", "__proto__", "toString"])("handles unsupported stored icons safely (%s)", (value) => {
  const { container } = render(<ContentIcon value={value} fallback="book" />);
  expect(container.querySelector("svg")).toHaveAttribute("data-icon", "book");
});

it("preserves a legacy module value until the user chooses a replacement", () => {
  const change = jest.fn();
  render(<IconPicker value="📚" onChange={change} />);
  const select = screen.getByRole("combobox", { name: "Белгіше" });
  expect(select).toHaveValue("📚");
  expect(change).not.toHaveBeenCalled();
  fireEvent.change(select, { target: { value: "quiz" } });
  expect(change).toHaveBeenCalledWith("quiz");
});
