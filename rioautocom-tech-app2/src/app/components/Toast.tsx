import React from "react";
type ToastType = "info" | "error" | "success";

export function useToast() {
  const [msg, setMsg] = React.useState<{ type: ToastType; text: string } | null>(null);
  const show = (text: string, type: ToastType = "info") => { setMsg({ text, type }); window.setTimeout(() => setMsg(null), 3500); };

  const Toast = () => msg ? (
    <div style={{ position:"fixed", bottom:16, left:16, right:16, zIndex:9999, maxWidth:680, margin:"0 auto" }}>
      <div style={{
        padding:"12px 14px", borderRadius:16,
        border:"1px solid rgba(255,255,255,0.14)",
        background: msg.type==="error" ? "rgba(255,77,79,0.14)" : msg.type==="success" ? "rgba(46,204,113,0.14)" : "rgba(11,95,255,0.14)",
        backdropFilter:"blur(10px)", color:"white", fontWeight:650
      }}>{msg.text}</div>
    </div>
  ) : null;

  return { show, Toast };
}
