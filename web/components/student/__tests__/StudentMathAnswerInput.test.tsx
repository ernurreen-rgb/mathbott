import { render, screen } from "@testing-library/react";
import StudentMathAnswerInput from "../StudentMathAnswerInput";

const mockMathFieldInput = jest.fn((props: Record<string, unknown>) => (
  <div data-testid="math-field" data-props={JSON.stringify(props)} />
));

jest.mock("@/components/ui/MathFieldInput", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => mockMathFieldInput(props),
}));

describe("StudentMathAnswerInput", () => {
  beforeEach(() => {
    mockMathFieldInput.mockClear();
  });

  it("uses math mode and the student keyboard for any answer value", () => {
    const onChange = jest.fn();

    render(<StudentMathAnswerInput value="x^2" onChange={onChange} />);

    expect(screen.getByTestId("math-field")).toBeInTheDocument();
    expect(mockMathFieldInput).toHaveBeenCalledWith(
      expect.objectContaining({
        value: "x^2",
        onChange,
        defaultMode: "math",
        smartMode: false,
        virtualKeyboardPolicy: "auto",
        virtualKeyboardPreset: "student",
        openVirtualKeyboardOnFocus: false,
      })
    );
    expect(mockMathFieldInput.mock.calls[0][0]).not.toHaveProperty("placeholder");
    expect(screen.queryByText("Жауапты жазыңыз")).not.toBeInTheDocument();
  });

  it("renders the empty-state prompt as normal text with spaces", () => {
    render(<StudentMathAnswerInput value="" onChange={jest.fn()} />);

    expect(screen.getByText("Жауапты жазыңыз")).toBeInTheDocument();
    expect(screen.queryByText("Жауаптыжазыңыз")).not.toBeInTheDocument();
    expect(mockMathFieldInput.mock.calls[0][0]).not.toHaveProperty("placeholder");
  });

  it("does not open the keyboard for a disabled answer", () => {
    render(<StudentMathAnswerInput value="42" onChange={jest.fn()} disabled compact />);

    expect(mockMathFieldInput).toHaveBeenCalledWith(
      expect.objectContaining({
        readOnly: true,
        openVirtualKeyboardOnFocus: false,
        className: expect.stringContaining("student-math-answer-input--compact"),
      })
    );
  });
});
