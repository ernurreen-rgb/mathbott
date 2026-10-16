import styles from "../CmsWorkspace.module.css";

type Props = { kind?: "list" | "tasks" | "page"; label?: string };

export default function CmsSkeleton({ kind = "list", label = "Мазмұн жүктелуде..." }: Props) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className={styles.skeleton}>
      <span className="sr-only">{label}</span>
      <div aria-hidden="true">
        {kind === "page" && <>
          <div className={`${styles.skeletonBar} ${styles.skeletonCrumb}`} />
          <div className={styles.header}><div className={`${styles.skeletonBar} ${styles.skeletonTitle}`} /></div>
        </>}
        {kind !== "tasks" && <>
          <div className={styles.skeletonToolbar}>
            <span className={`${styles.skeletonBar} ${styles.skeletonLabel}`} />
            <span className={`${styles.skeletonBar} ${styles.skeletonButton}`} />
          </div>
          <div className={styles.skeletonListHeading} />
        </>}
        {Array.from({ length: kind === "tasks" ? 3 : 5 }, (_, index) => (
          <div key={index} className={styles.skeletonRow}>
            <span className={`${styles.skeletonBar} ${index % 2 ? styles.skeletonLabel : styles.skeletonText}`} />
            <span className={`${styles.skeletonBar} ${styles.skeletonLabel}`} />
          </div>
        ))}
      </div>
    </div>
  );
}
