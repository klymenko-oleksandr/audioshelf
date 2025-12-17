import { AdminUploadForm } from "@/components/admin-upload-form";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function AdminPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-screen-xl mx-auto px-4 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
            <p className="text-muted-foreground">Manage your audiobook library</p>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="outline">View Site</Button>
            </Link>
            <Link href="/api/admin/logout">
              <Button variant="ghost">Logout</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-4 py-8">
        <AdminUploadForm />
      </main>
    </div>
  );
}
