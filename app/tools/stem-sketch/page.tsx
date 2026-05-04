import { redirect } from "next/navigation";
import StemSketchClient from "./StemSketchClient";

export default function StemSketchPage() {
  if (process.env.NODE_ENV !== "development") {
    redirect("/");
  }

  return <StemSketchClient />;
}
