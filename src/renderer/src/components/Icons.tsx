import type { JSX, ReactNode } from 'react'

const Svg = ({ children }: { children: ReactNode }): JSX.Element => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
)

export const InfoIcon = (): JSX.Element => (
  <Svg>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </Svg>
)

export const MinimizeIcon = (): JSX.Element => (
  <Svg>
    <path d="M6 12h12" />
  </Svg>
)

export const CloseIcon = (): JSX.Element => (
  <Svg>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
)

export const PowerIcon = (): JSX.Element => (
  <Svg>
    <path d="M12 3v8" />
    <path d="M6.3 7.3a8 8 0 1 0 11.4 0" />
  </Svg>
)

export const NewPageIcon = (): JSX.Element => (
  <Svg>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
    <path d="M14 3v6h6M12 13v6M9 16h6" />
  </Svg>
)

export const GitHubIcon = (): JSX.Element => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.26 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5z" />
  </svg>
)
