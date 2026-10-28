// Shown when a catalog table does not exist yet in this database.
export function MissingTable({ table }: { table: string }) {
  return (
    <div className="notice notice-warn" role="status">
      <b className="mono">{table}</b> does not exist in this database yet. Apply <span className="mono">supabase/migrations/202610280001_admin_catalog.sql</span> from kaffy811/HumorProject, then reload.
    </div>
  );
}
