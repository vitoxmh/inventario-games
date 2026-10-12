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
      <div className="gallery">
        {images.map((url, imageIndex) => (
          <button
            key={url}
            type="button"
            onClick={() => openAt(imageIndex)}
            aria-label={dict.viewImage}
            className="gallery__item"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt=""
              className="gallery__thumb"
            />
          </button>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          size="fullscreen"
        >
          <DialogTitle className="u-sr-only">{dict.galleryTitle}</DialogTitle>

          <div className="lightbox__stage">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={images[index]}
              alt=""
              className="lightbox__image"
            />
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={dict.closeImage}
            onClick={() => setOpen(false)}
            className="lightbox__control lightbox__control--close"
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
                className="lightbox__control lightbox__control--prev"
              >
                <ChevronLeft aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={dict.next}
                onClick={() => setIndex((current) => (current + 1) % images.length)}
                className="lightbox__control lightbox__control--next"
              >
                <ChevronRight aria-hidden="true" />
              </Button>
            </>
          )}

          {images.length > 1 && (
            <p className="lightbox__counter">
              {index + 1} / {images.length}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}