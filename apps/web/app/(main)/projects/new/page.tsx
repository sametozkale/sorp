import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function NewProjectPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=%2Fprojects%2Fnew");
  }

  const { data: created, error } = await supabase
    .from("projects")
    .insert({ title: "New component" })
    .select("id")
    .single();

  if (error || !created?.id) {
    redirect("/projects");
  }

  redirect(`/projects/${created.id}`);
}
