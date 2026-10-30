import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import VisualTaskEditor from "../VisualTaskEditor";
import type { LessonTask } from "@/types";

jest.mock("@/components/ui/MathRender", () => ({ __esModule: true, default: ({ latex }: { latex: string }) => <span>{latex}</span> }));
jest.mock("@/components/ui/MathFieldInput", () => ({ __esModule: true, default: ({ value, onChange, onBlur, placeholder, ariaLabel, autoFocus }: { value: string; onChange: (v: string) => void; onBlur?: () => void; placeholder?: string; ariaLabel?: string; autoFocus?: boolean }) => <input value={value} placeholder={placeholder} aria-label={ariaLabel} autoFocus={autoFocus} onChange={e => onChange(e.target.value)} onBlur={onBlur} /> }));
jest.mock("@/components/admin/StudentTaskPreview", () => ({ __esModule: true, default: () => null }));
jest.mock("next/image", () => ({
  __esModule: true,
  default: jest.requireActual("react").forwardRef(function MockImage(_props: object, ref: React.ForwardedRef<HTMLSpanElement>) {
    return <span ref={ref} data-testid="task-image" />;
  }),
}));

const task: LessonTask = { id: 4, text: "Question", answer: "A", question_type: "mcq", sort_order: 1, options: [{ label: "A", text: "One" }, { label: "B", text: "Two" }, { label: "C", text: "Three" }, { label: "D", text: "Four" }] };

it("toggles correct answers with one click and saves the chosen answer", async () => {
  const user = userEvent.setup();
  const save = jest.fn().mockResolvedValue(undefined);
  render(<VisualTaskEditor tasks={[task]} onSave={save} onAdd={jest.fn()} onDelete={jest.fn()} context="mini-lesson" email="editor@example.com" />);
  await user.click(screen.getByRole("button", { name: "Өңдеу" }));
  await user.click(screen.getByRole("button", { name: "B Two" }));
  expect(screen.getByRole("button", { name: "B Two" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.queryByLabelText("B жауап нұсқасы")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "A One" }));
  expect(screen.getByRole("button", { name: "A One" })).toHaveAttribute("aria-pressed", "false");
  await user.click(screen.getByRole("button", { name: "Сақтау" }));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ answer: "B" }));
});

it.each(["A One", "B Two"])("opens %s on a double click without changing the saved correct answer", async (optionName) => {
  const user = userEvent.setup();
  const save = jest.fn().mockResolvedValue(undefined);
  render(<VisualTaskEditor tasks={[task]} onSave={save} onAdd={jest.fn()} onDelete={jest.fn()} context="mini-lesson" email="editor@example.com" />);
  await user.click(screen.getByRole("button", { name: "Өңдеу" }));
  await user.dblClick(screen.getByRole("button", { name: optionName }));
  const input = screen.getByRole("textbox", { name: `${optionName[0]} жауап нұсқасы` });
  expect(input).toHaveFocus();
  expect(screen.queryByRole("button", { name: "Дұрыс қылу" })).not.toBeInTheDocument();
  await user.clear(input);
  await user.type(input, "Changed");
  await user.click(screen.getByRole("button", { name: "Сақтау" }));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ answer: "A", options: expect.arrayContaining([{ label: optionName[0], text: "Changed" }]) }));
});

it("allows clearing the final correct answer but requires a correct answer before saving", async () => {
  const user = userEvent.setup();
  const save = jest.fn();
  render(<VisualTaskEditor tasks={[task]} onSave={save} onAdd={jest.fn()} onDelete={jest.fn()} context="mini-lesson" email="editor@example.com" />);
  await user.click(screen.getByRole("button", { name: "Өңдеу" }));
  await user.click(screen.getByRole("button", { name: "A One" }));
  expect(screen.getByRole("button", { name: "A One" })).toHaveAttribute("aria-pressed", "false");
  await user.click(screen.getByRole("button", { name: "Сақтау" }));
  expect(screen.getByRole("alert")).toHaveTextContent("дұрыс жауапты белгілеңіз");
  expect(save).not.toHaveBeenCalled();
});

