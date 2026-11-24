import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { latexToOmml, parseLatex } from "@/lib/pptx/latex-omml";
import { buildTaskDeck, buildTaskDeckFiles, contentInlines } from "@/lib/pptx/task-deck";
import { parseAnswerLabels, taskAnswerPieces } from "@/lib/constructor-answers";
import type { ConstructorTask } from "@/types/constructor";

const OPTIONS = { size: 2400, lang: "kk-KZ" };

/** Every tag closes in order: enough to catch the mistakes that make PowerPoint refuse a file. */
function expectWellFormed(xml: string) {
  const stack: string[] = [];
  for (const match of xml.matchAll(/<(\/?)([A-Za-z_][\w.:-]*)((?:"[^"]*"|'[^']*'|[^'">])*?)(\/?)>/g)) {
    const [, closing, name, , selfClosing] = match;
    if (selfClosing) continue;
    if (closing) expect(stack.pop(), `</${name}>`).toBe(name);
    else stack.push(name);
  }
  expect(stack).toEqual([]);
  expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;|#)/);
}

// Formulas from the bank and from the teacher's example worksheet (logarithms).
const CORPUS = [
  String.raw`\lg\frac{10}{11}+\lg\frac{11}{12}+\lg\frac{12}{13}+\cdots+\lg\frac{999}{1000}`,
  String.raw`\log_2 56-\log_2 7+\log_2 2`,
  String.raw`2^{2\log_8 27-3}`,
  String.raw`\log_3 81-\lg\sqrt[3]{10}\cdot\log_{\sqrt{2}}64`,
  String.raw`\left(\log_3\frac{1}{9}\right):(\log_4 64)+(\log_8 32)`,
  String.raw`5^{\log_3 7}-7^{\log_3 5}`,
  String.raw`\log_6\left(\frac{8}{81}\right)`,
  String.raw`\frac{\lg\log_{\sqrt{2}}32}{4^{1,5-\log_2 5}}`,
  String.raw`2^{\frac{1}{\log_9 4}}+5^{\frac{1}{\log_{\frac{1}{2}}\frac{1}{5}}}`,
  String.raw`\left(7^{\frac{1}{\log_4 7}}+9^{\frac{1}{\log_2 9}}\right)^{\frac{1}{\log_7 6}}`,
  String.raw`[-4;3)`,
  String.raw`\cos x > -\frac{1}{2}`,
  String.raw`\left(\frac{\pi}{6}+2\pi n;\frac{5\pi}{6}+2\pi n\right),\ n\in\mathbb{Z}`,
  String.raw`x^6-x^5-2x^4+x^2-x-2`,
  String.raw`\text{-}\frac{16}{25}`,
  String.raw`\vec{a}(1;0;2)`,
  String.raw`\arccos 0{,}4`,
  String.raw`(-8;5], (-5;+\infty), [-3;7]`,
  String.raw`2^{x^2-19}=(0,25)^{x^2-4}`,
  String.raw`0{,}101001000100001\ldots`,
  String.raw`\sqrt{x\cdot\sqrt[3]{x^2\cdot\sqrt{x}}}`,
  String.raw`\sqrt[105]{6^{35}\cdot2^{57}}`,
  String.raw`\frac{k^2-25}{k+3}\cdot\frac{1}{k^2+5k}-\frac{k^2+10k+25}{k^3-6k^2+9k}:\frac{k+5}{k-3}+\left(\frac{4}{k-3}\right)^2`,
  String.raw`\left(\frac{\sqrt{b}+2}{b+2\sqrt{b}+1}-\frac{\sqrt{b}-2}{b-1}\right)\cdot\frac{\sqrt{b}+1}{\sqrt{b}}`,
  String.raw`\sigma_1^3+\sigma_1\sigma_2`,
  String.raw`(-4;0)\cup(0;+\infty)`,
  String.raw`\left|2x-3\right|<6`,
  String.raw`\begin{cases}x+y=3\\x-y=1\end{cases}`,
  String.raw`\begin{pmatrix}1&2\\3&4\end{pmatrix}`,
  String.raw`\lim_{x\to0}\frac{\sin x}{x}=1`,
  String.raw`\sum_{k=1}^{n}k^2`,
  String.raw`\int_0^1 x\,dx`,
  String.raw`\angle ABC=45^\circ`,
  String.raw`\overline{AB}\ne\widehat{CD}`,
  String.raw`f'(x)=3x^2`,
  String.raw`\binom{5}{2}`,
  String.raw`\sin^2 x+\cos^2 x=1`,
  String.raw`x\in[2;+\infty)`,
  String.raw`\dfrac{3n-2}{n+2}`,
  String.raw`\pm 3`,
];

