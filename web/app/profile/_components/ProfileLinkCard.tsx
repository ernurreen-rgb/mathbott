import Link from "next/link";

import Icon, { type IconName } from "@/components/ui/Icon";

type Props = {
  href: string;
  icon: IconName;
  /** Background and colour of the icon tile, e.g. "bg-amber-100 text-amber-600". */
  iconClassName: string;
  title: string;
  hint: string;
};

/** A card on the profile that opens another page: icon, title, hint and a chevron. */
export default function ProfileLinkCard({ href, icon, iconClassName, title, hint }: Props) {
  return (
    <Link
      href={href}
      className="glass flex items-center gap-4 rounded-3xl border border-white/30 p-5 shadow-xl transition-colors hover:border-purple-300"
    >
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${iconClassName}`}>
        <Icon name={icon} className="h-6 w-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-bold text-gray-900">{title}</span>
        <span className="block text-sm text-gray-500">{hint}</span>
      </span>
      <Icon name="chevronRight" className="h-5 w-5 shrink-0 text-gray-400" />
    </Link>
  );
}
