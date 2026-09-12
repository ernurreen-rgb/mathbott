import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import VisualTaskEditor from "../VisualTaskEditor";
import type { LessonTask } from "@/types";

jest.mock("@/components/ui/MathRender", () => ({ __esModule: true, default: ({ latex }: { latex: string }) => <span>{latex}</span> }));
jest.mock("@/components/ui/MathFieldInput", () => ({ __esModule: true, default: ({ value, onChange, onBlur }: { value: string; onChange: (v: string) => void; onBlur?: () => void }) => <input value={value} onChange={e => onChange(e.target.value)} onBlur={onBlur} /> }));
jest.mock("@/components/admin/StudentTaskPreview", () => ({ __esModule: true, default: () => null }));
jest.mock("next/image", () => ({
  __esModule: true,
  default: jest.requireActual("react").forwardRef(function MockImage(_props: object, ref: React.ForwardedRef<HTMLSpanElement>) {
    return <span ref={ref} data-testid="task-image" />;
  }),
}));

const task: LessonTask = { id: 4, text: "Question", answer: "A", question_type: "mcq", sort_order: 1, options: [{ label: "A", text: "One" }, { label: "B", text: "Two" }] };

it("saves an edited MCQ option through the extracted fields", async () => {
  const save = jest.fn().mockResolvedValue(undefined);
  render(<VisualTaskEditor tasks={[task]} onSave={save} onAdd={jest.fn()} onDelete={jest.fn()} context="mini-lesson" email="editor@example.com" />);
  fireEvent.click(screen.getByRole("button", { name: "Өңдеу" }));
  fireEvent.click(screen.getByRole("button", { name: /B Two/ }));
  fireEvent.change(screen.getByDisplayValue("Two"), { target: { value: "Second" } });
  fireEvent.click(screen.getByRole("button", { name: "Сақтау" }));
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({
    id: 4, answer: "A", options: [{ label: "A", text: "One" }, { label: "B", text: "Second" }],
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