describe("LaTeX to PowerPoint equations", () => {
  it("knows every command of the corpus and writes well-formed OMML", () => {
    for (const latex of CORPUS) {
      const { omml, text, unsupported } = latexToOmml(latex, OPTIONS);
      expect(unsupported, latex).toEqual([]);
      expectWellFormed(omml);
      expect(text.length, latex).toBeGreaterThan(0);
    }
  });

  it("builds the structures PowerPoint itself writes", () => {
    const log = latexToOmml(String.raw`\log_2 56`, OPTIONS).omml;
    expect(log).toContain("<m:func>");
    expect(log).toMatch(/<m:fName><m:sSub>.*log.*<\/m:sSub><\/m:fName><m:e>.*56.*<\/m:e><\/m:func>/);

    const root = latexToOmml(String.raw`\sqrt[3]{10}`, OPTIONS).omml;
    expect(root).toMatch(/<m:rad><m:radPr>.*<\/m:radPr><m:deg>.*3.*<\/m:deg><m:e>.*10.*<\/m:e><\/m:rad>/);
    expect(latexToOmml(String.raw`\sqrt{2}`, OPTIONS).omml).toContain('<m:degHide m:val="on"/>');

    const fraction = latexToOmml(String.raw`\frac19`, OPTIONS).omml;
    expect(fraction).toMatch(/<m:num>.*>1<\/m:t>.*<\/m:num><m:den>.*>9<\/m:t>.*<\/m:den>/);

    const interval = latexToOmml(String.raw`[2;+\infty)`, OPTIONS).omml;
    expect(interval).toContain('<m:begChr m:val="["/>');
    expect(interval).not.toContain("endChr"); // ")" is the default

    const absolute = latexToOmml(String.raw`\left|2x-3\right|`, OPTIONS).omml;
    expect(absolute).toContain('<m:begChr m:val="|"/><m:endChr m:val="|"/>');

    const cases = latexToOmml(String.raw`\begin{cases}x=1\\y=2\end{cases}`, OPTIONS).omml;
    expect(cases).toMatch(/<m:d><m:dPr><m:begChr m:val="\{"\/><m:endChr m:val=""\/>.*<m:eqArr>/);
    expect(cases.match(/<m:e>/g)?.length).toBeGreaterThanOrEqual(3); // the delimiter and its two lines
  });

  it("writes letters as math italics in runs of their own, as PowerPoint does", () => {
    // PowerPoint does not draw an italic letter that shares a run with a digit or an operator.
    const texts = (omml: string) => Array.from(omml.matchAll(/<m:t[^>]*>([^<]*)<\/m:t>/g), (match) => match[1]);
    expect(texts(latexToOmml("2x-3", OPTIONS).omml)).toEqual(["2", "𝑥", "−3"]);
    expect(texts(latexToOmml("3a-4b", OPTIONS).omml)).toEqual(["3", "𝑎", "−4", "𝑏"]);
    expect(latexToOmml("AB", OPTIONS).omml).toContain(">𝐴𝐵</m:t>");
    expect(latexToOmml("h", OPTIONS).omml).toContain(">ℎ</m:t>");
    const text = latexToOmml(String.raw`\text{Жауабы: }x`, OPTIONS).omml;
    expect(text).toContain('<m:rPr><m:sty m:val="p"/></m:rPr><a:rPr');
    expect(text).not.toContain("<m:nor/>"); // PowerPoint can draw a stray dash beside m:nor text
    expect(latexToOmml(String.raw`\mathbb{R}`, OPTIONS).omml).toContain(">ℝ</m:t>");
  });

  it("keeps a decimal number together, also MathLive's 0{,}4", () => {
    expect(latexToOmml("4,5", OPTIONS).text).toBe("4,5");
    expect(latexToOmml(String.raw`\arccos 0{,}4`, OPTIONS).omml).toMatch(/<m:e>.*>0,4<\/m:t>.*<\/m:e><\/m:func>/);
    const power = parseLatex("10^2").node;
    expect(power).toMatchObject({ t: "scripts", base: { t: "run", text: "10" } });
    const letters = parseLatex("ab^2").node;
    expect(letters).toMatchObject({ t: "row", items: [{ text: "a" }, { t: "scripts", base: { text: "b" } }] });
  });

  it("gives a readable text version for apps without equations", () => {
    expect(latexToOmml(String.raw`\log_2 56-\log_2 7`, OPTIONS).text).toBe("log₂ 56−log₂ 7");
    expect(latexToOmml(String.raw`\frac{1}{8}`, OPTIONS).text).toBe("1/8");
    expect(latexToOmml(String.raw`\sqrt{x+3}=2`, OPTIONS).text).toBe("√(x+3)=2");
    expect(latexToOmml(String.raw`\frac{a+1}{a}`, OPTIONS).text).toBe("(a+1)/a");
    expect(latexToOmml(String.raw`x^{2}+5^{\log_3 7}`, OPTIONS).text).toBe("x²+5^(log₃ 7)");
  });

  it("reads the bank's \text{-} as a minus sign", () => {
    const { omml, text } = latexToOmml(String.raw`\text{-}\frac{16}{25}`, OPTIONS);
    expect(text).toBe("−16/25");
    expect(omml.startsWith("<m:oMath><m:box>")).toBe(true); // a unary sign stays tight after a label
  });

  it("reports commands it does not know instead of dropping them", () => {
    const { text, unsupported } = latexToOmml(String.raw`\foo{x}+1`, OPTIONS);
    expect(unsupported).toEqual(["foo"]);
    expect(text).toContain("foo");
  });

  it("escapes characters XML cannot carry as they are", () => {
    const { omml } = latexToOmml(String.raw`a<b \& c>d`, OPTIONS);
    expect(omml).toContain("&lt;");
    expect(omml).toContain("&gt;");
    expect(omml).toContain("&amp;");
    expectWellFormed(omml);
  });
});

