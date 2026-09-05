import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders Gemini output as markdown.
 *
 * react-markdown does not render raw HTML unless `rehype-raw` is added, which
 * it deliberately is not. Model output therefore cannot inject markup, and
 * `.md` in globals.css scopes the styling so it cannot restyle the app either.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="md text-sm leading-relaxed text-ink">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children: text, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">
              {text}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
