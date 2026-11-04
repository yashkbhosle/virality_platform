import { ScriptWriter } from "@/components/script/script-writer";

type Params = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v) || undefined;
}

export default async function ScriptWriterPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  return <ScriptWriter videoUrl={first(sp.videoUrl)} hook={first(sp.hook)} topic={first(sp.topic)} />;
}
