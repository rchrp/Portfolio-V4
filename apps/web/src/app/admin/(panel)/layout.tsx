import { requireAdmin } from "@/lib/admin/session";
import { AdminTopbar } from "../_components/topbar";

export default async function PanelLayout({ children }: LayoutProps<"/admin">) {
  // Pages and actions check again: a layout does not re-run on navigation.
  await requireAdmin();
  return (
    <>
      <AdminTopbar />
      <main className="adm-main">{children}</main>
    </>
  );
}
