import { useEffect, useRef, useState } from "react";

export default function PlayerModal({ manifests = [] }: { manifests?: any[] }) {
  const [visible, setVisible] = useState(false);
  const slotRef = useRef<HTMLDivElement>(null);
  const playerCreated = useRef(false);

  useEffect(() => {
    const show = () => setVisible(true);
    const hide = () => setVisible(false);
    window.addEventListener("video.modal.show", show);
    window.addEventListener("video.modal.hide", hide);
    return () => {
      window.removeEventListener("video.modal.show", show);
      window.removeEventListener("video.modal.hide", hide);
    };
  }, []);

  const close = () => {
    window.dispatchEvent(new CustomEvent("video.player.hide"));
  };

  useEffect(() => {
    if (playerCreated.current) return;
    // Resolve the player via hook: find which plugin provides "video.player"
    const provider = manifests.find((m: any) =>
      m.hooks?.includes("video.player"),
    );
    if (!provider?.components?.[0] || !slotRef.current) return;
    const tag = provider.components[0];
    customElements.whenDefined(tag).then(() => {
      if (!slotRef.current?.isConnected) return;
      const el = document.createElement(tag);
      slotRef.current.appendChild(el);
      playerCreated.current = true;
    });
  }, []);

  return (
    <div className={`fixed inset-0 z-50 ${visible ? "" : "hidden"}`}>
      <div className="absolute inset-0 bg-black/80" />
      <button
        onClick={close}
        className="absolute top-4 right-4 z-10 px-4 py-2 bg-black/50 text-white text-sm rounded hover:bg-black/70"
      >
        Close
      </button>
      <div
        ref={slotRef}
        className="absolute inset-0 flex items-center justify-center"
      />
    </div>
  );
}