describe("task text into slide paragraphs", () => {
  it("splits text and formulas like the site and keeps paragraphs", () => {
    const paragraphs = contentInlines("x және y нақты сандар болғанда, өрнектің ең кіші мәнін табыңыз:\n\n$x^2+y^2-8x+4y+24$");
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].some((inline) => inline.kind === "text")).toBe(true);
    expect(paragraphs[1].some((inline) => inline.kind === "math")).toBe(true);
    const mixed = contentInlines(String.raw`Есептеңіз: \log_2 56-\log_2 7+\log_2 2`)[0];
    expect(mixed[0]).toMatchObject({ kind: "text" });
    expect(mixed.find((inline) => inline.kind === "math")).toMatchObject({ latex: expect.stringContaining("\\log_2") });
  });
});

const task = (id: number, changes: Partial<ConstructorTask> = {}): ConstructorTask => ({
  id,
  text: String.raw`Есептеңіз: \log_2 56-\log_2 7+\log_2 2`,
  text_scale: "md",
  question_type: "mcq",
  answer_mode: "choices",
  difficulty: "B",
  topics: ["Логарифм"],
  image_filename: null,
  options: [
    { label: "A", text: "2" }, { label: "B", text: "3" }, { label: "C", text: "4" }, { label: "D", text: String.raw`\log_2 51` },
  ],
  subquestions: [],
  answer: "B",
  ...changes,
});

