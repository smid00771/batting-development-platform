# Stats setup heading placement — .368

Move the approved Stats setup control onto the Season stats heading row at the position marked by the user. Season dates remain immediately beneath the heading. Keep Close stats at the far edge; on phones it shares the dates row so the title and setup control remain together.

An ordinary keyboard-accessible button now controls the existing setup panel using aria-expanded, aria-controls and hidden. Preserve drafts, saved setup, dates, role checks and all statistics behavior. Update the existing setup/save test to exercise opening, closing and accessible state before editing.

The Season stats UI and shared delivered-demo suites pass all 40 tests. The focused expanded-state/save test also passes. Demo build freshness and whitespace checks pass; no database changes. Only the application entry point and changed panel move to .368.
