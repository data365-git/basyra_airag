import { cn } from "@/lib/utils";

interface TableProps {
  children: React.ReactNode;
  className?: string;
}

export function Table({ children, className }: TableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className={cn("w-full text-sm text-left", className)}>
        {children}
      </table>
    </div>
  );
}

export function Thead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="bg-gray-50 border-b border-gray-200">
      {children}
    </thead>
  );
}

export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={cn("px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap", className)}>
      {children}
    </th>
  );
}

export function Tbody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-gray-100 bg-white">{children}</tbody>;
}

export function Tr({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return (
    <tr
      className={cn(
        "transition-colors",
        onClick && "cursor-pointer hover:bg-gray-50",
        className
      )}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}

export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <td className={cn("px-4 py-3 text-gray-700", className)}>
      {children}
    </td>
  );
}

export function EmptyRow({ cols, message = "No data found" }: { cols: number; message?: string }) {
  return (
    <tr>
      <td colSpan={cols} className="text-center py-10 text-gray-400 text-sm">
        {message}
      </td>
    </tr>
  );
}
