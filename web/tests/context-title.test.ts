import { describe, expect, it } from "vitest";
import { splitLeadingTitle } from "@/lib/context-title";
import { buildTaskDeckFiles } from "@/lib/pptx/task-deck";
import type { ConstructorTask } from "@/types/constructor";

describe("context title", () => {
  it("takes a leading **Title** line off the statement", () => {
    expect(splitLeadingTitle("**Жарас кубиктері**\n\nЖарас қыры 6 см кубиктерден дене құрастырды.\n\nДенедегі кубиктердің саны"))
      .toEqual({ title: "Жарас кубиктері", body: "Жарас қыры 6 см кубиктерден дене құрастырды.\n\nДенедегі кубиктердің саны" });
    expect(splitLeadingTitle("  **Икосаэдр** \r\nМәтін")).toEqual({ title: "Икосаэдр", body: "Мәтін" });
    expect(splitLeadingTitle("**Глобус**")).toEqual({ title: "Глобус", body: "" });
  });

  it("leaves other text alone", () => {
    for (const text of [
      "Есептеңіз: 2+2",
      "**Маңызды** сөз бір жолда, тақырып емес",
      "Мәтін **ортасында** қалың",
      "****\nбос тақырып",
      "",
    ]) {
      expect(splitLeadingTitle(text)).toEqual({ title: null, body: text });
    }
    expect(splitLeadingTitle(null)).toEqual({ title: null, body: "" });
  });
});

describe("context title in the PPTX deck", () => {
  const task: ConstructorTask = {
    id: 1,
    text: "**Жарас кубиктері**\n\nДенедегі кубиктердің саны",
    text_scale: "md",
    question_type: "context",
    answer_mode: "choices",
    difficulty: "B",
    topics: [],
    image_filename: null,
    options: [
      { label: "A", text: "91" }, { label: "B", text: "100" }, { label: "C", text: "90" }, { label: "D", text: "89" },
    ],
    subquestions: [],
    answer: "A",
  };

  it("puts the title on its own centred bold line without asterisks", () => {
    const { files } = buildTaskDeckFiles({ title: "T", author: "A", language: "kk", tasks: [task] });
    const slide = files.get("ppt/slides/slide2.xml") as string;
    expect(slide).not.toContain("**");
    const heading = slide.match(/<a:p><a:pPr algn="([a-z]+)">(?:(?!<\/a:p>).)*?Жарас кубиктері/);
    expect(heading?.[1]).toBe("ctr");
    expect(heading?.[0]).toContain('b="1"');
    expect(slide.indexOf("Жарас кубиктері")).toBeLessThan(slide.indexOf("Денедегі кубиктердің саны"));
  });
});
