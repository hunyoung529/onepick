import { redirect } from 'next/navigation';

type PageProps = {
  params: { id: string };
};

export default function LegacyWorkRedirectPage({ params }: PageProps) {
  redirect(`/works/${params.id}`);
}
