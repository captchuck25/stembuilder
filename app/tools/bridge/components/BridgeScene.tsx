"use client";

import Image from "next/image";

export default function BridgeScene() {
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Image
        src="/ui/bridge-bg.png?v=2"
        alt="Bridge background"
        fill
        priority
        style={{ objectFit: "fill" }}
        unoptimized
      />
    </div>
  );
}
