import React from "react"
import { Skeleton } from "@mantine/core"
import { EmptyState } from "../components/kit/EmptyState.js"

// BlockBody picks what a cube home block shows, in this order: the reason when
// the cube lacks the block's data, an error line when its request failed, a
// loading placeholder while value is undefined, and otherwise render(value).
// render is a function so it only runs once the value exists.
export function BlockBody({ state, value, error, errorText, loadingHeight = 120, render }) {
  if (!state.available) {
    return <EmptyState>{state.reason}</EmptyState>
  }
  if (error) {
    return <EmptyState>{errorText}</EmptyState>
  }
  if (value === undefined) {
    return <Skeleton height={loadingHeight} radius="md" />
  }
  return render(value)
}
