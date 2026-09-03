import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

// A tablet-friendly, in-browser QR scanner for the Donor Management check-in
// station — reads the device camera directly via getUserMedia + jsQR instead
// of relying on the OS's own camera app to recognize the code and hand off
// to a browser (which doesn't work at all on some locked-down/kiosk tablets,
// and even when it does, forces a full page reload every single scan).
//
// Stays open and keeps scanning after every decode, since a check-in station
// processes donors one after another — closing after each scan would mean
// staff reopening this for every single person in line. A short per-code
// cooldown stops the same still-in-frame code from re-triggering on
// consecutive frames before the donor has stepped away.
const RESCAN_COOLDOWN_MS = 4000;

export default function QrScannerModal({ onScan, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const lastScanRef = useRef({ text: null, at: 0 });
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const decoded = jsQR(imageData.data, imageData.width, imageData.height);
      if (decoded && decoded.data) {
        const now = Date.now();
        const last = lastScanRef.current;
        if (decoded.data !== last.text || now - last.at > RESCAN_COOLDOWN_MS) {
          lastScanRef.current = { text: decoded.data, at: now };
          onScan(decoded.data);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        rafRef.current = requestAnimationFrame(tick);
      } catch (err) {
        if (cancelled) return;
        setError(
          err.name === "NotAllowedError"
            ? "Camera access was denied. Allow camera permission for this site in your browser settings and try again."
            : "Couldn't access a camera on this device."
        );
      }
    }

    start();
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-[70] font-poppins">
      <div className="absolute inset-0 backdrop-blur-[7.5px] bg-[rgba(217,217,217,0.85)]" onClick={onClose} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-[16px] p-6 w-[440px] max-w-[92vw] flex flex-col items-center gap-4 shadow-xl">
        <div className="flex items-center justify-between w-full">
          <h3 className="font-poppins font-bold text-[17px] text-black">Scan Donor QR Pass</h3>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer text-[#808080] hover:text-black text-xl leading-none"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {error ? (
          <div className="w-full rounded-[12px] bg-[#fdecea] text-[#d70b07] text-[13px] font-medium p-4 text-center font-poppins">
            {error}
          </div>
        ) : (
          <div className="relative w-full aspect-square rounded-[12px] overflow-hidden bg-black">
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
            <div className="absolute inset-8 border-2 border-white/80 rounded-[12px] pointer-events-none" />
          </div>
        )}

        <canvas ref={canvasRef} className="hidden" />

        <p className="text-[12px] text-[#808080] text-center font-poppins">
          Point the camera at a donor's Digital Donor QR Pass. Stays open so you can check in the next donor right
          after.
        </p>
      </div>
    </div>
  );
}
