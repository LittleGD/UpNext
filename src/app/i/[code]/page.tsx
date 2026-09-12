import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { duoInviteCode, duoInviteURL } from "@/lib/duoInviteLink";
import DuoInviteLanding from "@/components/flame/DuoInviteLanding";
type Props = { params: Promise<{ code: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const code = duoInviteCode((await params).code);
  return {
    title: "2인 불꽃 초대 · UpNext",
    robots: { index: false, follow: false },
    description: "친구와 오늘의 불꽃을 켜세요.",
    openGraph: {
      title: "2인 불꽃 초대 · UpNext",
      description: "친구와 오늘의 불꽃을 켜세요.",
    },
    itunes: code
      ? { appId: "6762550135", appArgument: duoInviteURL(code) }
      : undefined,
  };
}
export default async function Page({ params }: Props) {
  const code = duoInviteCode((await params).code);
  if (!code) notFound();
  return <DuoInviteLanding key={code} code={code} />;
}
