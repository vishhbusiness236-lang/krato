"use client";

import { useState } from "react";

type Answer = "yes" | "somewhat" | "no";

export default function ReportFeedback({ scanId }: { scanId?: string }) {
  const [useful, setUseful] = useState<Answer | null>(null);
  const [comment, setComment] = useState("");
  const [contact, setContact] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState("");

  async function submit() {
    if (!useful) return;
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanId, useful, comment, contact }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <div className="mt-8 border-2 border-black bg-white p-4 shadow-[4px_4px_0_0_#000]">
        <p className="font-bold">Thanks. Every reply gets read by me.</p>
      </div>
    );
  }

  return (
    <div className="mt-8 border-2 border-black bg-white p-4 shadow-[4px_4px_0_0_#000]">
      <p className="font-bold">Was this report useful?</p>

      <div className="mt-2 flex gap-2">
        {(["yes", "somewhat", "no"] as Answer[]).map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setUseful(a)}
            className={`border-2 border-black px-3 py-1 text-sm font-bold ${
              useful === a ? "bg-black text-white" : "bg-white"
            }`}
          >
            {a}
          </button>
        ))}
      </div>

      {useful && (
        <>
          <label className="mt-4 block text-sm font-bold">
            What was missing, wrong or noisy? (optional)
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            className="mt-1 w-full border-2 border-black p-2"
          />

          <label className="mt-3 block text-sm font-bold">
            Email or X handle, if you want a reply (optional)
          </label>
          <input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            className="mt-1 w-full border-2 border-black p-2"
          />

          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

          <button
            onClick={submit}
            disabled={status === "loading"}
            className="mt-3 border-2 border-black bg-black px-4 py-2 font-bold text-white disabled:opacity-50"
          >
            {status === "loading" ? "Sending..." : "Send"}
          </button>
        </>
      )}
    </div>
  );
}