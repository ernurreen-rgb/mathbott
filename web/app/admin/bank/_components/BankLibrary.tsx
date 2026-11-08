"use client";

import Link from "next/link";
import { Fragment, useRef, useState, type ReactNode } from "react";
import Icon from "@/components/ui/Icon";
import MathRender from "@/components/ui/MathRender";
import { MAX_WORKSHEET_TASKS } from "@/lib/bank-worksheet";
import type { BankCatalogResponse, BankTask } from "@/types";
import { emptyLibraryFilters, questionTypeLabel, type BankLibraryFilters, type BankSavedView } from "./library-model";
import styles from "../BankWorkspace.module.css";

export type BankLibraryTab = "active" | "trash" | "answers";
type Props = {
  tab: BankLibraryTab; onTabChange: (tab: BankLibraryTab) => void;
  filters: BankLibraryFilters; onFiltersChange: (filters: BankLibraryFilters) => void;
  catalog: BankCatalogResponse | null; catalogLoading: boolean; catalogError: string | null;
  topicSearch: string; onTopicSearchChange: (query: string) => void;
  savedViews: BankSavedView[]; onSaveView: (name: string) => void; onRemoveView: (id: string) => void;
  tasks: BankTask[]; total: number; loading: boolean;
  selected: BankTask[]; onToggle: (task: BankTask) => void; onTogglePage: () => void; onClearSelection: () => void; onPdf: () => void;
  onOpen: (task: BankTask) => void; onCreate: () => void;
  onImport: () => void; onExport: () => void; importing: boolean; exporting: boolean;
  canReview: boolean; canDeletePermanently: boolean;
  onRestore: (id: number) => void; onDeletePermanently: (id: number) => void;
  answersPanel: ReactNode;
};

