import Link from "next/link";
import styles from "../CmsWorkspace.module.css";

type Item = { id: number; title: string; description?: string | null; href: string; meta?: string };
type Props = { items: Item[]; openLabel: string; onEdit?: (id: number) => void; onDelete?: (id: number) => void };

export default function CurriculumList({ items, openLabel, onEdit, onDelete }: Props) {
  const hasActions = Boolean(onEdit || onDelete);
  if (items.length === 0) return null;
  return (
    <div className={styles.curriculumList}>
      <div className={styles.listHeading} aria-hidden="true">
        <span>Атауы</span>
        {hasActions && <span>Әрекеттер</span>}
      </div>
      <ul>
        {items.map((item) => (
          <li key={item.id} className={styles.curriculumRow}>
            <Link href={item.href} className={styles.itemLink}>
              <div className={styles.itemContent}>
                <h3>{item.title}</h3>
                {item.meta && <span className={styles.itemMeta}>{item.meta}</span>}
                {item.description && <p>{item.description}</p>}
              </div>
              <span className={styles.itemOpen}>{openLabel}<span aria-hidden="true">→</span></span>
            </Link>
            {hasActions && <div className={styles.rowActions}>
              {onEdit && <button type="button" className={styles.textButton} aria-label={`${item.title} өңдеу`} onClick={() => onEdit(item.id)}>Өңдеу</button>}
              {onDelete && <button type="button" className={styles.dangerButton} aria-label={`${item.title} жою`} onClick={() => onDelete(item.id)}>Жою</button>}
            </div>}
          </li>
        ))}
      </ul>
    </div>
  );
}
