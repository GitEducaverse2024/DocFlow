import { redirect } from 'next/navigation';

export default function ProjectDetailRedirect({ params }: { params: { id: string } }) {
  redirect(`/catbrains/${params.id}`);
}
