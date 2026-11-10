"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/ui/Icon";
import { getAdminBankTaskTwins } from "@/lib/api";
import type { BankTask } from "@/types";
import BankTaskDetail from "./BankTaskDetail";
import styles from "../BankWorkspace.module.css";

type Props = {
  source: BankTask;
  email: string;
  busy: boolean;
  onCreate: () => void;
  onOpen: (task: BankTask, mode: "view" | "edit") => void;
  onDelete: (task: BankTask) => void;
};

/** Twins of one source task: number-only variants that module mistake review serves instead of the original. */
export default function BankTwinsPanel({ source, email, busy, onCreate, onOpen, onDelete }: Props) {
  const [items, setItems] = useState<BankTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    void getAdminBankTaskTwins(source.id, email).then(({ data, error: err }) => {
      if (cancelled) return;
      setItems(data?.items || []); setError(err); setLoading(false);
    });
    return () => { cancelled = true; };
    // A changed count or version means a twin was added, edited or moved to trash.
  }, [source.id, source.twin_count, source.current_version, email]);

  return <section aria-label="Егіз есептер">
    <div className={styles.twinIntro}>
      <p>Егіз — осы есептің тек сандары өзгерген нұсқасы. Оқушы есепті бірінші әрекетте қате шығарса, мини-сабақтан кейінгі қателерді талдауда оған егіз беріледі. Егіз болмаса, бастапқы есеп қайталанады.</p>
      {!source.deleted_at && <button type="button" className={styles.primary} disabled={busy} onClick={onCreate}><Icon name="plus" /> Егіз жасау</button>}
    </div>
    {loading ? <div className={styles.loading}>Егіздер жүктелуде...</div>
      : error ? <div role="alert" className={styles.alert}>{error}</div>
      : !items.length ? <div className={styles.empty}>Әзірге егіз жоқ. Бір есепке 2–3 егіз жеткілікті.</div>
      : <ol className={styles.twinList}>{items.map((twin, index) => <li key={twin.id} className={styles.twinItem}>
        <div className={styles.twinItemHeader}>
          <span>{index + 1}-егіз · Банк №{twin.id} · v{twin.current_version ?? 1}</span>
          <div className={styles.actions}>
            <button type="button" className={styles.quiet} disabled={busy} onClick={() => onOpen(twin, "view")}>Ашу</button>
            <button type="button" className={styles.button} disabled={busy} onClick={() => onOpen(twin, "edit")}><Icon name="edit" /> Өңдеу</button>
            <button type="button" className={styles.danger} disabled={busy} onClick={() => onDelete(twin)}><Icon name="trash" /> Себетке</button>
          </div>
        </div>
        <BankTaskDetail task={twin} />
      </li>)}</ol>}
  </section>;
}
