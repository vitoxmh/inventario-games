"use client"

import * as React from "react"
import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar"
import { cn, type UiProps } from "@/lib/utils"

function Avatar({
  className,
  size = "default",
  ...props
}: UiProps<AvatarPrimitive.Root.Props> & {
  size?: "default" | "sm" | "lg"
}) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      data-size={size}
      className={cn(
        "avatar",
        size !== "default" && `avatar--${size}`,
        className,
      )}
      {...props}
    />
  )
}

function AvatarImage({ className, ...props }: UiProps<AvatarPrimitive.Image.Props>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("avatar__image", className)}
      {...props}
    />
  )
}

function AvatarFallback({
  className,
  ...props
}: UiProps<AvatarPrimitive.Fallback.Props>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn("avatar__fallback", className)}
      {...props}
    />
  )
}

function AvatarBadge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="avatar-badge"
      className={cn("avatar__badge", className)}
      {...props}
    />
  )
}

function AvatarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group"
      className={cn("avatar-group", className)}
      {...props}
    />
  )
}

function AvatarGroupCount({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group-count"
      className={cn("avatar-group__count", className)}
      {...props}
    />
  )
}

export {
  Avatar,
  AvatarImage,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarBadge,
}
