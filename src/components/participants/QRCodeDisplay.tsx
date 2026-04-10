"use client";

import { useEffect, useState } from "react";
import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { generateQRDataURL, downloadQR } from "@/lib/qr/generate";

interface QRCodeDisplayProps {
  token: string;
  name: string;
  size?: number;
}

export function QRCodeDisplay({ token, name, size = 200 }: QRCodeDisplayProps) {
  const [dataUrl, setDataUrl] = useState<string>("");

  useEffect(() => {
    generateQRDataURL(token).then(setDataUrl);
  }, [token]);

  if (!dataUrl) return <div className="animate-pulse bg-gray-200 rounded-xl" style={{ width: size, height: size }} />;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="p-4 bg-white rounded-xl border-2 border-gray-200 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={dataUrl} alt={`QR code for ${name}`} width={size} height={size} />
      </div>
      <p className="text-sm font-medium text-gray-700 text-center">{name}</p>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => downloadQR(token, name)}>
          <Download size={14} /> Download
        </Button>
        <Button size="sm" variant="ghost" onClick={() => window.print()}>
          <Printer size={14} /> Print
        </Button>
      </div>
    </div>
  );
}
