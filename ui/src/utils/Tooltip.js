import React from 'react'

export function ApplyTooltip(input){
    return(
      <div className="tooltip-trigger">
        {input.text}
        <span className='tooltip'>
          {input.hidden}
        </span>
      </div>
    )
}
