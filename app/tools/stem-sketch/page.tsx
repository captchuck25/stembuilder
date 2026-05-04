import { redirect } from "next/navigation";

export default function StemSketchPage() {
  if (process.env.NODE_ENV === "development") {
    return (
      <iframe
        src="/stem-sketch/index.html"
        title="STEM Sketch"
        style={{ position: "fixed", inset: 0, width: "100%", height: "100%", border: "none" }}
      />
    );
  }
  redirect("/");
}
