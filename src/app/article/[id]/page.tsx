import prisma from "@/lib/prisma";
import { ArticleActions } from "./ArticleActions";
import type { ReactNode } from "react";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

type Article = {
  id: string;
  title: string;
  summary: string | null;
  bodyMd: string;
  createdAt: Date;
  viewedAt: Date | null;
};

async function findArticle(id: string): Promise<Article | null> {
  try {
    return await prisma.longAnswer.findUnique({ where: { id } });
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const article = await findArticle(id);

  if (!article) {
    return { title: "Maqola topilmadi | Basyra AI" };
  }

  return {
    title: `${article.title} | Basyra AI`,
    description: article.summary ?? article.bodyMd.slice(0, 160),
    openGraph: {
      title: article.title,
      description: article.summary ?? article.bodyMd.slice(0, 160),
      type: "article",
    },
  };
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "\"": return "&quot;";
      case "'": return "&#39;";
      default: return char;
    }
  });
}

function inlineFormat(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function renderMarkdown(md: string): ReactNode {
  const lines = md.split("\n");
  const elements: ReactNode[] = [];
  let i = 0;
  let listItems: string[] = [];
  let listType: "ul" | "ol" | null = null;

  function flushList() {
    if (!listItems.length) return;
    if (listType === "ol") {
      elements.push(
        <ol key={`list-${i}`} className="my-5 list-decimal space-y-2 pl-6 marker:font-semibold marker:text-blue-500">
          {listItems.map((t, k) => <li key={k} dangerouslySetInnerHTML={{ __html: inlineFormat(t) }} />)}
        </ol>
      );
    } else {
      elements.push(
        <ul key={`list-${i}`} className="my-5 list-disc space-y-2 pl-6 marker:text-blue-500">
          {listItems.map((t, k) => <li key={k} dangerouslySetInnerHTML={{ __html: inlineFormat(t) }} />)}
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
      elements.push(<h2 key={i} className="mt-10 text-2xl font-bold tracking-tight text-gray-950" dangerouslySetInnerHTML={{ __html: inlineFormat(line.slice(3)) }} />);
    } else if (line.startsWith("# ")) {
      flushList();
      elements.push(<h2 key={i} className="mt-10 text-3xl font-black tracking-tight text-gray-950" dangerouslySetInnerHTML={{ __html: inlineFormat(line.slice(2)) }} />);
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
      elements.push(<div key={i} className="h-3" />);
    }
    // Normal paragraph line
    else {
      flushList();
      elements.push(<p key={i} className="my-4 leading-8 text-gray-800" dangerouslySetInnerHTML={{ __html: inlineFormat(line) }} />);
    }
    i++;
  }
  flushList();
  return <>{elements}</>;
}

function readingTime(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 180));
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("uz-UZ", { day: "numeric", month: "long", year: "numeric" });
}

export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const article = await findArticle(id);

  if (!article) {
    return (
      <div className="min-h-screen bg-gray-50 px-5 py-16 text-center text-gray-600">
        <div className="mx-auto max-w-md rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
          <p className="mb-4 text-5xl">📭</p>
          <h1 className="text-xl font-bold text-gray-950">Maqola topilmadi</h1>
          <p className="mt-2 text-sm leading-6">Havola noto&apos;g&apos;ri yoki maqola muddati tugagan bo&apos;lishi mumkin.</p>
        </div>
      </div>
    );
  }

  try {
    await prisma.longAnswer.update({
      where: { id },
      data: {
        viewCount: { increment: 1 },
        viewedAt: article.viewedAt ?? new Date(),
      },
    });
  } catch { /* non-critical */ }

  const minutes = readingTime(article.bodyMd);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#dbeafe,transparent_34rem),linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] px-4 py-5 text-gray-900 sm:px-6 sm:py-10">
      <article className="mx-auto max-w-3xl overflow-hidden rounded-[2rem] border border-white/70 bg-white shadow-xl shadow-blue-950/5">
        <header className="border-b border-gray-100 bg-white px-5 py-8 sm:px-10 sm:py-10">
          <div className="mb-5 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
            <span className="rounded-full bg-blue-50 px-3 py-1">Basyra AI</span>
            <span className="text-gray-300">•</span>
            <span className="text-gray-500">{formatDate(article.createdAt)}</span>
            <span className="text-gray-300">•</span>
            <span className="text-gray-500">{minutes} daqiqa o&apos;qiladi</span>
          </div>
          <h1 className="text-3xl font-black leading-tight tracking-tight text-gray-950 sm:text-5xl">
            {article.title}
          </h1>
          {article.summary ? (
            <p className="mt-5 border-l-4 border-blue-500 pl-4 text-lg leading-8 text-gray-600 sm:text-xl">
              {article.summary}
            </p>
          ) : null}
          <ArticleActions text={`${article.title}\n\n${article.summary ?? ""}\n\n${article.bodyMd}`} />
        </header>
        <div className="px-5 py-7 text-[17px] sm:px-10 sm:py-10 sm:text-lg [&_code]:rounded-md [&_code]:bg-gray-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.86em] [&_code]:font-semibold [&_strong]:font-bold [&_strong]:text-gray-950">
          {renderMarkdown(article.bodyMd)}
        </div>
        <footer className="border-t border-gray-100 bg-gray-50 px-5 py-5 text-sm text-gray-500 sm:px-10">
          Telegramdagi javobning to&apos;liq, o&apos;qishga qulay ko&apos;rinishi.
        </footer>
      </article>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          main { background: white !important; padding: 0 !important; }
          article { box-shadow: none !important; border: 0 !important; border-radius: 0 !important; }
        }
      `}</style>
    </main>
  );
}
