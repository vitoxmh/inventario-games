"use client"

import { Progress as ProgressPrimitive } from "@base-ui/react/progress"
import { cn, type UiProps } from "@/lib/utils"

function Progress({
  className,
  children,
  value,
  ...props
}: UiProps<ProgressPrimitive.Root.Props>) {
  return (
    <ProgressPrimitive.Root
      value={value}
      data-slot="progress"
      className={cn("progress", className)}
      {...props}
    >
      {children}
      <ProgressTrack>
        <ProgressIndicator />
      </ProgressTrack>
    </ProgressPrimitive.Root>
  )
}

function ProgressTrack({ className, ...props }: UiProps<ProgressPrimitive.Track.Props>) {
  return (
    <ProgressPrimitive.Track
      className={cn("progress__track", className)}
      data-slot="progress-track"
      {...props}
    />
  )
}

function ProgressIndicator({
  className,
  ...props
}: UiProps<ProgressPrimitive.Indicator.Props>) {
  return (
    <ProgressPrimitive.Indicator
      data-slot="progress-indicator"
      className={cn("progress__indicator", className)}
      {...props}
    />
  )
}

function ProgressLabel({ className, ...props }: UiProps<ProgressPrimitive.Label.Props>) {
  return (
    <ProgressPrimitive.Label
      className={cn("progress__label", className)}
      data-slot="progress-label"
      {...props}
    />
  )
}

function ProgressValue({ className, ...props }: UiProps<ProgressPrimitive.Value.Props>) {
  return (
    <ProgressPrimitive.Value
      className={cn("progress__value", className)}
      data-slot="progress-value"
      {...props}
    />
  )
}

export {
  Progress,
  ProgressTrack,
  ProgressIndicator,
  ProgressLabel,
  ProgressValue,
}
