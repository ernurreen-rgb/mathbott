import { getTaskAnswerMode, supportsAnswerModeSwitch } from "../answer-mode";

describe("answer mode", () => {
  it("keeps existing option tasks in choices mode by default", () => {
    expect(getTaskAnswerMode({ question_type: "mcq" })).toBe("choices");
    expect(getTaskAnswerMode({ question_type: "select" })).toBe("choices");
  });

  it("allows written answers for tasks with options", () => {
    expect(getTaskAnswerMode({ question_type: "mcq6", answer_mode: "written" })).toBe("written");
    expect(supportsAnswerModeSwitch("mcq6")).toBe(true);
  });

  it("forces the natural mode for fixed-interaction task types", () => {
    expect(getTaskAnswerMode({ question_type: "input", answer_mode: "choices" })).toBe("written");
    expect(getTaskAnswerMode({ question_type: "tf", answer_mode: "written" })).toBe("choices");
  });
});