describe("answer key", () => {
  it("reads every answer format of the bank", () => {
    expect(parseAnswerLabels("C")).toEqual(["C"]);
    expect(parseAnswerLabels('["A", "C"]')).toEqual(["A", "C"]);
    expect(parseAnswerLabels("a, c")).toEqual(["A", "C"]);
    expect(taskAnswerPieces(task(1, { question_type: "mcq6", answer: '["A","C"]' }), "kk")).toEqual([
      { kind: "text", text: "A" }, { kind: "text", text: ", " }, { kind: "text", text: "C" },
    ]);
    expect(taskAnswerPieces(task(1, { answer_mode: "written", answer: "D" }), "kk")).toEqual([
      { kind: "math", latex: String.raw`\log_2 51` },
    ]);
    expect(taskAnswerPieces(task(1, { question_type: "tf", answer: "false", options: [] }), "ru")).toEqual([
      { kind: "text", text: "Неверно" },
    ]);
    expect(taskAnswerPieces(task(1, { question_type: "input", answer: String.raw`\frac{1}{8}`, options: [] }), "kk")).toEqual([
      { kind: "math", latex: String.raw`\frac{1}{8}` },
    ]);
    const select = task(1, {
      question_type: "select", answer: '["A", "C"]',
      subquestions: [{ text: "x+1=3", correct: "A" }, { text: "x+2=6", correct: "C" }],
    });
    expect(taskAnswerPieces(select, "kk").map((piece) => (piece.kind === "text" ? piece.text : piece.latex)).join(""))
      .toBe("A–A; B–C");
  });
});