it("keeps the three-answer limit and can edit another option at the limit", async () => {
  const user = userEvent.setup();
  const save = jest.fn().mockResolvedValue(undefined);
  render(<VisualTaskEditor tasks={[{ ...task, answer: '["A","B","C"]' }]} onSave={save} onAdd={jest.fn()} onDelete={jest.fn()} context="mini-lesson" email="editor@example.com" />);
  await user.click(screen.getByRole("button", { name: "Өңдеу" }));
  await user.click(screen.getByRole("button", { name: "D Four" }));
  expect(screen.getByRole("button", { name: "D Four" })).toHaveAttribute("aria-pressed", "false");
  await user.dblClick(screen.getByRole("button", { name: "D Four" }));
  await user.type(screen.getByRole("textbox", { name: "D жауап нұсқасы" }), " edited");
  await user.click(screen.getByRole("button", { name: "B Two" }));
  expect(screen.getByRole("textbox", { name: "D жауап нұсқасы" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "B Two" })).toHaveAttribute("aria-pressed", "false");
  await user.click(screen.getByRole("button", { name: "D нұсқасын өңдеуді аяқтау" }));
  expect(screen.queryByRole("textbox", { name: "D жауап нұсқасы" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "D Four edited" })).toHaveAttribute("aria-pressed", "false");
  await user.click(screen.getByRole("button", { name: "Сақтау" }));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ answer: '["A","C"]' }));
});

it("supports keyboard selection and F2 editing, and ignores clicks outside edit mode", async () => {
  const user = userEvent.setup();
  const save = jest.fn().mockResolvedValue(undefined);
  render(<VisualTaskEditor tasks={[task]} onSave={save} onAdd={jest.fn()} onDelete={jest.fn()} context="mini-lesson" email="editor@example.com" />);
  await user.dblClick(screen.getByRole("button", { name: "B Two" }));
  expect(screen.queryByLabelText("B жауап нұсқасы")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Өңдеу" }));
  screen.getByRole("button", { name: "B Two" }).focus();
  await user.keyboard("{Enter}");
  expect(screen.getByRole("button", { name: "B Two" })).toHaveAttribute("aria-pressed", "true");
  await user.keyboard("{F2}");
  await user.type(screen.getByRole("textbox", { name: "B жауап нұсқасы" }), " edited");
  await user.click(screen.getByRole("button", { name: "Сақтау" }));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ answer: '["A","B"]' }));
});

it("creates six fields only after choosing six answers", async () => {
  const save = jest.fn().mockResolvedValue(undefined);
  render(<VisualTaskEditor tasks={[task]} onSave={save} onAdd={jest.fn()} onDelete={jest.fn()} context="mini-lesson" email="editor@example.com" />);
  fireEvent.click(screen.getByRole("button", { name: "Өңдеу" }));
  expect(screen.queryByRole("button", { name: /^E / })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("combobox", { name: "Сұрақ түрі" }), { target: { value: "mcq6" } });
  for (const label of ["E", "F"]) {
    fireEvent.doubleClick(screen.getByRole("button", { name: new RegExp(`^${label} `) }));
    const input = screen.getByPlaceholderText("Жауап нұсқасы");
    fireEvent.change(input, { target: { value: label } });
    fireEvent.blur(input);
  }
  expect(screen.queryByRole("button", { name: /^G / })).not.toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Сақтау" })); });
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ question_type: "mcq6", options: expect.arrayContaining([{ label: "E", text: "E" }, { label: "F", text: "F" }]) }));
  expect(save.mock.calls[0][0].options).toHaveLength(6);
});

