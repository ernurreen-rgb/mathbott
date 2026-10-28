import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import VisualTaskEditor from "../VisualTaskEditor";
import type { LessonTask } from "@/types";

jest.mock("@/components/ui/MathRender", () => ({ __esModule: true, default: ({ latex }: { latex: string }) => <span>{latex}</span> }));
jest.mock("@/components/ui/MathFieldInput", () => ({ __esModule: true, default: ({ value, onChange, onBlur, placeholder }: { value: string; onChange: (v: string) => void; onBlur?: () => void; placeholder?: string }) => <input value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} onBlur={onBlur} /> }));
jest.mock("@/components/admin/StudentTaskPreview", () => ({ __esModule: true, default: () => null }));
jest.mock("next/image", () => ({
  __esModule: true,
  default: jest.requireActual("react").forwardRef(function MockImage(_props: object, ref: React.ForwardedRef<HTMLSpanElement>) {
    return <span ref={ref} data-testid="task-image" />;
  }),
}));

const task: LessonTask = { id: 4, text: "Question", answer: "A", question_type: "mcq", sort_order: 1, options: [{ label: "A", text: "One" }, { label: "B", text: "Two" }, { label: "C", text: "Three" }, { label: "D", text: "Four" }] };

it("creates six fields only after choosing six answers", async () => {
  const save = jest.fn().mockResolvedValue(undefined);
  render(<VisualTaskEditor tasks={[task]} onSave={save} onAdd={jest.fn()} onDelete={jest.fn()} context="mini-lesson" email="editor@example.com" />);
  fireEvent.click(screen.getByRole("button", { name: "Өңдеу" }));
  expect(screen.queryByRole("button", { name: /^E / })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("combobox", { name: "Сұрақ түрі" }), { target: { value: "mcq6" } });
  for (const label of ["E", "F"]) {
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${label} `) }));
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
  fireEvent.click(screen.getByRole("button", { name: /B Two/ }));
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
