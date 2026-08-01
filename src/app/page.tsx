import { redirect } from 'next/navigation';

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const lang = Array.isArray(params?.lang) ? params?.lang[0] : params?.lang;
  redirect(lang === 'en' ? '/lottery?lang=en' : '/lottery');
}