export default function BankLibrary(props: Props) {
  const { tab, filters, tasks, total, loading, catalog } = props;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [topicInput, setTopicInput] = useState("");
  const [viewName, setViewName] = useState("");
  const saveDialog = useRef<HTMLDialogElement>(null);
  const selectedIds = new Set(props.selected.map((task) => task.id));
  const allSelected = tasks.length > 0 && tasks.every((task) => selectedIds.has(task.id));
  const pageExceedsLimit = !allSelected && new Set([...selectedIds, ...tasks.map((task) => task.id)]).size > MAX_WORKSHEET_TASKS;
  const page = Math.floor(filters.offset / filters.limit) + 1;
  const pages = Math.max(1, Math.ceil(total / filters.limit));
  const pagination = Array.from(new Set([1, pages, page - 1, page, page + 1, ...(page < 4 ? [2, 3, 4] : []), ...(page > pages - 3 ? [pages - 3, pages - 2, pages - 1] : [])]))
    .filter((value) => value >= 1 && value <= pages).sort((a, b) => a - b);
  const patch = (changes: Partial<BankLibraryFilters>) => props.onFiltersChange({ ...filters, ...changes, offset: changes.offset ?? 0 });
  const base = () => { props.onFiltersChange(emptyLibraryFilters()); props.onTabChange("active"); };
  const activate = (changes: Partial<BankLibraryFilters>) => { props.onFiltersChange({ ...emptyLibraryFilters(), ...changes }); props.onTabChange("active"); setSidebarOpen(false); };
  const addTopic = () => {
    const name = topicInput.trim();
    if (name && name.length <= 64 && filters.topics.length < 20 && !filters.topics.some((t) => t.toLowerCase() === name.toLowerCase())) patch({ topics: [...filters.topics, name] });
    setTopicInput("");
  };
  const allActive = tab === "active" && !filters.topics.length && filters.usage === "all" && !filters.hasTopics;
  const title = tab === "trash" ? "Себет" : tab === "answers" ? "Оқушы жауаптары" : filters.topics.length === 1 ? filters.topics[0] : filters.usage === "unused" ? "Қолданылмайтын есептер" : filters.hasTopics === "no" ? "Тақырыпсыз есептер" : "Барлық есептер";

  return <>
    <header className={styles.header}>
      <div><nav aria-label="Бет жолы" className={styles.breadcrumbs}><Link href="/admin">Әкімші</Link><span>/</span><span aria-current="page">Банк</span></nav>
        <h1 className={styles.title}>Тапсырмалар банкі</h1><p className={styles.subtitle}>Тақырып бойынша табыңыз, есепті толық ашып жұмыс істеңіз.</p></div>
      <div className={styles.actions}>
        <details className={styles.menu}><summary className={styles.button}><Icon name="settings" /> Басқа әрекеттер</summary>
          <div className={styles.menuPanel}>
            <button type="button" className={styles.quiet} onClick={props.onImport} disabled={props.importing}><Icon name="upload" /> {props.importing ? "Тексерілуде..." : "JSON импорт"}</button>
            <button type="button" className={styles.quiet} onClick={props.onExport} disabled={props.exporting}><Icon name="download" /> {props.exporting ? "Экспортталуда..." : "JSON экспорт"}</button>
            {props.canReview && <><Link href="/admin/bank/quality" className={styles.quiet}><Icon name="chart" /> Сапа дашборды</Link><Link href="/admin/bank/audit" className={styles.quiet}><Icon name="audit" /> Әрекеттер журналы</Link></>}
          </div>
        </details>
        <button type="button" className={styles.primary} onClick={props.onCreate}><Icon name="plus" /> Есеп қосу</button>
      </div>
    </header>
    <div className={styles.library}>
      <aside className={styles.sidebar} aria-label="Банк каталогы">
        <button type="button" className={`${styles.button} ${styles.sidebarToggle}`} aria-expanded={sidebarOpen} aria-controls="bank-catalog-navigation" onClick={() => setSidebarOpen(!sidebarOpen)}><span><Icon name="folder" /> Каталог және тақырыптар</span><span aria-hidden="true">{sidebarOpen ? "−" : "+"}</span></button>
        <div className={styles.sidebarBody} id="bank-catalog-navigation" data-open={sidebarOpen}>
          <nav aria-label="Кітапхана" className={styles.navGroup}>
            <p className={styles.navLabel}>Кітапхана</p>
            <button type="button" className={styles.navItem} aria-pressed={allActive} onClick={base}><span><Icon name="book" /> Барлық есептер</span><span className={styles.count}>{catalog?.active_total ?? "—"}</span></button>
            <button type="button" className={styles.navItem} aria-pressed={tab === "active" && filters.usage === "unused"} onClick={() => activate({ usage: "unused" })}><span><Icon name="folder" /> Қолданылмайтын</span><span className={styles.count}>{catalog?.unused_total ?? "—"}</span></button>
            <button type="button" className={styles.navItem} aria-pressed={tab === "active" && filters.hasTopics === "no"} onClick={() => activate({ hasTopics: "no" })}><span><Icon name="tag" /> Тақырыпсыз</span><span className={styles.count}>{catalog?.no_topics_total ?? "—"}</span></button>
          </nav>
          <nav aria-label="Есеп тақырыптары" className={styles.navGroup}>
            <p className={styles.navLabel}>Тақырыптар</p>
            <input type="search" aria-label="Каталогтан тақырып іздеу" placeholder="Тақырып іздеу" value={props.topicSearch} onChange={(e) => props.onTopicSearchChange(e.target.value)} className={styles.topicSearch} />
            <div className={styles.topicList} aria-busy={props.catalogLoading}>
              {catalog?.topics.map((topic) => <button key={topic.id} type="button" className={styles.navItem} aria-pressed={tab === "active" && filters.topics.length === 1 && filters.topics[0] === topic.name} onClick={() => { patch({ topics: [topic.name], hasTopics: "" }); props.onTabChange("active"); setSidebarOpen(false); }}><span>{topic.name}</span><span className={styles.count}>{topic.task_count}</span></button>)}
              {!props.catalogLoading && catalog && !catalog.topics.length && <p className={styles.sidebarHint}>Тақырып табылмады.</p>}
            </div>
            {catalog?.has_more_topics && <p className={styles.sidebarHint}>Алғашқы {catalog.topics.length} тақырып. Қалғанын іздеумен табыңыз.</p>}
            {props.catalogError && <p role="status" className={styles.sidebarHint}>{props.catalogError}</p>}
          </nav>
          {props.savedViews.length > 0 && <nav aria-label="Сақталған сүзгілер" className={styles.navGroup}><p className={styles.navLabel}>Сақталған сүзгілер</p>{props.savedViews.map((view) => <div className={styles.savedRow} key={view.id}><button type="button" className={styles.navItem} onClick={() => { props.onFiltersChange({ ...view.filters, offset: 0 }); props.onTabChange("active"); setSidebarOpen(false); }}><span><Icon name="bookmark" /> {view.name}</span></button><button type="button" className={styles.deleteView} aria-label={`«${view.name}» сүзгісін жою`} onClick={() => props.onRemoveView(view.id)}><Icon name="close" /></button></div>)}</nav>}
          <nav aria-label="Банк басқару" className={styles.navGroup}>
            <button type="button" className={styles.navItem} aria-pressed={tab === "answers"} onClick={() => { props.onTabChange("answers"); setSidebarOpen(false); }}><span><Icon name="users" /> Оқушы жауаптары</span></button>
            <button type="button" className={styles.navItem} aria-pressed={tab === "trash"} onClick={() => { props.onTabChange("trash"); props.onFiltersChange(emptyLibraryFilters()); setSidebarOpen(false); }}><span><Icon name="trash" /> Себет</span><span className={styles.count}>{catalog?.trash_total ?? "—"}</span></button>
          </nav>
        </div>
      </aside>
      <section className={styles.content} aria-label={title}>
        {tab === "answers" ? props.answersPanel : <>
          <div className={styles.toolbar}><label className={styles.search}><Icon name="search" /><input type="search" aria-label="Банктен есеп іздеу" placeholder="Есеп мәтіні немесе #ID" value={filters.search} onChange={(e) => patch({ search: e.target.value })} /></label>
            <button type="button" className={styles.button} onClick={() => saveDialog.current?.showModal()}><Icon name="bookmark" /> Сүзгіні сақтау</button>
          </div>
          <div className={styles.filters}>
            <select className={styles.select} aria-label="Күрделілік бойынша сүзгі" value={filters.difficulty} onChange={(e) => patch({ difficulty: e.target.value as BankLibraryFilters["difficulty"] })}><option value="">Барлық күрделілік</option><option value="A">A · оңай</option><option value="B">B · орташа</option><option value="C">C · қиын</option></select>
            <select className={styles.select} aria-label="Сұрақ түрі бойынша сүзгі" value={filters.questionType} onChange={(e) => patch({ questionType: e.target.value as BankLibraryFilters["questionType"] })}><option value="">Барлық сұрақ түрі</option>{["input", "tf", "mcq", "mcq6", "select"].map((type) => <option key={type} value={type}>{questionTypeLabel(type)}</option>)}</select>
            <select className={styles.select} aria-label="Есептерді сұрыптау" value={filters.sort} onChange={(e) => patch({ sort: e.target.value as BankLibraryFilters["sort"] })}><option value="newest">Жаңалары алдымен</option><option value="updated">Соңғы өзгертілген</option><option value="oldest">Ескілері алдымен</option></select>
            <button type="button" className={styles.quiet} onClick={() => props.onFiltersChange(emptyLibraryFilters())}>Тазалау</button>
          </div>
          <details className={styles.advanced}><summary>Қосымша сүзгілер</summary><div className={styles.advancedBody}>
            <label className={styles.field}>Қолданылуы<select className={styles.select} value={filters.usage} onChange={(e) => patch({ usage: e.target.value as BankLibraryFilters["usage"] })}><option value="all">Барлығы</option><option value="used">Қолданыста</option><option value="unused">Қолданылмайтын</option></select></label>
            <label className={styles.field}>Тақырыптың болуы<select className={styles.select} value={filters.hasTopics} onChange={(e) => patch({ hasTopics: e.target.value as BankLibraryFilters["hasTopics"] })}><option value="">Барлығы</option><option value="yes">Тақырыбы бар</option><option value="no">Тақырыпсыз</option></select></label>
            <label className={styles.field}>Сүзгіге тақырып қосу<input value={topicInput} placeholder="Тақырыпты жазып, Enter басыңыз" list="bank-catalog-topics" onChange={(e) => setTopicInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTopic(); } }} maxLength={64} /><datalist id="bank-catalog-topics">{catalog?.topics.map((t) => <option key={t.id} value={t.name} />)}</datalist></label>
            <label className={styles.field}>Бірнеше тақырыпты сәйкестендіру<select className={styles.select} value={filters.topicMatch} onChange={(e) => patch({ topicMatch: e.target.value as "any" | "all" })}><option value="any">Кемінде бір тақырып сәйкес</option><option value="all">Барлық тақырып сәйкес</option></select></label>
          </div></details>
          {filters.topics.length > 0 && <div className={styles.chips} aria-label="Таңдалған тақырыптар">{filters.topics.map((topic) => <button key={topic} type="button" className={styles.chip} onClick={() => patch({ topics: filters.topics.filter((t) => t !== topic) })}>{topic}<Icon name="close" /></button>)}</div>}
          <div className={styles.listHeading}><h2>{title}</h2><p role="status" aria-live="polite">{loading ? "Жүктелуде..." : `${total.toLocaleString("kk-KZ")} есеп`}</p></div>
          {tab === "trash" && <p className={styles.subtitle}>Себеттегі есептер 30 күннен кейін автоматты жойылады.</p>}
          <table className={styles.table} aria-label="Банктегі есептер" aria-busy={loading}>
            <thead><tr><th scope="col">{tab === "active" && <input type="checkbox" aria-label="Осы беттегі есептерді таңдау" checked={allSelected} disabled={loading || !tasks.length || pageExceedsLimit} onChange={props.onTogglePage} />}</th><th scope="col" className={styles.idColumn}>ID</th><th scope="col">Есеп</th><th scope="col" className={styles.levelColumn}>Деңгей</th><th scope="col" className={styles.typeColumn}>Түрі</th><th scope="col" className={styles.usageColumn}>{tab === "trash" ? "Әрекеттер" : "Қолданыста"}</th></tr></thead>
            <tbody>{!loading && tasks.map((task) => <tr key={task.id} data-testid="bank-task-row"><td>{tab === "active" && <input type="checkbox" checked={selectedIds.has(task.id)} disabled={!selectedIds.has(task.id) && props.selected.length >= MAX_WORKSHEET_TASKS} onChange={() => props.onToggle(task)} aria-label={`PDF үшін банк №${task.id} есебін таңдау`} />}</td><td className={`${styles.idCell} ${styles.idColumn}`}>#{task.id}</td><td><button type="button" className={styles.taskTitle} aria-label={`Банк №${task.id} есебін ашу`} onClick={() => props.onOpen(task)}><span className={styles.taskExcerpt}>{task.text ? <MathRender latex={task.text} /> : `Есеп #${task.id}`}</span></button><div className={styles.taskTopics}>{task.topics.slice(0, 3).map((topic) => <span key={topic}>{topic}</span>)}{task.topics.length > 3 && <span>+{task.topics.length - 3}</span>}</div><div className={styles.mobileMeta}>#{task.id} · {task.difficulty} · {questionTypeLabel(task.question_type)} · v{task.current_version ?? 1}</div></td><td className={styles.levelColumn}><span className={styles.level}>{task.difficulty}</span></td><td className={`${styles.metadataCell} ${styles.typeColumn}`}>{questionTypeLabel(task.question_type)}</td><td className={`${styles.metadataCell} ${styles.usageColumn}`}>{tab === "active" ? task.active_usage_count ?? 0 : <div className={styles.rowActions}><button type="button" className={styles.button} onClick={() => props.onRestore(task.id)}>Қалпына келтіру</button>{props.canDeletePermanently && <button type="button" className={styles.danger} onClick={() => props.onDeletePermanently(task.id)}>Жою</button>}</div>}</td></tr>)}</tbody>
          </table>
          {loading ? <div className={styles.loading}>Есептер жүктелуде...</div> : !tasks.length && <div className={styles.empty}>Сүзгілерге сәйкес есеп табылмады.<br /><button type="button" className={styles.quiet} onClick={() => props.onFiltersChange(emptyLibraryFilters())}>Сүзгілерді тазалау</button></div>}
          <div className={styles.pagination}><div className={styles.actions}><span>{total ? filters.offset + 1 : 0}–{Math.min(filters.offset + tasks.length, total)} / {total.toLocaleString("kk-KZ")}</span><select className={styles.select} aria-label="Бір беттегі есеп саны" value={filters.limit} onChange={(e) => patch({ limit: Number(e.target.value) })}>{[20, 50, 100].map((n) => <option key={n} value={n}>{n} есеп</option>)}</select></div><nav aria-label="Есептер беттері" className={styles.pages}><button type="button" className={styles.pageButton} aria-label="Алдыңғы бет" disabled={loading || filters.offset === 0} onClick={() => patch({ offset: Math.max(0, filters.offset - filters.limit) })}><Icon name="arrowLeft" /></button>{pagination.map((number, index) => <Fragment key={number}>{index > 0 && number - pagination[index - 1] > 1 && <span>…</span>}<button type="button" className={styles.pageButton} aria-current={number === page ? "page" : undefined} disabled={loading || number === page} onClick={() => patch({ offset: (number - 1) * filters.limit })}>{number}</button></Fragment>)}<button type="button" className={styles.pageButton} aria-label="Келесі бет" disabled={loading || filters.offset + filters.limit >= total} onClick={() => patch({ offset: filters.offset + filters.limit })}><Icon name="arrowRight" /></button></nav></div>
          {tab === "active" && props.selected.length > 0 && <section className={styles.selectionBar} aria-label="Есептерді PDF-ке жинау"><div><strong role="status" aria-live="polite">PDF үшін таңдалды: {props.selected.length}</strong><p>Бет пен сүзгі ауысқанда сақталады · ең көбі {MAX_WORKSHEET_TASKS}</p></div><div className={styles.actions}><button type="button" className={styles.quiet} onClick={props.onClearSelection}>Таңдауды тазалау</button><button type="button" className={styles.primary} onClick={props.onPdf}><Icon name="download" /> PDF дайындау</button></div></section>}
        </>}
      </section>
    </div>
    <dialog ref={saveDialog} className={styles.dialog} aria-labelledby="bank-save-view-title"><form onSubmit={(e) => { e.preventDefault(); if (!viewName.trim()) return; props.onSaveView(viewName); setViewName(""); saveDialog.current?.close(); }}><h2 id="bank-save-view-title">Сүзгіні сақтау</h2><label className={styles.field}>Сүзгі атауы<input autoFocus required maxLength={64} value={viewName} onChange={(e) => setViewName(e.target.value)} placeholder="Мысалы, B деңгейіндегі теңдеулер" /></label><div className={styles.actions}><button type="button" className={styles.button} onClick={() => saveDialog.current?.close()}>Бас тарту</button><button type="submit" className={styles.primary}>Сақтау</button></div></form></dialog>
  </>;
}
