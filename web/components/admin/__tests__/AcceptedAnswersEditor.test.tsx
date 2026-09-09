import { fireEvent, render, screen } from "@testing-library/react";

import AcceptedAnswersEditor, { normalizeAcceptedAnswers } from "../AcceptedAnswersEditor";

jest.mock("@/components/ui/MathFieldInput", () => ({
  __esModule: true,
  default: ({ value, onChange, placeholder }: any) => (
    <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
  ),
}));

describe("AcceptedAnswersEditor", () => {
  it("adds, edits and removes alternative answers", () => {
    const onChange = jest.fn();
    const { rerender } = render(<AcceptedAnswersEditor value={[]} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Жауап" }));
    expect(onChange).toHaveBeenLastCalledWith([""]);

    rerender(<AcceptedAnswersEditor value={["x=1"]} onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText("Балама жауап 1"), { target: { value: "2x=2" } });
    expect(onChange).toHaveBeenLastCalledWith(["2x=2"]);

    fireEvent.click(screen.getByRole("button", { name: "Балама жауапты жою 1" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("removes blanks and duplicates before submit", () => {
    expect(normalizeAcceptedAnswers([" x=1 ", "", "x=1", "2x=2"])).toEqual(["x=1", "2x=2"]);
  });
});
