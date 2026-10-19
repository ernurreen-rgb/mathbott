
import Icon, { ContentIcon } from "@/components/ui/Icon";
import Link from "next/link";
import styles from "../CmsWorkspace.module.css";

type Item = { id: number; title: string; description?: string | null; href: string; meta?: string; icon?: string };
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
                <h3 className="flex items-center gap-3">{item.icon && <ContentIcon value={item.icon} fallback="book" size={22} className="text-indigo-600" />}{item.title}</h3>
                {item.meta && <span className={styles.itemMeta}>{item.meta}</span>}
                {item.description && <p>{item.description}</p>}
              </div>
              <span className={styles.itemOpen}>{openLabel}<span aria-hidden="true"><Icon name="arrowRight" /></span></span>
            </Link>
            {hasActions && <div className={styles.rowActions}>
              {onEdit && <button type="button" className={styles.textButton} aria-label={`${item.title} өңдеу`} onClick={() => onEdit(item.id)}><Icon name="edit" size={15} />Өңдеу</button>}
              {onDelete && <button type="button" className={styles.dangerButton} aria-label={`${item.title} жою`} onClick={() => onDelete(item.id)}><Icon name="trash" size={15} />Жою</button>}
            </div>}
          </li>
        ))}
      </ul>
    </div>
  );
}
