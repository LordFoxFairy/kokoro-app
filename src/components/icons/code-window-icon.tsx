import type { SVGProps } from "react"

export function CodeWindowIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      data-slot="code-window-icon"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <path
        d="M15 1.5H3C2.17157 1.5 1.5 2.33947 1.5 3.375V14.625C1.5 15.6605 2.17157 16.5 3 16.5H15C15.8284 16.5 16.5 15.6605 16.5 14.625V3.375C16.5 2.33947 15.8284 1.5 15 1.5Z"
        stroke="currentColor"
        strokeWidth="1.60714"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2 5H16M7 9L5.5 10.5L7 12M11 9L12.5 10.5L11 12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
