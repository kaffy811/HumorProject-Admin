import { redirect } from "next/navigation";
// Individual votes now live in the activity log.
export default function Page() { redirect("/activity?action=cat:reaction"); }
