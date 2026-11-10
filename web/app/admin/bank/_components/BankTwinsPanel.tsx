"use client";

import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/ui/Icon";
import MathRender from "@/components/ui/MathRender";
import { approveAdminBankTwin, checkAdminAiTwin, generateAdminAiTwinDrafts, getAdminAiTwinStatus, getAdminBankTaskTwins } from "@/lib/api";
import type { AiTwinStatus, BankTask } from "@/types";
import BankTaskDetail from "./BankTaskDetail";
import styles from "../BankWorkspace.module.css";

type Props = {
  source: BankTask;
  email: string;
  busy: boolean;
  onCreate: () => void;
  onOpen: (task: BankTask, mode: "view" | "edit") => void;
  onDelete: (task: BankTask) => void;
  /** Counts on the source changed (a draft was created or approved). */
  onChanged: () => void;
};

function CheckLine({ twin, checking, canCheck, onCheck }: { twin: BankTask; checking: boolean; canCheck: boolean; onCheck: () => void }) {
  if (checking) return <p className={styles.checkNeutral} role="status">ИИ есепті жауабын көрмей қайта шешіп жатыр...</p>;
  const check = twin.ai_check;
  const recheck = canCheck && <button type="button" className={styles.quiet} onClick={onCheck}>{check ? "Қайта тексеру" : "ИИ-мен тексеру"}</button>;
  if (!check) return twin.twin_origin === "ai" || canCheck ? <p className={styles.checkNeutral}>Жауап әлі тексерілмеген. {recheck}</p> : null;
  const stale = check.checked_version != null && check.checked_version !== twin.current_version;
  const staleNote = stale ? ` (v${check.checked_version} нұсқасы тексерілген, кейін өңделді)` : "";
  if (check.status === "error") return <p className={styles.checkMismatch}>ИИ тексеруі сәтсіз аяқталды. {recheck}</p>;
  if (check.status === "match") {
    return <p className={stale ? styles.checkNeutral : styles.checkMatch}>
      <Icon name="checkCircle" /> ИИ қайта шешті, жауап сәйкес: <MathRender inline latex={check.answer || ""} />{staleNote} {stale && recheck}
    </p>;
  }
  return <p className={styles.checkMismatch}>
    <Icon name="closeCircle" /> ИИ қайта шешкенде басқа жауап шықты: <MathRender inline latex={check.answer || ""} />{staleNote}. Есепті мұқият тексеріңіз. {recheck}
  </p>;
}

