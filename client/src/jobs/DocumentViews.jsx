const youtubeSearchUrl = (query) => `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;

export function ResumeView({ content }) {
  return (
    <div>
      {content.contactOmitted && (
        <p className="mb-3 text-sm text-slate-600">
          Your resume was uploaded as a file, so this draft has no name or contact details. Add your own header.
        </p>
      )}
      <pre className="whitespace-pre-wrap rounded bg-slate-50 p-4 font-sans text-sm text-slate-800">{content.text}</pre>
    </div>
  );
}

export function CoverNoteView({ content }) {
  const paragraphs = content.text.split(/\n{2,}/).filter(Boolean);
  return (
    <div>
      <div className="space-y-3 rounded bg-slate-50 p-4 text-sm text-slate-800">
        {paragraphs.map((p, i) => (
          <p key={i} className="whitespace-pre-wrap">{p}</p>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500">{content.wordCount} words</p>
    </div>
  );
}

export function PrepKitView({ content }) {
  return (
    <div className="space-y-6 text-sm text-slate-800">
      <section>
        <h3 className="mb-1 font-semibold">Role summary</h3>
        <p>{content.roleSummary}</p>
      </section>

      <section>
        <h3 className="mb-2 font-semibold">Likely interview questions</h3>
        <ol className="list-decimal space-y-3 pl-5">
          {content.likelyQuestions.map((q, i) => (
            <li key={i}>
              <p className="font-medium">{q.question}</p>
              <p className="text-slate-600">{q.answerApproach}</p>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h3 className="mb-2 font-semibold">Technical topics to review</h3>
        <ul className="space-y-3">
          {content.technicalTopics.map((t, i) => (
            <li key={i}>
              <p className="font-medium">{t.topic}</p>
              <ul className="mt-1 space-y-1 text-slate-600">
                {t.youtubeQueries.map((q, j) => (
                  <li key={j}>
                    YouTube search: <span className="font-mono text-xs">{q}</span>{" "}
                    <a
                      href={youtubeSearchUrl(q)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:underline"
                    >
                      Search
                    </a>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-500">
          These are search phrases, not video links. The "Search" link opens YouTube's own search results.
        </p>
      </section>

      <section>
        <h3 className="mb-2 font-semibold">Questions to ask the interviewer</h3>
        <ol className="list-decimal space-y-1 pl-5">
          {content.questionsToAsk.map((q, i) => (
            <li key={i}>{q}</li>
          ))}
        </ol>
      </section>
    </div>
  );
}