it("does not silently truncate an old eight-option exercise on save", async () => {
  const save = jest.fn();
  const oldTask = { ...task, options: "ABCDEFGH".split("").map((label) => ({ label, text: label })), answer: "H" };
  render(<VisualTaskEditor tasks={[oldTask]} onSave={save} onAdd={jest.fn()} onDelete={jest.fn()} context="mini-lesson" email="editor@example.com" />);
  fireEvent.click(screen.getByRole("button", { name: "Өңдеу" }));
  expect(screen.getByRole("combobox", { name: "Сұрақ түрі" })).toHaveValue("");
  fireEvent.change(screen.getByRole("combobox", { name: "Сұрақ түрі" }), { target: { value: "mcq6" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Сақтау" })); });
  expect(screen.getByRole("alert")).toHaveTextContent("дұрыс жауапты белгілеңіз");
  expect(save).not.toHaveBeenCalled();
});

it("saves an edited MCQ option through the extracted fields", async () => {
  const save = jest.fn().mockResolvedValue(undefined);
  render(<VisualTaskEditor tasks={[task]} onSave={save} onAdd={jest.fn()} onDelete={jest.fn()} context="mini-lesson" email="editor@example.com" />);
  fireEvent.click(screen.getByRole("button", { name: "Өңдеу" }));
  fireEvent.doubleClick(screen.getByRole("button", { name: /B Two/ }));
  fireEvent.change(screen.getByDisplayValue("Two"), { target: { value: "Second" } });
  fireEvent.click(screen.getByRole("button", { name: "Сақтау" }));
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({
    id: 4, answer: "A", options: [{ label: "A", text: "One" }, { label: "B", text: "Second" }, { label: "C", text: "Three" }, { label: "D", text: "Four" }],
  })));
});

it("keeps image removal pending until the user saves", async () => {
  const save = jest.fn().mockResolvedValue(undefined);
  render(<VisualTaskEditor tasks={[{ ...task, image_filename: "diagram.png" }]} onSave={save} onAdd={jest.fn()} onDelete={jest.fn()} context="mini-lesson" email="editor@example.com" />);
  fireEvent.click(screen.getByRole("button", { name: "Өңдеу" }));
  fireEvent.click(screen.getByRole("button", { name: "Жою" }));
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Сақтау" }));
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: 4, removeImage: true })));
});

it("does not display sort_order ('Реті') input in plain edit mode", () => {
  render(
    <VisualTaskEditor
      tasks={[task]}
      appearance="plain"
      onSave={jest.fn()}
      onAdd={jest.fn()}
      onDelete={jest.fn()}
      context="mini-lesson"
      email="editor@example.com"
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Өңдеу" }));
  expect(screen.queryByText("Реті")).not.toBeInTheDocument();
  expect(screen.queryByText("Оқушы қалай жауап береді")).not.toBeInTheDocument();
});

it("reorders tasks via drag and drop and calls onReorder", async () => {
  const onReorder = jest.fn().mockResolvedValue(undefined);
  const task1: LessonTask = { ...task, id: 10, text: "Task 1", sort_order: 0 };
  const task2: LessonTask = { ...task, id: 20, text: "Task 2", sort_order: 1 };
  const task3: LessonTask = { ...task, id: 30, text: "Task 3", sort_order: 2 };

  render(
    <VisualTaskEditor
      tasks={[task1, task2, task3]}
      appearance="plain"
      onSave={jest.fn()}
      onAdd={jest.fn()}
      onDelete={jest.fn()}
      onReorder={onReorder}
      context="mini-lesson"
      email="editor@example.com"
    />
  );

  const btn1 = screen.getByRole("button", { name: "1-тапсырма" });
  const btn3 = screen.getByRole("button", { name: "3-тапсырма" });

  expect(btn1).toHaveAttribute("draggable", "true");
  expect(btn3).toHaveAttribute("draggable", "true");

  const dataTransfer = {
    effectAllowed: "",
    dropEffect: "",
    setData: jest.fn(),
    getData: jest.fn(),
  };

  // Drag task 3 (idx 2) and drop onto task 1 (idx 0)
  fireEvent.dragStart(btn3, { dataTransfer });
  fireEvent.dragOver(btn1, { dataTransfer });
  await act(async () => {
    fireEvent.drop(btn1, { dataTransfer });
  });

  expect(onReorder).toHaveBeenCalledTimes(1);
  const reordered = onReorder.mock.calls[0][0];
  expect(reordered).toHaveLength(3);
  expect(reordered[0]).toEqual(expect.objectContaining({ id: 30, sort_order: 0 }));
  expect(reordered[1]).toEqual(expect.objectContaining({ id: 10, sort_order: 1 }));
  expect(reordered[2]).toEqual(expect.objectContaining({ id: 20, sort_order: 2 }));
});
