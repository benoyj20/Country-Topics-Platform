import Link from "next/link";
import { notFound } from "next/navigation";

import { accessNotice, BackendProblem } from "../../notices";
import {
  adminAccess,
  backendOrigin,
  isListOf,
  payloadGet,
} from "../../payload";
import {
  type EditableTopic,
  isCountryOption,
  isEditableTopic,
} from "../../topic-data";
import { TopicForm } from "./TopicForm";

export default async function EditTopic({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // The gate and the reads together: the backend refuses the reads to
  // anyone the gate would turn away.
  const [access, topic, countries] = await Promise.all([
    adminAccess(),
    payloadGet(
      `/api/topics/${encodeURIComponent(id)}?draft=true&depth=0`,
      isEditableTopic,
    ),
    payloadGet(
      "/api/countries?pagination=false&depth=0&sort=name&select[name]=true",
      isListOf(isCountryOption),
    ),
  ]);
  const notice = accessNotice(access);
  if (notice) return notice;
  if (!topic.ok && topic.reason === "hidden") notFound();
  if (!topic.ok || !countries.ok) {
    const unreachable = [topic, countries].some(
      (read) => !read.ok && read.reason === "unreachable",
    );
    return <BackendProblem unreachable={unreachable} />;
  }
  const loaded = topic.data;
  // Only the fields the form shows reach the browser.
  const editable: EditableTopic = {
    id: loaded.id,
    title: loaded.title,
    summary: loaded.summary,
    slug: loaded.slug,
    body: loaded.body,
    countries: loaded.countries,
    changeNote: loaded.changeNote,
    _status: loaded._status,
    state: loaded.state,
    firstPublishedAt: loaded.firstPublishedAt,
  };
  return (
    <section>
      <p>
        <Link href="/admin">← Topics</Link>
      </p>
      <h1>{loaded.title || "(untitled)"}</h1>
      <TopicForm
        topic={editable}
        countries={countries.data.docs.map(({ id, name }) => ({ id, name }))}
        siteOrigin={backendOrigin()}
      />
    </section>
  );
}
