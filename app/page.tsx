import Image from "next/image";
import Link from "next/link";

import styles from "./page.module.css";

const tiles = [
  {
    label: "Bridge Builder",
    href: "/tools/bridge",
    src: "/ui/bridge-button.png",
  },
];

export default function Home() {
  return (
    <div className={styles.container}>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
        {tiles.map((tile) => (
          <Link key={tile.label} href={tile.href} className={styles.tile}>
            <Image
              src={tile.src}
              alt={tile.label}
              width={420}
              height={140}
              className={styles.image}
              priority
              unoptimized
            />
          </Link>
        ))}
      </div>
    </div>
  );
}