describe("PPTX deck", () => {
  const png = { bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), ext: "png" as const, width: 1920, height: 1080 };

  it("has a title slide, one slide per task and the answers, all well-formed", () => {
    const tasks = Array.from({ length: 32 }, (_, index) => task(index + 1));
    const { files, unsupported } = buildTaskDeckFiles({
      title: "Логарифм & қасиеттері", author: "Ернұр", language: "kk", tasks,
      titleImage: png, background: { ...png, ext: "jpeg" }, taskImages: new Map([[3, { ...png, width: 400, height: 300 }]]),
    });
    expect(unsupported).toEqual([]);
    const slides = Array.from(files.keys()).filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path));
    expect(slides).toHaveLength(1 + 32 + 2); // 30 answers per slide
    for (const [path, content] of files) {
      if (typeof content === "string") expectWellFormed(content.replace(/^<\?xml[^>]*\?>\n/, ""));
      else expect(path).toMatch(/^ppt\/media\//);
    }
    // One background file shared by every task slide, plus the title image and one task picture.
    expect(Array.from(files.keys()).filter((path) => path.startsWith("ppt/media/"))).toEqual([
      "ppt/media/image1.png", "ppt/media/image2.jpeg", "ppt/media/image3.png",
    ]);
    const first = files.get("ppt/slides/slide2.xml") as string;
    expect(first).toContain("Есеп №1:");
    expect(first).toContain('<mc:Choice xmlns:a14="http://schemas.microsoft.com/office/drawing/2010/main" Requires="a14">');
    expect(first).toContain('<a14:m><m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">');
    expect(first).toContain("<mc:Fallback>");
    expect(first).toContain("log₂ 56"); // the fallback text
    expect(first).not.toMatch(/\(B\)/); // the answer is only on the answer slides
    expect(files.get("ppt/slides/slide4.xml")).toContain("<p:pic>");
    const answers = files.get("ppt/slides/slide34.xml") as string;
    expect(answers).toContain("Жауаптар");
    expect(answers).toContain(">1) </a:t>");
    expect(files.get("docProps/core.xml")).toContain("Логарифм &amp; қасиеттері");
    expect(files.get("ppt/presentation.xml")).toContain('<p:sldId id="290" r:id="rId37"/>');
  });

  it("uses Russian labels and a plain title slide without images", async () => {
    const { bytes } = await buildTaskDeck({ title: "Логарифмы", author: "Учитель", language: "ru", tasks: [task(1), task(2, { question_type: "tf", answer: "true", options: [] })] });
    const files = unzipSync(bytes);
    expect(Object.keys(files)[0]).toBe("[Content_Types].xml");
    const title = strFromU8(files["ppt/slides/slide1.xml"]);
    expect(title).toContain("Логарифмы");
    expect(title).toContain("2 задачи");
    expect(strFromU8(files["ppt/slides/slide3.xml"])).toContain("□ Верно");
    expect(strFromU8(files["ppt/slides/slide4.xml"])).toContain("Ответы");
    expect(strFromU8(files["ppt/slides/slide4.xml"])).toContain(">Верно</a:t>");
  });

  it("writes an option without words as one display equation", () => {
    const deck = (options: string[]) => buildTaskDeckFiles({ title: "T", author: "A", language: "kk",
      tasks: [task(1, { options: options.map((text, index) => ({ label: "ABCD"[index], text })) })] }).files.get("ppt/slides/slide2.xml") as string;
    const slide = deck([String.raw`\text{-}\frac{16}{25}`, "-3", String.raw`\frac{25}{16}`, "Шешімі жоқ"]);
    const choice = slide.slice(slide.indexOf("<mc:Choice"), slide.indexOf("</mc:Choice>"));
    expect(choice.match(/<m:oMathPara /g)?.length).toBe(3); // the option with words stays text
    expect(choice).toContain(">Шешімі жоқ</a:t>");
    expect(choice).not.toContain("<m:nor/>");
  });

  it("sets the text in JUZ40 FONTS unless another font is chosen; formulas stay Cambria Math", () => {
    const build = (font?: string) => buildTaskDeckFiles({ title: "T", author: "A", language: "kk", tasks: [task(1)], font }).files;
    const juz = build();
    expect(juz.get("ppt/theme/theme1.xml")).toContain('<a:majorFont><a:latin typeface="JUZ40 FONTS"/>');
    expect(juz.get("ppt/theme/theme1.xml")).toContain('<a:minorFont><a:latin typeface="JUZ40 FONTS"/>');
    const slide = juz.get("ppt/slides/slide2.xml") as string;
    expect(slide).toContain('<a:latin typeface="JUZ40 FONTS"/>');
    expect(slide).not.toContain('typeface="Arial"');
    expect(slide).toContain('<a:latin typeface="Cambria Math"');
    const calibri = build("Calibri").get("ppt/slides/slide2.xml") as string;
    expect(calibri).toContain('<a:latin typeface="Calibri"/>');
    expect(calibri).not.toContain("JUZ40 FONTS");
  });

  it("shrinks long tasks to fit their box", () => {
    const long = task(1, { text: "Өрнекті ықшамдаңыз: " + String.raw`\frac{k^2-25}{k+3}\cdot\frac{1}{k^2+5k}`.repeat(6) });
    const { files } = buildTaskDeckFiles({ title: "T", author: "A", language: "kk", tasks: [task(2), long] });
    const size = (xml: string) => Number(xml.match(/<a:p><a:pPr[^>]*>.*?sz="(\d+)"/)?.[1]);
    const short = files.get("ppt/slides/slide2.xml") as string;
    const crowded = files.get("ppt/slides/slide3.xml") as string;
    expect(size(crowded.slice(crowded.indexOf('name="Task 2"')))).toBeLessThan(size(short.slice(short.indexOf('name="Task 1"'))));
  });
});
