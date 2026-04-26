import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

function renderMarkdown(md: string): React.ReactNode {
  const lines = md.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;
  let listItems: string[] = [];
  let listType: "ul" | "ol" | null = null;

  function flushList() {
    if (!listItems.length) return;
    if (listType === "ol") {
      elements.push(
        <ol key={`list-${i}`} style={{ paddingLeft: 20, margin: "8px 0" }}>
          {listItems.map((t, k) => <li key={k} style={{ marginBottom: 4 }} dangerouslySetInnerHTML={{ __html: inlineFormat(t) }} />)}
        </ol>
      );
    } else {
      elements.push(
        <ul key={`list-${i}`} style={{ paddingLeft: 20, margin: "8px 0" }}>
          {listItems.map((t, k) => <li key={k} style={{ marginBottom: 4 }} dangerouslySetInnerHTML={{ __html: inlineFormat(t) }} />)}
        </ul>
      );
    }
    listItems = [];
    listType = null;
  }

  while (i < lines.length) {
    const line = lines[i];

    // Headings
    if (line.startsWith("## ")) {
      flushList();
      elements.push(<h3 key={i} style={{ fontSize: 18, fontWeight: 700, marginTop: 20, marginBottom: 8 }} dangerouslySetInnerHTML={{ __html: inlineFormat(line.slice(3)) }} />);
    } else if (line.startsWith("# ")) {
      flushList();
      elements.push(<h2 key={i} style={{ fontSize: 20, fontWeight: 700, marginTop: 24, marginBottom: 10 }} dangerouslySetInnerHTML={{ __html: inlineFormat(line.slice(2)) }} />);
    }
    // Bullet list
    else if (/^[-•*] /.test(line)) {
      if (listType !== "ul") { flushList(); listType = "ul"; }
      listItems.push(line.replace(/^[-•*] /, ""));
    }
    // Numbered list
    else if (/^\d+\. /.test(line)) {
      if (listType !== "ol") { flushList(); listType = "ol"; }
      listItems.push(line.replace(/^\d+\. /, ""));
    }
    // Blank line = paragraph separator
    else if (line.trim() === "") {
      flushList();
      elements.push(<div key={i} style={{ height: 12 }} />);
    }
    // Normal paragraph line
    else {
      flushList();
      elements.push(<p key={i} style={{ margin: "4px 0", lineHeight: 1.65 }} dangerouslySetInnerHTML={{ __html: inlineFormat(line) }} />);
    }
    i++;
  }
  flushList();
  return <>{elements}</>;
}

function inlineFormat(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code style=\"background:#f3f3f3;padding:2px 5px;border-radius:3px;font-size:0.9em\">$1</code>");
}

export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = prisma as any;

  let article: { id: string; title: string; bodyMd: string; createdAt: Date; viewedAt: Date | null } | null = null;
  try {
    article = await db.longAnswer?.findUnique({ where: { id } }) ?? null;
  } catch {
    article = null;
  }

  if (!article) {
    return (
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "32px 20px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", color: "#888", textAlign: "center" }}>
        <p style={{ fontSize: 48, marginBottom: 16 }}>📭</p>
        <p style={{ fontSize: 18 }}>Maqola topilmadi yoki muddati tugagan.</p>
      </div>
    );
  }

  try {
    await db.longAnswer?.update({
      where: { id },
      data: {
        viewCount: { increment: 1 },
        viewedAt: article.viewedAt ?? new Date(),
      },
    });
  } catch { /* non-critical */ }

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "32px 20px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", color: "#1a1a1a", fontSize: 16 }}>
      <div style={{ fontSize: 12, color: "#999", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
        <span>💡 Basyra AI</span>
        <span>·</span>
        <span>{new Date(article.createdAt).toLocaleDateString("uz-UZ", { day: "numeric", month: "long", year: "numeric" })}</span>
      </div>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 24, lineHeight: 1.3, color: "#111" }}>
        {article.title}
      </h1>
      <div style={{ lineHeight: 1.7, color: "#2d2d2d" }}>
        {renderMarkdown(article.bodyMd)}
      </div>
    </div>
  );
}