/** Twins of one source task: number-only variants that module mistake review serves instead of the original. */
export default function BankTwinsPanel({ source, email, busy, onCreate, onOpen, onDelete, onChanged }: Props) {
  const [items, setItems] = useState<BankTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ai, setAi] = useState<AiTwinStatus | null>(null);
  const [generating, setGenerating] = useState(false);
  const [checking, setChecking] = useState<Record<number, boolean>>({});
  const [approving, setApproving] = useState<number | null>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await getAdminBankTaskTwins(source.id, email);
    setItems(data?.items || []); setError(err); setLoading(false);
  }, [source.id, email]);

  useEffect(() => {
    setLoading(true);
    void load();
    // Changed counts or version mean a twin was added, approved, edited or moved to trash.
  }, [load, source.twin_count, source.twin_draft_count, source.current_version]);
  useEffect(() => {
    let cancelled = false;
    void getAdminAiTwinStatus(email).then(({ data }) => { if (!cancelled) setAi(data); });
    return () => { cancelled = true; };
  }, [email]);

  const runCheck = async (twinId: number) => {
    setChecking((previous) => ({ ...previous, [twinId]: true }));
    const { data, error: err } = await checkAdminAiTwin(twinId, email);
    setItems((previous) => previous.map((twin) => twin.id !== twinId ? twin : {
      ...twin, ai_check: data ?? { status: "error", answer: null, checked_version: twin.current_version ?? null },
    }));
    if (err) setError(err);
    setChecking((previous) => ({ ...previous, [twinId]: false }));
  };

  const generate = async () => {
    setGenerating(true); setError(null); setNotice(null);
    const { data, error: err } = await generateAdminAiTwinDrafts(source.id, email);
    setGenerating(false);
    if (!data || err) { setError(err || "ИИ черновиктерін жасау мүмкін болмады."); return; }
    const skipped = data.skipped.length ? ` ${data.skipped.length} черновик банк ережелеріне сай келмей, алынып тасталды.` : "";
    setNotice(`ИИ ${data.items.length} черновик жасады.${skipped} Әрқайсысын тексеріп, мақұлдаңыз — оған дейін оқушыларға берілмейді.`);
    await load();
    onChanged();
    await Promise.all(data.items.map((twin) => runCheck(twin.id)));
  };

  const approve = async (twin: BankTask) => {
    if (twin.ai_check?.status === "mismatch" && !window.confirm("ИИ қайта шешкенде басқа жауап шықты. Бәрібір мақұлдау керек пе?")) return;
    setApproving(twin.id); setError(null);
    const { error: err } = await approveAdminBankTwin(twin.id, email);
    setApproving(null);
    if (err) { setError(err); return; }
    await load();
    onChanged();
  };

  const aiBlocked = !ai?.enabled ? "ИИ бапталмаған: серверде AI_TWIN_BASE_URL, AI_TWIN_API_KEY және AI_TWIN_MODEL орнатылуы керек."
    : source.image_filename ? "Суреті бар есепке ИИ егіз жасамайды: сандар суретте болуы мүмкін." : null;

  return <section aria-label="Егіз есептер">
    <div className={styles.twinIntro}>
      <p>Егіз — осы есептің тек сандары өзгерген нұсқасы. Оқушы есепті бірінші әрекетте қате шығарса, мини-сабақтан кейінгі қателерді талдауда оған егіз беріледі. ИИ черновиктері мұғалім мақұлдағаннан кейін ғана беріледі.</p>
      {!source.deleted_at && <div className={styles.actions}>
        <button type="button" className={styles.button} disabled={busy || generating || !!aiBlocked} title={aiBlocked || undefined} onClick={() => void generate()}>
          <Icon name="sparkles" /> {generating ? "ИИ жасап жатыр... (1 минутқа дейін)" : `ИИ-черновиктер (${ai?.drafts_per_request ?? 3})`}
        </button>
        <button type="button" className={styles.primary} disabled={busy || generating} onClick={onCreate}><Icon name="plus" /> Егіз жасау</button>
      </div>}
    </div>
    {ai && !ai.enabled && <p className={styles.checkNeutral}>ИИ-черновиктер өшірулі: әкімші серверде ИИ провайдерін баптауы керек.</p>}
    {notice && <div role="status" className={styles.notice}><span>{notice}</span><button type="button" aria-label="Хабарламаны жабу" onClick={() => setNotice(null)}><Icon name="close" /></button></div>}
    {error && <div role="alert" className={styles.alert}>{error}</div>}
    {loading ? <div className={styles.loading}>Егіздер жүктелуде...</div>
      : !items.length ? <div className={styles.empty}>Әзірге егіз жоқ. Бір есепке 2–3 егіз жеткілікті.</div>
      : <ol className={styles.twinList}>{items.map((twin, index) => {
        const draft = twin.twin_status === "draft";
        return <li key={twin.id} className={`${styles.twinItem} ${draft ? styles.twinDraft : ""}`}>
          <div className={styles.twinItemHeader}>
            <span>{index + 1}-егіз · Банк №{twin.id} · v{twin.current_version ?? 1}
              {draft && <span className={styles.draftBadge}>Черновик · ИИ</span>}
              {!draft && twin.twin_origin === "ai" && <span className={styles.twinBadge}>ИИ · мақұлданған</span>}
            </span>
            <div className={styles.actions}>
              {draft && <button type="button" className={styles.primary} disabled={busy || approving === twin.id} onClick={() => void approve(twin)}><Icon name="checkCircle" /> {approving === twin.id ? "Сақталуда..." : "Мақұлдау"}</button>}
              {!draft && <button type="button" className={styles.quiet} disabled={busy} onClick={() => onOpen(twin, "view")}>Ашу</button>}
              <button type="button" className={styles.button} disabled={busy} onClick={() => onOpen(twin, "edit")}><Icon name="edit" /> Өңдеу</button>
              <button type="button" className={styles.danger} disabled={busy} onClick={() => onDelete(twin)}><Icon name="trash" /> Себетке</button>
            </div>
          </div>
          <BankTaskDetail task={twin} />
          <CheckLine twin={twin} checking={!!checking[twin.id]} canCheck={!!ai?.enabled && !checking[twin.id]} onCheck={() => void runCheck(twin.id)} />
        </li>;
      })}</ol>}
  </section>;
}
