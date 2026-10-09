import ReactMarkdown from 'react-markdown'

/**
 * Safe rendering of AI output: react-markdown does not render raw HTML by default, and links
 * open in a new tab without referrer/opener. Only http(s) links are kept.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-ai">
      <ReactMarkdown
        skipHtml
        urlTransform={(url) => (/^https?:\/\//i.test(url) ? url : '')}
        components={{
          a: ({ href, children: c }) => (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">
              {c}
            </a>
          ),
          img: () => null,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
