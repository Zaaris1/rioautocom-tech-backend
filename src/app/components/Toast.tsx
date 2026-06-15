import React from "react";

type ToastType = "info" | "error" | "success";

function toText(v: unknown): string {
  if (typeof v === "string") return v;
  if (v instanceof Error) return v.message || "Erro";
  if (v == null) return "";
  try {
    if (typeof v === "object") return JSON.stringify(v);
  } catch {
    // ignore
  }
  return String(v);
}

export function useToast() {
  const [msg, setMsg] = React.useState<{ type: ToastType; text: string } | null>(null);
  const timeoutRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const show = React.useCallback((text: unknown, type: ToastType = "info") => {
    const safe = toText(text) || (type === "error" ? "Erro" : "OK");

    setMsg({ text: safe, type });

    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = window.setTimeout(() => {
      setMsg(null);
      timeoutRef.current = null;
    }, 3500);
  }, []);

  const Toast = React.useCallback(
    () =>
      msg ? (
        <div
          style={{
            position: "fixed",
            bottom: 16,
            left: 16,
            right: 16,
            zIndex: 9999,
            maxWidth: 680,
            margin: "0 auto",
          }}
        >
          <div
            style={{
              padding: "12px 14px",
              borderRadius: 16,
              border: "1px solid rgba(255,255,255,0.14)",
              background:
                msg.type === "error"
                  ? "rgba(255,77,79,0.14)"
                  : msg.type === "success"
                  ? "rgba(46,204,113,0.14)"
                  : "rgba(194,128,51,0.16)",
              backdropFilter: "blur(10px)",
              color: "white",
              fontWeight: 650,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {msg.text}
          </div>
        </div>
      ) : null,
    [msg]
  );

  return { show, Toast };
}
