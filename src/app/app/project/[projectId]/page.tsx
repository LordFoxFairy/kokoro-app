export default function ProjectPage() {
  // The app segment owns the single authenticated shell. Keeping this page as
  // an empty route leaf prevents a native project navigation from mounting a
  // second AppGate and re-running the session probe (the source of the rail
  // flash seen during route changes).
  return null
}
