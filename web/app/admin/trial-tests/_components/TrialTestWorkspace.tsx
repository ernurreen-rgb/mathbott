"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";
import MathRender from "@/components/ui/MathRender";
import { apiPath } from "@/lib/api";
import { getTaskTextScaleClass, getTaskTextScaleStyle } from "@/lib/task-text-scale";
import type { TrialTest } from "@/types";
import CmsSkeleton from "../../cms/_components/CmsSkeleton";
import styles from "../../cms/CmsWorkspace.module.css";
import local from "../TrialTests.module.css";
import BankPickerDialog from "./BankPickerDialog";
import InlineTaskDialog from "./InlineTaskDialog";
import CurrentSlotControls from "./CurrentSlotControls";
import TrialTestFormDialog from "./TrialTestFormDialog";
import { getPlacementImageFilename, getPlacementText, getPlacementTextScale } from "./model";
import { normalizeCategory, trialFolderPath, useTrialTests } from "./TrialTestsProvider";
import { useTrialTaskEditor } from "./useTrialTaskEditor";

function TaskEditor({ test }: { test: TrialTest }) {
  const slotCount = Math.max(1, test.expected_tasks_count || 40);
  const editor = useTrialTaskEditor(test.id, slotCount);
  const { tasks, loading, currentSlotIndex, currentPlacement, slotMap } = editor;
  const firstEmpty = Array.from({ length: slotCount }, (_, i) => i + 1).find((slot) => !slotMap.has(slot));
  const addSlot = !currentPlacement ? currentSlotIndex : firstEmpty;
  const category = normalizeCategory(test.category);
  const [settings, setSettings] = useState(false);
  const slotNavigation = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = slotNavigation.current;
    const selected = nav?.querySelector<HTMLButtonElement>('button[aria-current="step"]');
    if (nav && selected) nav.scrollTo?.({ left: Math.max(0, selected.offsetLeft - (nav.clientWidth - selected.offsetWidth) / 2) });
  }, [currentSlotIndex, loading]);

  return <>
    <nav aria-label="Мазмұн жолы" className={styles.breadcrumbs}><Link href="/admin/trial-tests">Сынақ тесттері</Link><span className={styles.breadcrumbSeparator}>/</span><Link href={trialFolderPath(category)}>{category}</Link><span className={styles.breadcrumbSeparator}>/</span><span aria-current="page">{test.title}</span></nav>
    <header className={styles.header}><h1 className={styles.title}>{test.title}</h1><div className={styles.actions}>
      <Link href={trialFolderPath(category)} className={styles.textButton}><Icon name="arrowLeft" />Тесттер</Link>
      <button type="button" className={styles.textButton} onClick={() => setSettings(true)}><Icon name="edit" />Тестті өңдеу</button>
    </div></header>
    {test.description && <p className={local.description}>{test.description}</p>}
    {editor.error && !editor.showBankPicker && !editor.showInlineCreate && <div role="alert" className={styles.error}>{editor.error}</div>}
    <div className={local.editorToolbar}>
      <div className={styles.actions}><h2 className={styles.panelTitle}>Тапсырмалар</h2><span className={styles.count}>{loading ? "…" : tasks.length} / {slotCount}</span></div>
      <div className={styles.actions}>
        <button type="button" className={styles.secondaryButton} disabled={!editor.ready || !addSlot || editor.busy} onClick={() => editor.openBankForCurrentSlot(addSlot)}><Icon name="folder" />Банктен қосу</button>
        <button type="button" className={styles.primaryButton} disabled={!editor.ready || !addSlot || editor.busy} onClick={() => editor.openInlineCreateForCurrentSlot(addSlot)}><Icon name="plus" />Жаңа тапсырма</button>
      </div>
    </div>
    {loading ? <CmsSkeleton kind="tasks" label="Тапсырмалар жүктелуде..." /> : !editor.ready ? <div className={styles.empty}><h3>Тапсырмаларды жүктеу мүмкін болмады</h3><button type="button" className={`${styles.secondaryButton} mt-4`} onClick={() => { editor.setError(null); void editor.fetchTasks(test.id); }}>Қайта жүктеу</button></div> : <div className={local.previewLayout}>
      <div><nav ref={slotNavigation} className={local.slotGrid} aria-label="Тапсырма нөмірлері">
        {Array.from({ length: slotCount }, (_, i) => i + 1).map((slot) => <button key={slot} type="button" aria-label={`${slot}-тапсырма${slotMap.has(slot) ? "" : ", бос"}`} aria-current={slot === currentSlotIndex ? "step" : undefined}
          className={`${local.slot} ${slotMap.has(slot) ? local.slotFilled : ""} ${slot === currentSlotIndex ? local.slotCurrent : ""} ${editor.slotAnswered(slot) ? local.slotAnswered : ""}`} onClick={() => editor.setCurrentSlotIndex(slot)}>{slot}</button>)}
      </nav><div className={local.legend}><span><i className={local.legendFilled} />Толтырылған</span><span><i />Бос</span></div></div>
      <section className={local.preview} aria-label="Тапсырманың алдын ала көрінісі">
        <div className={local.previewHeading}><h3>{currentSlotIndex}-тапсырма</h3><div className={styles.actions}>
          <button type="button" disabled={editor.busy} className={styles.secondaryButton} onClick={() => editor.openBankForCurrentSlot()}>{currentPlacement ? "Банктен ауыстыру" : "Банктен таңдау"}</button>
          {currentPlacement && <button type="button" disabled={editor.busy} className={styles.dangerButton} onClick={() => void editor.onClearSlot(currentSlotIndex)}>Тазалау</button>}
        </div></div>
        {currentPlacement ? <>
          <div className={`${local.statement} ${getTaskTextScaleClass(getPlacementTextScale(currentPlacement))}`} style={getTaskTextScaleStyle(getPlacementTextScale(currentPlacement))}><MathRender latex={getPlacementText(currentPlacement) || "Тапсырма мәтіні бос"} /></div>
          {getPlacementImageFilename(currentPlacement) && <Image src={apiPath(`images/${getPlacementImageFilename(currentPlacement)}`)} alt="Тапсырма суреті" width={1280} height={720} unoptimized className="mt-4 max-h-64 w-auto max-w-full rounded border border-slate-200" />}
          <div className={local.answerControls}><CurrentSlotControls currentPlacement={currentPlacement} previewAnswers={editor.previewAnswers} currentSlotIndex={currentSlotIndex} setPreviewAnswer={editor.setPreviewAnswer} /></div>
        </> : <div className={styles.empty}><h3>Бос ұяшық</h3><p>Банктен таңдаңыз немесе осы орынға жаңа тапсырма қосыңыз.</p><button type="button" className={`${styles.secondaryButton} mt-4`} onClick={() => editor.openInlineCreateForCurrentSlot()}>Жаңа тапсырма құру</button></div>}
        <div className={local.previewFooter}><button type="button" className={styles.secondaryButton} disabled={currentSlotIndex === 1} onClick={() => editor.setCurrentSlotIndex((slot) => slot - 1)}><Icon name="arrowLeft" />Алдыңғы</button><span className={styles.count}>{currentSlotIndex} / {slotCount}</span><button type="button" className={styles.secondaryButton} disabled={currentSlotIndex === slotCount} onClick={() => editor.setCurrentSlotIndex((slot) => slot + 1)}>Келесі<Icon name="arrowRight" /></button></div>
      </section>
    </div>}
    {settings && <TrialTestFormDialog test={test} onClose={() => setSettings(false)} />}
    <BankPickerDialog {...editor} selectedTestId={test.id} />
    <InlineTaskDialog {...editor} selectedTestId={test.id} />
  </>;
}

export default function TrialTestWorkspace({ testId }: { testId: number }) {
  const { tests, loading, error, refreshTests } = useTrialTests();
  const test = tests.find((item) => item.id === testId);
  if (loading && !test) return <CmsSkeleton kind="page" label="Тест жүктелуде..." />;
  if (!test) return <div className={styles.empty}><h1 className={styles.title}>{error ? "Тестті жүктеу мүмкін болмады" : "Тест табылмады"}</h1>{error && <p role="alert">{error}</p>}<div className={`${styles.actions} mt-4`}><Link href="/admin/trial-tests" className={styles.secondaryButton}>Сынақ тесттері</Link>{error && <button className={styles.secondaryButton} onClick={() => void refreshTests()}>Қайта жүктеу</button>}</div></div>;
  return <TaskEditor key={test.id} test={test} />;
}
