import { revokeAdmin } from "@/lib/request-actions";
import { ConfirmButton } from "./ConfirmButton";
export function RemoveAdmin({ id, name }: { id: string; name: string }) {
  return (
    <form action={revokeAdmin}>
      <input type="hidden" name="id" value={id} />
      <ConfirmButton message={`Remove ${name}'s admin access? They are signed out of the console immediately and would need to request access again.`}>Remove admin</ConfirmButton>
    </form>
  );
}
