import QRCode from "qrcode";

export async function generateQRDataURL(token: string): Promise<string> {
  return QRCode.toDataURL(token, {
    errorCorrectionLevel: "H",
    margin: 2,
    width: 300,
    color: { dark: "#000000", light: "#ffffff" },
  });
}

export async function generateQRBuffer(token: string): Promise<Uint8Array> {
  const buf = await QRCode.toBuffer(token, {
    errorCorrectionLevel: "H",
    margin: 2,
    width: 400,
    color: { dark: "#000000", light: "#ffffff" },
  });
  return new Uint8Array(buf);
}

export async function downloadQR(token: string, name: string): Promise<void> {
  const dataUrl = await generateQRDataURL(token);
  const link = document.createElement("a");
  link.download = `qr-${name.replace(/\s+/g, "-").toLowerCase()}.png`;
  link.href = dataUrl;
  link.click();
}
