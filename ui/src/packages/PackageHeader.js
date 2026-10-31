// The package page's header band: the name, its groups and cards, one line
// of numbers in words, each with a tip, and a red badge when its rules are
// broken.

import React from "react"
import { DetailHeader } from "../components/kit/DetailHeader.js"
import { HoverInfo } from "../components/kit/HoverInfo.js"
import { hasData } from "../utils/dataKinds.js"
import { headerLine, packageProblems, packageSubtitle } from "./packagePageModel.js"

// PackageHeader is the package page's header. info is the cube's info, which
// says whether it records results for the win rate. actions are buttons for
// the header's right side, such as Edit and Delete.
export function PackageHeader({ page, info, actions }) {
  const items = headerLine(page, hasData(info, "results"))
  const problems = packageProblems(page.map)
  const tags = []
  if (page.stat.rarelyTogether) {
    tags.push("Rarely comes together")
  }
  return (
    <DetailHeader title={page.name} subtitle={packageSubtitle(page)} tags={tags} actions={actions}>
      <div className="package-line">
        {problems.length > 0 && (
          <HoverInfo title="Broken rules" info={<div>{problems.map(p => <div key={p}>{p}</div>)}</div>}>
            <span className="package-problem">{problems.length === 1 ? "1 problem" : `${problems.length} problems`}</span>
          </HoverInfo>
        )}
        {items.map((item, i) => (
          <span key={item.key}>
            {i > 0 && <span className="package-line-dot">·</span>}
            <HoverInfo info={item.tip}>
              <span className="package-line-item">{item.text}</span>
            </HoverInfo>
          </span>
        ))}
      </div>
    </DetailHeader>
  )
}
