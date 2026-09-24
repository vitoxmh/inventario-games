"use client"

import { useEffect, useState } from "react"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
import type { Dictionary } from "@/messages/es"

type InventoryDict = Dictionary["inventory"]

export function ImageLightbox({
  images,
  dict,
}: {
  images: string[]
  dict: InventoryDict
}) {
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") {
        setIndex((current) => (current === 0 ? images.length - 1 : current - 1))
      } else if (event.key === "ArrowRight") {
        setIndex((current) => (current + 1) % images.length)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, images.length])

  function openAt(next: number) {
    setIndex(next)
    setOpen(true)
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {images.map((url, imageIndex) => (
          <button
            key={url}
            type="button"
            onClick={() => openAt(imageIndex)}
            aria-label={dict.viewImage}
            className="group overflow-hidden rounded-lg border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt=""
              className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          </button>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="h-screen w-screen max-w-none gap-0 overflow-hidden bg-black/95 p-0 ring-0 sm:max-w-none"
        >
          <DialogTitle className="sr-only">{dict.galleryTitle}</DialogTitle>

          <div className="flex h-full items-center justify-center px-16">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={images[index]}
              alt=""
              className="max-h-[85vh] max-w-full rounded-lg object-contain"
            />
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={dict.closeImage}
            onClick={() => setOpen(false)}
            className="absolute top-3 right-3 text-white hover:bg-white/10 hover:text-white"
          >
            <X aria-hidden="true" />
          </Button>

          {images.length > 1 && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={dict.prev}
                onClick={() =>
                  setIndex((current) =>
                    current === 0 ? images.length - 1 : current - 1,
                  )
                }
                className="absolute top-1/2 left-3 -translate-y-1/2 text-white hover:bg-white/10 hover:text-white"
              >
                <ChevronLeft aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={dict.next}
                onClick={() => setIndex((current) => (current + 1) % images.length)}
                className="absolute top-1/2 right-3 -translate-y-1/2 text-white hover:bg-white/10 hover:text-white"
              >
                <ChevronRight aria-hidden="true" />
              </Button>
            </>
          )}

          {images.length > 1 && (
            <p className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs text-white">
              {index + 1} / {images.length}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}