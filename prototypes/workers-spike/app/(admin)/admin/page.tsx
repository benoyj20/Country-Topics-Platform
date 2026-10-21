import Link from "next/link";

import { NewTopicButton } from "./NewTopicButton";
import { accessNotice, BackendProblem } from "./notices";
import { adminAccess, isListOf, payloadGet } from "./payload";
import { isTopicRow } from "./topic-data";

export default async function AdminHome() {
  // The gate and the list together: the backend refuses the list to anyone
  // the gate would turn away.
  const [access, topics] = await Promise.all([
    adminAccess(),
    payloadGet(
      "/api/topics?draft=true&depth=0&limit=50&sort=-updatedAt" +
        "&select[title]=true&select[state]=true&select[_status]=true&select[updatedAt]=true",
      isListOf(isTopicRow),
    ),
  ]);
  const notice = accessNotice(access);
  if (notice) return notice;
  if (!topics.ok) {
    return <BackendProblem unreachable={topics.reason === "unreachable"} />;
  }
  return (
    <section>
      <div className="title-row">
        <h1>Topics</h1>
        <NewTopicButton />
      </div>
      <table className="list">
        <thead>
          <tr>
            <th scope="col">Title</th>
            <th scope="col">State</th>
            <th scope="col">Latest version</th>
            <th scope="col">Updated</th>
          </tr>
        </thead>
        <tbody>
          {topics.data.docs.map((topic) => (
            <tr key={topic.id}>
              <td>
                <Link href={`/admin/topics/${topic.id}`}>
                  {topic.title || "(untitled)"}
                </Link>
              </td>
              <td>{topic.state}</td>
              <td>{topic._status}</td>
              <td>
                {new Date(topic.updatedAt).toLocaleString("en-GB", {
                  timeZone: "UTC",
                })}{" "}
                UTC
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
