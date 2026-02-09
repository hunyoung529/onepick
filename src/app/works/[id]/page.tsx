import WorkDetailClient from './WorkDetailClient';

import type { ExternalWorkItem } from '@/lib/external-rankings';
import { getAnyNaverWorkByIdServer } from '@/lib/external-rankings-server';

type PageProps = {
  params: { id: string };
};

export const revalidate = 300;

export default async function WorkDetailPage({ params }: PageProps) {
  let initialWork: ExternalWorkItem | null = null;
  try {
    initialWork = await getAnyNaverWorkByIdServer(params.id);
  } catch {
    initialWork = null;
  }

  return <WorkDetailClient id={params.id} initialWork={initialWork} />;
}
