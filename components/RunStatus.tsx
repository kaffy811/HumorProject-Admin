export function RunStatus({ run }: { run: { status: string; failure_stage: string | null } }) {
  if (run.status === "completed") return <span className="badge badge-good">Completed</span>;
  if (run.status === "failed") return <span className="badge badge-bad">Failed{run.failure_stage ? ` · ${run.failure_stage}` : ""}</span>;
  return <span className="badge badge-warn">{run.status}</span>;
}
