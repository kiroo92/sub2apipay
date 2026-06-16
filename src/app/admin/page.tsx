import { redirect } from 'next/navigation';

export default async function AdminHome({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (Array.isArray(value)) {
      if (value[0]) qs.set(key, value[0]);
    } else if (value) {
      qs.set(key, value);
    }
  }
  redirect(`/admin/duanwu?${qs.toString()}`);
}
