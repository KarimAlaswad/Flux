import { useEffect, useState } from "react"

export default function PlayerModal() {
  const [visible, setVisible] = useState(false)
  const [title, setTitle] = useState("")

  useEffect(() => {
    const show = (e: any) => {
      setTitle(e.detail?.title || "")
      setVisible(true)
    }
    const hide = () => {
      setVisible(false)
      setTitle("")
    }
    window.addEventListener("modal-load", show)
    window.addEventListener("modal-close", hide)
    return () => {
      window.removeEventListener("modal-load", show)
      window.removeEventListener("modal-close", hide)
    }
  }, [])

  if (!visible) return null

  const close = () => window.dispatchEvent(new CustomEvent("modal-close"))

  return (
    <div className="fixed inset-0 z-50">
      <button
        onClick={close}
        className="absolute top-4 right-4 z-10 px-4 py-2 bg-black/50 text-white text-sm rounded hover:bg-back/70"
      >
        Close
      </button>
      {title && (
        <div className="absolute top-4 left-4 z-10 px-3 py-1.5 bg-black/50 text-white text-sm rounded max-w-[60%] truncate">
          {title}
        </div>
      )}
    </div>
  )
}