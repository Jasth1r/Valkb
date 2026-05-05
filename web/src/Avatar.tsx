import { useState } from "react"

type Props = {
  src: string
  name: string
  hasReal: boolean
  className?: string
}

function Placeholder({ className }: { className?: string }) {
  return (
    <div
      className={`flex items-center justify-center bg-gray-300 ${className ?? ""}`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 100 100"
        className="h-3/4 w-3/4 text-white"
        fill="currentColor"
      >
        <circle cx="50" cy="36" r="20" />
        <path d="M14 92 C14 70, 30 60, 50 60 S86 70, 86 92 Z" />
      </svg>
    </div>
  )
}

export default function Avatar({ src, name, hasReal, className }: Props) {
  const [errored, setErrored] = useState(false)
  if (!hasReal || errored) return <Placeholder className={className} />
  return (
    <img
      src={src}
      alt={name}
      className={`object-cover bg-gray-100 ${className ?? ""}`}
      onError={() => setErrored(true)}
    />
  )
}
